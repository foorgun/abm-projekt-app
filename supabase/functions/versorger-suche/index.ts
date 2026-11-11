// Edge Function versorger-suche: schlägt zum Bauort Genehmigungsbehörde (Bauamt), Wasserversorger, Abwasser und
// Stromnetzbetreiber vor. Eine KI (Anthropic) recherchiert mit Websuche auf offiziellen Seiten. Der Mitarbeiter bestätigt
// immer; übernommen wird nur, was er anklickt (Planungsprotokoll, „Angaben für Seite 1“).
//
// Aufruf: { plz, ort, ortsteil?, bundesland? } → { ok, vorschlaege: { bauamt?, wasser?, abwasser?, strom? }, gespeichert, abgerufenAm }
//
//   * An den KI-Dienst gehen nur PLZ, Ort, Ortsteil und Bundesland (keine Namen, keine Straße).
//   * Der Schlüssel (ANTHROPIC_API_KEY) liegt nur hier als Secret. Abschalten: VERSORGER_SUCHE_ENABLED=false.
//   * Zwischenspeicher (Migration 0030): gleicher Ort innerhalb von 180 Tagen geht nicht erneut hinaus (nur vollständige Ergebnisse).
//   * Höchstens 20 Suchen je Person und Tag (Tabelle versorger_abrufe, mit Tokens und Kosten).
// Aufrufen darf nur, wer angemeldet ist und in user_roles die Rolle admin oder mitarbeiter hat.

import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  antwortLesen,
  cacheGrenze,
  cacheSchluessel,
  DEFAULT_MODEL,
  frage,
  kostenEur,
  MAX_ABRUFE_PRO_TAG,
  MAX_SUCHEN,
  parseAnfrage,
  speichern,
  SYSTEM,
  tagesbeginn,
  TIMEOUT_MS,
  type Antwort,
  type Fehler,
} from "./logic.ts";
import { serviceKey } from "../_shared/serviceKey.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: Fehler["code"], message: string, status: number) => json({ ok: false, code, message } satisfies Fehler, status);
const env = (name: string) => Deno.env.get(name);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("error", "Nur POST.", 405);

  // --- Anmeldung und Rolle ---------------------------------------------------------------------------
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return fail("forbidden", "Nicht angemeldet.", 401);
  const admin = createClient(env("SUPABASE_URL")!, serviceKey(env)!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return fail("forbidden", "Nicht angemeldet.", 401);
  const userId = auth.user.id;
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (role?.role !== "admin" && role?.role !== "mitarbeiter") return fail("forbidden", "Keine Berechtigung für diese Aktion.", 403);

  // --- Schalter --------------------------------------------------------------------------------------
  if (env("VERSORGER_SUCHE_ENABLED")?.trim().toLowerCase() === "false") return fail("disabled", "Die Suche ist abgeschaltet. Bitte von Hand eintragen.", 503);
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return fail("disabled", "Die Suche ist noch nicht eingerichtet (Schlüssel fehlt). Bitte von Hand eintragen.", 503);

  // --- Eingabe ---------------------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid", "Ungültiger Aufruf.", 400);
  }
  const parsed = parseAnfrage(body);
  if (!parsed.ok) return json(parsed, 400);
  const anfrage = parsed.anfrage;
  const schluessel = cacheSchluessel(anfrage);
  const now = new Date();

  try {
    // --- Zwischenspeicher ------------------------------------------------------------------------------
    const cached = await admin.from("versorger_suche").select("vorschlaege, abgerufen_am").eq("schluessel", schluessel).gte("abgerufen_am", cacheGrenze(now)).maybeSingle();
    if (cached.data) return json({ ok: true, vorschlaege: cached.data.vorschlaege, gespeichert: true, abgerufenAm: cached.data.abgerufen_am } satisfies Antwort);

    // --- Tageslimit: zählen und Platz belegen, bevor etwas an den KI-Dienst geht -------------------------
    const { count, error: countError } = await admin.from("versorger_abrufe").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("at", tagesbeginn(now));
    if (countError) throw new Error("versorger_abrufe nicht lesbar");
    if ((count ?? 0) >= MAX_ABRUFE_PRO_TAG) return fail("limit", `Für heute sind deine ${MAX_ABRUFE_PRO_TAG} Suchen aufgebraucht. Bitte von Hand eintragen oder morgen erneut suchen.`, 429);
    const model = env("VERSORGER_MODEL")?.trim() || DEFAULT_MODEL;
    const log = await admin.from("versorger_abrufe").insert({ user_id: userId, model, ok: false }).select("id").single();
    if (log.error) throw new Error("versorger_abrufe nicht schreibbar");

    // --- KI mit Websuche -------------------------------------------------------------------------------
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: frage(anfrage) }];
    const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_SUCHEN, user_location: { type: "approximate", country: "DE" } }] as unknown as Anthropic.Messages.ToolUnion[];
    let input = 0;
    let output = 0;
    let suchen = 0;
    let text = "";
    // Lange Recherchen pausiert der Dienst (pause_turn): dann mit dem bisherigen Stand weiter, höchstens dreimal
    for (let runde = 0; runde < 4; runde++) {
      const res = await client.messages.create({ model, max_tokens: 16000, system: SYSTEM, messages, tools, output_config: { effort: "medium" } } as Anthropic.MessageCreateParamsNonStreaming);
      input += res.usage.input_tokens;
      output += res.usage.output_tokens;
      suchen += (res.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      if (res.stop_reason === "refusal") break;
      text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      break;
    }
    const vorschlaege = antwortLesen(text);
    await admin
      .from("versorger_abrufe")
      .update({ input_tokens: input, output_tokens: output, suchen, cost_eur: kostenEur(model, input, output, suchen, Number(env("EXTRACTOR_USD_EUR")) || 1), ok: !!vorschlaege })
      .eq("id", log.data.id);
    if (!vorschlaege) {
      console.error("Versorger-Suche: Antwort nicht lesbar");
      return fail("nicht_lesbar", "Die Suche hat kein lesbares Ergebnis geliefert. Bitte erneut versuchen oder von Hand eintragen.", 502);
    }
    // Nur vollständige Ergebnisse speichern: Fehlt eine Rolle, beim nächsten Mal neu suchen
    if (speichern(vorschlaege)) await admin.from("versorger_suche").upsert({ schluessel, vorschlaege, abgerufen_am: now.toISOString() });
    return json({ ok: true, vorschlaege, gespeichert: false, abgerufenAm: now.toISOString() } satisfies Antwort);
  } catch (e) {
    const zeit = e instanceof Anthropic.APIConnectionTimeoutError;
    console.error(`Versorger-Suche: ${zeit ? "Zeitüberschreitung" : e instanceof Error ? e.message : "unerwarteter Fehler"}`);
    return fail("error", zeit ? "Die Suche hat zu lange gedauert. Bitte erneut versuchen oder von Hand eintragen." : "Die Suche ist gerade nicht verfügbar. Bitte von Hand eintragen.", zeit ? 504 : 500);
  }
});
