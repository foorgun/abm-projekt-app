// Edge Function extract-project: liest Seite 1 (und optional die Plan-Seite) eines Vertrags mit einem Bildmodell aus
// und liefert je Feld {wert, quelle, sicherheit}. Einrichtung: docs/vertrag-extraktion.md.
//
// Sicherheit:
//   * Der Schlüssel zum KI-Dienst (ANTHROPIC_API_KEY) liegt nur hier als Secret, nie im Frontend.
//   * Aufrufen darf nur, wer angemeldet ist und in user_roles die Rolle admin oder mitarbeiter hat.
//   * EXTRACTOR_ENABLED muss "true" sein (Standard: aus). Vorher geht kein Bild an den KI-Dienst.
//   * Kostenbremse über die Tabelle extraction_log (Limits je Person, je Tag, Monatsbudget).
//   * Im Protokoll und in den Logs stehen nur Zähler (Zeit, Modell, Tokens, Kosten), nie Bilder oder Inhalte.

import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiErrorInfo,
  checkLimits,
  DEFAULT_MODEL,
  describeImages,
  estimateCostEur,
  isEnabled,
  limitsFromEnv,
  MAX_TOKENS,
  outputConfig,
  parseRequest,
  periodStarts,
  SYSTEM_PROMPT,
  TIMEOUT_MS,
  toResponse,
  type Failure,
} from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: Failure["code"], message: string, status: number) => json({ ok: false, code, message } satisfies Failure, status);
const env = (name: string) => Deno.env.get(name);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("error", "Nur POST.", 405);

  // --- Anmeldung und Rolle ---------------------------------------------------------------------------
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return fail("forbidden", "Nicht angemeldet.", 401);
  const admin = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return fail("forbidden", "Nicht angemeldet.", 401);
  const userId = auth.user.id;
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (role?.role !== "admin" && role?.role !== "mitarbeiter") return fail("forbidden", "Keine Berechtigung für diese Aktion.", 403);

  // --- Schalter ----------------------------------------------------------------------------------------
  if (!isEnabled(env("EXTRACTOR_ENABLED"))) return fail("disabled", "Auslesung noch nicht freigeschaltet.", 503);
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return fail("disabled", "Auslesung noch nicht freigeschaltet (Schlüssel fehlt).", 503);

  // --- Eingabe ---------------------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("error", "Ungültiger Aufruf.", 400);
  }
  const parsed = parseRequest(body);
  if (!parsed.ok) return json(parsed, 400);

  // --- Kostenbremse: zählen, bevor irgendetwas an den KI-Dienst geht -----------------------------------
  const model = env("EXTRACTOR_MODEL")?.trim() || DEFAULT_MODEL;
  const { day, month } = periodStarts(new Date());
  const [userToday, totalToday, monthRows] = await Promise.all([
    admin.from("extraction_log").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("at", day),
    admin.from("extraction_log").select("id", { count: "exact", head: true }).gte("at", day),
    admin.from("extraction_log").select("cost_eur").gte("at", month),
  ]);
  if (userToday.error || totalToday.error || monthRows.error) {
    console.error("extraction_log nicht lesbar");
    return fail("error", "Die Auslesung ist gerade nicht verfügbar (Protokoll nicht lesbar).", 500);
  }
  const monthCostEur = (monthRows.data ?? []).reduce((sum, r) => sum + Number(r.cost_eur ?? 0), 0);
  const blocked = checkLimits({ userToday: userToday.count ?? 0, totalToday: totalToday.count ?? 0, monthCostEur }, limitsFromEnv(env));
  if (blocked) return json(blocked, 429);

  // Platz im Protokoll belegen, damit gleichzeitige Aufrufe mitzählen; Tokens und Kosten folgen nach dem Aufruf
  const reserved = await admin.from("extraction_log").insert({ user_id: userId, model, images: parsed.images.length, ok: false }).select("id").single();
  if (reserved.error) {
    console.error("extraction_log nicht schreibbar");
    return fail("error", "Die Auslesung ist gerade nicht verfügbar (Protokoll nicht schreibbar).", 500);
  }

  // --- Aufruf des Bildmodells --------------------------------------------------------------------------
  // Nur Maße und Größe der Bilder ins Log (hilft bei abgelehnten Anfragen), nie der Inhalt
  console.info(`Auslesung: Modell ${model}, ${parsed.images.length} Bild(er): ${describeImages(parsed.images)}`);
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      // JSON-Schema immer; "effort" nur bei Modellen, die den Parameter kennen (logic.ts)
      output_config: outputConfig(model),
      messages: [
        {
          role: "user",
          content: [
            ...parsed.images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } })),
            { type: "text" as const, text: parsed.images.length > 1 ? "Bild 1 ist Seite 1 des Vertrags, Bild 2 die Plan-Seite (für den Haustyp). Fülle die Felder." : "Das Bild ist Seite 1 des Vertrags. Fülle die Felder." },
          ],
        },
      ],
    });

    const inputTokens = response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
    const outputTokens = response.usage.output_tokens;
    const cost = estimateCostEur(model, inputTokens, outputTokens, Number(env("EXTRACTOR_USD_EUR")) || 1);
    const usable = response.stop_reason === "end_turn";
    await admin.from("extraction_log").update({ input_tokens: inputTokens, output_tokens: outputTokens, cost_eur: cost, ok: usable }).eq("id", reserved.data.id);

    if (response.stop_reason === "refusal") return fail("error", "Das Dokument konnte nicht ausgelesen werden. Bitte von Hand ausfüllen.", 200);
    if (response.stop_reason === "max_tokens") return fail("error", "Die Auslesung wurde abgeschnitten. Bitte von Hand ausfüllen.", 200);
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return fail("error", "Die Auslesung lieferte kein Ergebnis.", 200);
    let raw: unknown;
    try {
      raw = JSON.parse(text.text);
    } catch {
      return fail("error", "Die Auslesung lieferte kein verwertbares Ergebnis.", 200);
    }
    return json(toResponse(raw));
  } catch (error) {
    // Ins Log kommen nur Status, Fehlertyp und Meldung des KI-Dienstes (nennen Parameter und Grund), nie Inhalte.
    // Die Bildmaße stehen in der Zeile "Auslesung: …" darüber.
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      console.error("KI-Dienst: Zeitüberschreitung");
      return fail("error", "Die Auslesung hat zu lange gedauert. Bitte erneut versuchen oder von Hand anlegen.", 504);
    }
    if (error instanceof Anthropic.APIError) {
      const info = apiErrorInfo(error);
      console.error(`KI-Dienst: Fehler ${error.status ?? "ohne Status"} · ${info.type} · ${info.message}`);
      if (error instanceof Anthropic.AuthenticationError) return fail("disabled", "Auslesung noch nicht freigeschaltet (Schlüssel ungültig).", 503);
      if (error instanceof Anthropic.RateLimitError) return fail("limit", "Der KI-Dienst ist gerade ausgelastet. Bitte in ein paar Minuten erneut versuchen oder von Hand anlegen.", 429);
      if (error instanceof Anthropic.BadRequestError) {
        return fail("error", `Der KI-Dienst hat die Anfrage abgelehnt (${info.type}). Einzelheiten stehen im Log der Funktion. Bitte von Hand anlegen.`, 502);
      }
      return fail("error", "Die Auslesung ist fehlgeschlagen. Bitte von Hand anlegen.", 502);
    }
    console.error("Unerwarteter Fehler bei der Auslesung");
    return fail("error", "Die Auslesung ist fehlgeschlagen. Bitte von Hand anlegen.", 500);
  }
});
