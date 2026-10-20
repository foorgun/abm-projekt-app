// Edge Function schornsteinfeger-suche: schlägt zur Bauadresse den zuständigen Bezirksschornsteinfeger (Baden-Württemberg)
// vor. Quelle: Fegersuche des Landesinnungsverbands BW (öffentlich, ohne Anmeldung). Der Mitarbeiter bestätigt immer.
//
// Zwei Aufrufarten:
//   { art: "suche", plz, strasse, hausnummer? }  → Status und Kandidaten (Name, BSM-Kennung, Bezirk, passt ja/nein/unsicher)
//   { art: "details", bsmId }                    → Kontaktdaten des gewählten Kandidaten
//
// Schonung der Quelle:
//   * Zwischenspeicher (Migration 0015): gleiche Suche bzw. gleiche Details innerhalb von 90 Tagen gehen nicht erneut hinaus.
//   * Höchstens 30 Abrufe an der Quelle je Person und Tag (Tabelle schornsteinfeger_abrufe), Timeout 10 s, ein Versuch,
//     nacheinander, nie parallel. Bei 403 oder 429 sofort aufhören (kein zweiter Versuch mit dem Namensanfang).
//   * Details nur für Kandidaten, die vorher in einer Suche vorkamen (kein Abklappern aller Kennungen).
//   * An die Quelle gehen nur PLZ, Straße bzw. die BSM-Kennung. Keine Namen, keine Projektdaten.
// Aufrufen darf nur, wer angemeldet ist und in user_roles die Rolle admin oder mitarbeiter hat.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  bsmIds,
  cacheGrenze,
  detailsLesen,
  MAX_ABRUFE_PRO_TAG,
  parseAnfrage,
  passendeTreffer,
  QUELLE_URL,
  strassenAnfang,
  strassenLesen,
  strassenSchluessel,
  strasseNormalisieren,
  suchAntwort,
  tagesbeginn,
  TIMEOUT_MS,
  USER_AGENT,
  type Details,
  type Fehler,
  type SuchAntwort,
  type Treffer,
} from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: Fehler["code"], message: string, status: number) => json({ ok: false, code, message } satisfies Fehler, status);
const env = (name: string) => Deno.env.get(name);
const nichtErreichbar = (suchbegriff: string, meldung: string): SuchAntwort => ({ ok: true, status: "quelle_nicht_erreichbar", kandidaten: [], meldung, suchbegriff });

type Abruf = { ok: true; html: string } | { ok: false; gesperrt: boolean; meldung: string };

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

  // --- Eingabe ---------------------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("error", "Ungültiger Aufruf.", 400);
  }
  const parsed = parseAnfrage(body);
  if (!parsed.ok) return json(parsed, 400);
  const anfrage = parsed.anfrage;
  const now = new Date();
  const grenze = cacheGrenze(now);

  /** Ein Abruf an der Quelle: Limit prüfen, protokollieren, 10 s Timeout, ein Versuch. */
  async function abrufen(art: "suche" | "details", form: Record<string, string>): Promise<Abruf | "limit"> {
    const { count, error } = await admin.from("schornsteinfeger_abrufe").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("at", tagesbeginn(now));
    if (error) throw new Error("schornsteinfeger_abrufe nicht lesbar");
    if ((count ?? 0) >= MAX_ABRUFE_PRO_TAG) return "limit";
    const log = await admin.from("schornsteinfeger_abrufe").insert({ user_id: userId, art }).select("id").single();
    if (log.error) throw new Error("schornsteinfeger_abrufe nicht schreibbar");
    let status = 0;
    try {
      const res = await fetch(QUELLE_URL, {
        method: "POST",
        headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "user-agent": USER_AGENT },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      const html = await res.text();
      await admin.from("schornsteinfeger_abrufe").update({ http_status: status }).eq("id", log.data.id);
      if (status === 403 || status === 429) {
        console.error(`Fegersuche: Quelle antwortet ${status}, keine weiteren Abrufe`);
        return { ok: false, gesperrt: true, meldung: `Die Quelle hat die Anfrage abgelehnt (${status}). Bitte von Hand eintragen.` };
      }
      if (!res.ok) {
        console.error(`Fegersuche: Quelle antwortet ${status}`);
        return { ok: false, gesperrt: false, meldung: "Die Quelle ist gerade nicht erreichbar. Bitte von Hand eintragen." };
      }
      return { ok: true, html };
    } catch (e) {
      const timeout = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      console.error(`Fegersuche: ${timeout ? "Zeitüberschreitung" : "Netzfehler"}`);
      return { ok: false, gesperrt: false, meldung: timeout ? "Die Quelle hat nicht rechtzeitig geantwortet. Bitte später erneut versuchen oder von Hand eintragen." : "Die Quelle ist gerade nicht erreichbar. Bitte von Hand eintragen." };
    }
  }
  const limitFehler = () => fail("limit", `Für heute sind die ${MAX_ABRUFE_PRO_TAG} Abfragen an die Quelle aufgebraucht. Bitte von Hand eintragen.`, 429);

  try {
    // --- Details ---------------------------------------------------------------------------------------
    if (anfrage.art === "details") {
      const cached = await admin.from("schornsteinfeger_details").select("details").eq("bsm_id", anfrage.bsmId).gte("abgerufen_am", grenze).maybeSingle();
      if (cached.data) return json({ ok: true, details: cached.data.details as Details });
      // Nur Kandidaten aus einer (gültigen) Suche
      const bekannt = await admin.from("schornsteinfeger_suche").select("plz", { count: "exact", head: true }).contains("bsm_ids", [anfrage.bsmId]).gte("abgerufen_am", grenze);
      if (bekannt.error) throw new Error("schornsteinfeger_suche nicht lesbar");
      if (!bekannt.count) return fail("error", "Bitte zuerst über „Vorschlagen“ suchen und einen Kandidaten wählen.", 400);
      const r = await abrufen("details", { do: "zeigebevollmaechtigterbyName", bsmId: anfrage.bsmId });
      if (r === "limit") return limitFehler();
      if (!r.ok) return fail("quelle_nicht_erreichbar", r.meldung, 502);
      const gelesen = detailsLesen(r.html);
      if (!gelesen.ok) {
        console.error("Fegersuche: Detailantwort nicht lesbar");
        return fail("nicht_lesbar", "Die Antwort der Quelle war nicht lesbar. Bitte von Hand eintragen.", 502);
      }
      await admin.from("schornsteinfeger_details").upsert({ bsm_id: anfrage.bsmId, details: gelesen.details, abgerufen_am: now.toISOString() });
      return json({ ok: true, details: gelesen.details });
    }

    // --- Suche -----------------------------------------------------------------------------------------
    const strasse = strasseNormalisieren(anfrage.strasse);
    const key = strassenSchluessel(strasse);
    const cached = await admin.from("schornsteinfeger_suche").select("treffer, suchbegriff").eq("plz", anfrage.plz).eq("strasse_key", key).gte("abgerufen_am", grenze).maybeSingle();
    if (cached.data) return json(suchAntwort(cached.data.treffer as Treffer[], anfrage.hausnummer, cached.data.suchbegriff as string));

    let suchbegriff = strasse;
    const erster = await abrufen("suche", { do: "suchestrasse", plz: anfrage.plz, street: strasse });
    if (erster === "limit") return limitFehler();
    if (!erster.ok) return json(nichtErreichbar(suchbegriff, erster.meldung));
    const gelesen = strassenLesen(erster.html);
    if (!gelesen.ok) {
      console.error("Fegersuche: Suchantwort nicht lesbar");
      return json(nichtErreichbar(suchbegriff, "Die Antwort der Quelle war nicht lesbar. Bitte von Hand eintragen."));
    }
    let treffer = passendeTreffer(gelesen.treffer, anfrage.plz, strasse, "genau");

    // Nichts gefunden: einmal mit dem Namensanfang (ohne "straße")
    const anfang = strassenAnfang(strasse);
    if (!treffer.length && anfang) {
      suchbegriff = anfang;
      const zweiter = await abrufen("suche", { do: "suchestrasse", plz: anfrage.plz, street: anfang });
      if (zweiter === "limit") return limitFehler();
      if (!zweiter.ok) return json(nichtErreichbar(suchbegriff, zweiter.meldung));
      const g2 = strassenLesen(zweiter.html);
      if (!g2.ok) return json(nichtErreichbar(suchbegriff, "Die Antwort der Quelle war nicht lesbar. Bitte von Hand eintragen."));
      treffer = passendeTreffer(g2.treffer, anfrage.plz, anfang, "anfang");
    }

    // Auch "nichts gefunden" wird gespeichert: dieselbe Anfrage geht 90 Tage nicht erneut hinaus
    await admin.from("schornsteinfeger_suche").upsert({ plz: anfrage.plz, strasse_key: key, suchbegriff, treffer, bsm_ids: bsmIds(treffer), abgerufen_am: now.toISOString() });
    return json(suchAntwort(treffer, anfrage.hausnummer, suchbegriff));
  } catch (e) {
    console.error(`Fegersuche: ${e instanceof Error ? e.message : "unerwarteter Fehler"}`);
    return fail("error", "Der Vorschlag ist gerade nicht verfügbar. Bitte von Hand eintragen.", 500);
  }
});
