// Edge Function standort-analyse: ermittelt zur Bauadresse eines Projekts die Standortangaben fürs Planungsprotokoll
// (Schneelast, Erdbeben, Höhe, Radon, Wasserschutz, Hochwasser, Lärm). Aufruf mit { projectId }. Es werden nur Vorschläge
// zurückgegeben; übernommen wird in der App (Tabelle standort_angaben). Ablauf und Zuordnung: logic.ts, Quellen: docs/standort-analyse.md.
//
// Schonung der Quellen: Cache in standort_cache (Frist je Thema), Fehler werden nie gespeichert. Höchstens 20 Analysen mit
// Abfragen je Person und Tag (standort_abrufe), Timeout 12 s, kein zweiter Versuch. Nominatim: eine Anfrage je Sekunde, abschaltbar
// über das Secret STANDORT_NOMINATIM_AUS=1. An die Dienste gehen nur Adresse bzw. Koordinaten, keine Namen, keine Projektdaten.
// Aufrufen darf nur, wer angemeldet ist und in user_roles die Rolle admin oder mitarbeiter hat.

import { createClient } from "npm:@supabase/supabase-js@2";
import { analysieren, anfrageAusProjekt, MAX_ANALYSEN_PRO_TAG, parseProjektId, tagesbeginn, TIMEOUT_MS, USER_AGENT, type Dienste, type StandortFehler } from "./logic.ts";
import { ERDBEBEN, ERDBEBEN_BY_KREISE, SCHNEELAST } from "./zonen.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: StandortFehler["code"], message: string, status: number) => json({ ok: false, code, message } satisfies StandortFehler, status);
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

  // --- Eingabe ---------------------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("error", "Ungültiger Aufruf.", 400);
  }
  const projectId = parseProjektId(body);
  if (!projectId) return fail("error", "Ungültige Projekt-ID.", 400);

  try {
    // Nur Bauort und Bauadresse; die Anschrift des Bauherrn wird gar nicht erst gelesen
    const { data: p, error } = await admin.from("projects").select("location, bundesland, gemarkung, bauherr_id").eq("id", projectId).maybeSingle();
    if (error) throw new Error("projects nicht lesbar");
    if (!p) return fail("error", "Projekt nicht gefunden.", 404);
    const { data: b, error: bError } = p.bauherr_id
      ? await admin.from("bauherren").select("site_street, site_postal_code, site_city, site_state, building_address").eq("id", p.bauherr_id).maybeSingle()
      : { data: null, error: null };
    if (bError) throw new Error("bauherren nicht lesbar");

    const { anfrage, fehler } = anfrageAusProjekt({
      bundesland: p.bundesland,
      location: p.location,
      gemarkung: p.gemarkung,
      siteStreet: b?.site_street,
      sitePostalCode: b?.site_postal_code,
      siteCity: b?.site_city,
      siteState: b?.site_state,
      buildingAddress: b?.building_address,
    });
    if (!anfrage) return json(fehler, 422);

    const dienste: Dienste = {
      jetzt: () => new Date(),
      warten: (ms) => new Promise((r) => setTimeout(r, ms)),
      async holen(url) {
        if (env("STANDORT_NOMINATIM_AUS") === "1" && url.includes("nominatim.openstreetmap.org")) throw new Error("Nominatim abgeschaltet");
        const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return text;
      },
      async cacheLesen(schluessel, jetzt) {
        const { data, error: e } = await admin.from("standort_cache").select("schluessel, wert, abgerufen_am").in("schluessel", schluessel).gt("gueltig_bis", jetzt.toISOString());
        if (e) throw new Error("standort_cache nicht lesbar");
        return new Map((data ?? []).map((r) => [r.schluessel as string, { wert: r.wert as unknown, abgerufenAm: r.abgerufen_am as string }]));
      },
      async cacheSchreiben(x) {
        const { error: e } = await admin.from("standort_cache").upsert({ schluessel: x.schluessel, thema: x.thema, wert: x.wert, abgerufen_am: x.abgerufenAm, gueltig_bis: x.gueltigBis });
        if (e) console.error("standort_cache nicht schreibbar");
      },
      async limitZaehlen() {
        const { count, error: e } = await admin.from("standort_abrufe").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("at", tagesbeginn(new Date()));
        if (e) throw new Error("standort_abrufe nicht lesbar");
        if ((count ?? 0) >= MAX_ANALYSEN_PRO_TAG) return false;
        const log = await admin.from("standort_abrufe").insert({ user_id: userId });
        if (log.error) throw new Error("standort_abrufe nicht schreibbar");
        return true;
      },
      tabellen: { SCHNEELAST, ERDBEBEN, ERDBEBEN_BY_KREISE },
    };

    const antwort = await analysieren(anfrage, dienste);
    return json(antwort, antwort.ok ? 200 : antwort.code === "limit" ? 429 : 422);
  } catch (e) {
    console.error(`standort-analyse: ${e instanceof Error ? e.message : "unerwarteter Fehler"}`);
    return fail("error", "Die Standortanalyse ist gerade nicht verfügbar. Bitte später erneut versuchen.", 500);
  }
});
