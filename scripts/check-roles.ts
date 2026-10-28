// Prüft die Rollen gegen die ECHTE Datenbank: meldet sich je Konto aus konten.local.json an (mit dem Publishable key,
// wie die App) und prüft, was das Konto sieht und was nicht. Braucht KEINEN Secret key.
// Schreibversuche sind so gewählt, dass sie auch dann nichts verändern, wenn eine Regel wider Erwarten nicht greift:
// Werte werden auf sich selbst gesetzt, oder der Versuch enthält absichtlich einen ungültigen Wert, den die Datenbank
// erst NACH der Berechtigungsprüfung ablehnt (leerer Name, nicht vorhandene Benutzer-ID).
// Jede Prüfung hat eines von drei Ergebnissen: eine Zeilenzahl, "gesperrt" (mit Code und Text der Datenbank) oder
// "UNERWARTETER FEHLER" (ebenfalls mit Code und Text). Ein unerwarteter Fehler ist nie ok.
// Aufruf: npm run check:roles
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAlerts, unsentInvoiceTotal } from "../src/lib/alerts";
import { todayIso } from "../src/lib/format";
import { getSupabase } from "../src/lib/supabase/client";
import { createSupabaseRepo } from "../src/lib/supabaseRepo";
import { die, publicClient, readKonten, table, type Konto } from "./lib/server";

const NIL = "00000000-0000-4000-8000-000000000000";
const rows: string[][] = [];
let failed = 0;

/** Ergebnis eines Zugriffs: Zeilenzahl, Ablehnung wegen fehlender Berechtigung, oder ein unerwarteter Fehler. */
type Outcome = { kind: "zeilen"; n: number } | { kind: "gesperrt"; detail: string } | { kind: "fehler"; detail: string };
type DbError = { message?: string; code?: string; details?: string | null; hint?: string | null; status?: number; statusCode?: string | number };

/** Code und Text eines Fehlers, vollständig. Nie leer: fehlt beides, steht das da. */
function errorText(e: DbError, status?: number): string {
  const code = e.code || (e.statusCode != null ? `HTTP ${e.statusCode}` : status ? `HTTP ${status}` : "ohne Code");
  // Meldung und Einzelheiten der Datenbank. Der "hint" der API bleibt weg: er schlägt bei 42501 vor, das Recht zu vergeben.
  const text = [e.message, e.details].filter((x) => x && String(x).trim()).join(" · ") || "ohne Text (die Antwort enthielt keine Meldung)";
  return `${code}: ${text}`;
}
/** Fehlende Berechtigung: GRANT fehlt (42501), Zeilenregel lehnt ab, oder die Funktion prüft die Rolle. Alles andere ist unerwartet. */
function isNoPermission(e: DbError): boolean {
  return e.code === "42501" || /permission denied|row-level security|Keine Berechtigung/i.test(e.message ?? "");
}
function outcome(error: DbError | null, n: number, status?: number): Outcome {
  if (!error) return { kind: "zeilen", n };
  return isNoPermission(error) ? { kind: "gesperrt", detail: errorText(error, status) } : { kind: "fehler", detail: errorText(error, status) };
}
function show(o: Outcome): string {
  if (o.kind === "zeilen") return String(o.n);
  return o.kind === "gesperrt" ? `gesperrt (${o.detail})` : `UNERWARTETER FEHLER (${o.detail})`;
}

function record(konto: string, what: string, expected: string, actual: string, ok: boolean) {
  if (!ok) failed++;
  rows.push([konto, what, expected, actual, ok ? "ok" : "FEHLER"]);
}
/** Erwartet eine bestimmte Zeilenzahl. Eine Ablehnung oder ein Fehler ist hier nie ok, auch nicht bei erwarteten 0 Zeilen. */
function expectRows(konto: string, what: string, expected: number | Outcome, actual: Outcome) {
  if (typeof expected !== "number") {
    if (expected.kind !== "zeilen") return record(konto, what, "Bezugswert", `Bezugswert nicht lesbar: ${show(expected)}`, false);
    expected = expected.n;
  }
  record(konto, what, String(expected), show(actual), actual.kind === "zeilen" && actual.n === expected);
}
/** Erwartet eine Ablehnung wegen fehlender Berechtigung. Null Zeilen oder ein anderer Fehler sind hier nicht ok. */
function expectDenied(konto: string, what: string, actual: Outcome) {
  record(konto, what, "gesperrt", show(actual), actual.kind === "gesperrt");
}
function expectText(konto: string, what: string, expected: string, actual: string) {
  record(konto, what, expected, actual, expected === actual);
}

/**
 * Eine Spalte je Tabelle, die jede Rolle lesen darf. Nie "*": mailboxes gibt nur einzelne Spalten frei (ohne secret_ref),
 * dort lehnt die Datenbank "*" für JEDE Rolle ab. Gezählt wird mit einer normalen Abfrage (nicht HEAD), damit ein Fehler
 * seinen Code und Text mitbringt.
 */
const KEY: Record<string, string> = {
  project_steps: "project_id",
  project_members: "project_id",
  user_roles: "user_id",
  step_definitions: "key",
  agent_settings: "id",
  schornsteinfeger_suche: "plz",
  schornsteinfeger_details: "bsm_id",
};

async function count(sb: SupabaseClient, tableName: string, filter?: (q: any) => any, column?: string): Promise<Outcome> {
  let q: any = sb.from(tableName).select(column ?? KEY[tableName] ?? "id", { count: "exact" });
  if (filter) q = filter(q);
  const { count: n, error, status } = await q.limit(1);
  return outcome(error, n ?? 0, status);
}

/**
 * Schreibversuch: "gesperrt", wenn die Datenbank wegen fehlender Berechtigung ablehnt. Trifft eine Zeilenregel einfach
 * keine Zeile, gilt das als "0 Zeilen". Jede andere Ablehnung (z. B. ein ungültiger Wert) heißt: die Berechtigung war da.
 */
async function attempt(run: PromiseLike<{ error: DbError | null; data?: unknown; status?: number }>): Promise<Outcome> {
  const { error, data, status } = await run;
  return outcome(error, Array.isArray(data) ? data.length : 1, status);
}
/**
 * Wie attempt, aber für Regeln, die ein Trigger mit einer eigenen deutschen Meldung durchsetzt (Urlaub und Krankheit):
 * auch diese Ablehnung zählt als "gesperrt". Eine geänderte Zeile oder ein technischer Fehler nicht.
 */
async function attemptRule(run: PromiseLike<{ error: DbError | null; data?: unknown; status?: number }>): Promise<Outcome> {
  const { error, data, status } = await run;
  if (error && (error.code === "P0001" || error.code === "23514")) return { kind: "gesperrt", detail: errorText(error, status) };
  return outcome(error, Array.isArray(data) ? data.length : 1, status);
}
/** Für Schreibversuche: gesperrt ODER keine Zeile betroffen ist in Ordnung; eine geänderte Zeile oder ein anderer Fehler nicht. */
function expectBlocked(konto: string, what: string, actual: Outcome) {
  const ok = actual.kind === "gesperrt" || (actual.kind === "zeilen" && actual.n === 0);
  record(konto, what, "gesperrt oder 0 Zeilen", actual.kind === "zeilen" ? `${actual.n} Zeilen betroffen` : show(actual), ok);
}
/** Zeilen lesen; ein Fehler wird als fehlgeschlagene Prüfung vermerkt, nicht verschluckt. */
async function read<T>(konto: string, what: string, run: PromiseLike<{ data: T[] | null; error: DbError | null; status?: number }>): Promise<T[]> {
  const { data, error, status } = await run;
  if (error) record(konto, what, "lesbar", show(outcome(error, 0, status)), false);
  return data ?? [];
}

async function signIn(k: Konto): Promise<{ sb: SupabaseClient; id: string } | null> {
  const sb = publicClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: k.email, password: k.passwort! });
  if (error || !data.user) return null;
  return { sb, id: data.user.id };
}

/**
 * Edge Function extract-project aufrufen, ohne dass je ein Bild an den KI-Dienst geht: die Anfrage enthält kein Bild.
 * Die Funktion prüft in dieser Reihenfolge Anmeldung, Rolle, Freischaltung, Eingabe. Freiberufler scheitern an der Rolle (403),
 * Admin und Mitarbeiter kommen weiter und scheitern an "nicht freigeschaltet" (503) oder an der leeren Eingabe (400).
 */
async function extractorStatus(sb: SupabaseClient): Promise<number | "nicht erreichbar"> {
  const { error, response } = (await sb.functions.invoke("extract-project", { body: { images: [] } })) as { error: { context?: Response } | null; response?: Response };
  return error?.context?.status ?? response?.status ?? (error ? "nicht erreichbar" : 200);
}
/**
 * Edge Function schornsteinfeger-suche aufrufen, ohne dass etwas an die Quelle geht: die PLZ ist ungültig. Die Funktion prüft
 * zuerst Anmeldung und Rolle (Freiberufler: 403), erst danach die Eingabe (Admin und Mitarbeiter: 400).
 */
async function fegersucheStatus(sb: SupabaseClient): Promise<number | "nicht erreichbar"> {
  const { error, response } = (await sb.functions.invoke("schornsteinfeger-suche", { body: { art: "suche", plz: "0", strasse: "" } })) as { error: { context?: Response } | null; response?: Response };
  return error?.context?.status ?? response?.status ?? (error ? "nicht erreichbar" : 200);
}
const SCHORNSTEINFEGER_TABELLEN = ["schornsteinfeger_suche", "schornsteinfeger_details", "schornsteinfeger_abrufe"];
/** Schreibversuche mit ungültigen Werten: mit Berechtigung scheiterten sie an der Prüfregel, es entsteht in keinem Fall eine Zeile. */
const SCHORNSTEINFEGER_SCHREIBEN: Record<string, Record<string, unknown>> = {
  schornsteinfeger_suche: { plz: "x", strasse_key: "", suchbegriff: "rollenpruefung" },
  schornsteinfeger_details: { bsm_id: "x", details: [] },
  schornsteinfeger_abrufe: { user_id: NIL, art: "rollenpruefung" },
};

/** Datei-Ablage im Speicher versuchen. Eine wider Erwarten angelegte Datei wird gleich wieder entfernt. */
async function uploadAttempt(sb: SupabaseClient, path: string, bucket = "project-documents"): Promise<Outcome> {
  const up = await sb.storage.from(bucket).upload(path, new Blob(["Rollenprüfung"], { type: "text/plain" }), { upsert: false });
  if (!up.error) await sb.storage.from(bucket).remove([path]);
  return outcome(up.error as DbError | null, 1);
}
/** Dateien im Bucket "vorlagen" zählen (Ordner planungsprotokoll). Ohne Berechtigung liefert der Speicher eine leere Liste. */
async function vorlagenAnzahl(sb: SupabaseClient): Promise<Outcome> {
  const res = await sb.storage.from("vorlagen").list("planungsprotokoll");
  return outcome(res.error as DbError | null, (res.data ?? []).filter((f) => f.name.endsWith(".pdf")).length);
}
const KLASSISCH = ["vermesser", "erdbauer", "strom", "wasser", "elektriker_baustrom"];
// Testanträge der Rollenprüfung liegen weit in der Zukunft (2. und 3. März 2099, Montag und Dienstag) und werden am Ende
// zurückgezogen bzw. abgelehnt. Solche Zeilen zählen in keinem laufenden Jahr und blockieren spätere Läufe nicht.
const TEST_VON = "2099-03-02";
const TEST_BIS = "2099-03-03";
const TEST_NOTIZ = "Rollenprüfung (check:roles), kann ignoriert werden";
const NEVER = { fields: {}, form: {}, file_name: "rollenpruefung.pdf", file_size: -1 }; // file_size -1: die Datenbank lehnt den Wert erst NACH der Berechtigungsprüfung ab

const konten = readKonten();
const mitPasswort = konten.filter((k) => k.passwort);
for (const k of konten.filter((x) => !x.passwort)) rows.push([`${k.email} (${k.rolle})`, "Anmeldung", "–", "übersprungen: kein Passwort in konten.local.json", "–"]);

// ---- nicht angemeldet
const anon = publicClient();
for (const t of ["projects", "invoices", "bauherren", "documents", "user_roles", "project_drafts", "project_draft_files", "extraction_log"]) expectDenied("nicht angemeldet", `${t} lesen`, await count(anon, t));
expectDenied("nicht angemeldet", "Projekt löschen", await attempt(anon.rpc("delete_project", { p_id: NIL })));
for (const t of ["abwesenheiten", "urlaubs_anspruch"]) expectDenied("nicht angemeldet", `${t} lesen`, await count(anon, t, undefined, "user_id"));
for (const t of ["buero_daten", "planungsprotokolle"]) expectDenied("nicht angemeldet", `${t} lesen`, await count(anon, t));
for (const t of SCHORNSTEINFEGER_TABELLEN) expectDenied("nicht angemeldet", `${t} lesen`, await count(anon, t));
expectRows("nicht angemeldet", "Vorlagen im Speicher (Bucket vorlagen)", 0, await vorlagenAnzahl(anon));
expectDenied("nicht angemeldet", "Abwesenheitskalender aufrufen", await attempt(anon.rpc("kalender_abwesenheiten", { p_von: "2026-01-01", p_bis: "2026-12-31" })));

// ---- Bezugswerte: was ein Admin sieht
const adminKonto = mitPasswort.find((k) => k.rolle === "admin");
if (!adminKonto) die("Für die Bezugswerte wird ein Admin-Konto mit Passwort in konten.local.json gebraucht.");
const ref = await signIn(adminKonto);
if (!ref) die(`Anmeldung als ${adminKonto.email} fehlgeschlagen (Passwort in konten.local.json prüfen).`);
const all = {
  projects: await count(ref.sb, "projects"),
  invoices: await count(ref.sb, "invoices"),
  bauherren: await count(ref.sb, "bauherren"),
  roles: await count(ref.sb, "user_roles"),
  vorlagen: await vorlagenAnzahl(ref.sb),
};
const allProjects = await read<{ id: string; bauherr_id: string | null }>("Bezugswerte (Admin)", "Projekte lesen", ref.sb.from("projects").select("id, bauherr_id").limit(5000));
// Nummernkreise (Migration 0017): eine Firma mit Nummernkreis als Ziel der Schreibversuche (derselbe Wert wird zurückgeschrieben)
const prefixCompany = (await read<{ id: string; number_prefix: string }>("Bezugswerte (Admin)", "Hausbaufirmen mit Nummernkreis lesen", ref.sb.from("companies").select("id, number_prefix").not("number_prefix", "is", null).limit(1)))[0];
const prefixCount = await count(ref.sb, "companies", (q) => q.not("number_prefix", "is", null));
// Bundesland am Projekt (Migration 0018): ein Projekt als Ziel des Schreibversuchs (derselbe Wert wird zurückgeschrieben)
const blProject = (await read<{ id: string; bundesland: string | null }>("Bezugswerte (Admin)", "Bundesland der Projekte lesen", ref.sb.from("projects").select("id, bundesland").limit(1)))[0];
const zero = (o: Outcome) => o.kind === "zeilen" && o.n === 0;
if (zero(all.invoices) || zero(all.bauherren)) {
  console.warn("Hinweis: In der Datenbank gibt es keine Rechnungen oder keine Bauherren. Die Prüfungen \"sieht keine\" sind dann wenig aussagekräftig (vorher npm run seed:demo).\n");
}

for (const k of mitPasswort) {
  const who = `${k.email} (${k.rolle})`;
  const s = await signIn(k);
  expectText(who, "Anmeldung", "ok", s ? "ok" : "fehlgeschlagen");
  if (!s) continue;
  const { sb, id } = s;
  const own = await read<{ role: string }>(who, "eigene Rolle lesen", sb.from("user_roles").select("role").eq("user_id", id));
  expectText(who, "Rolle laut Datenbank", k.rolle, own[0]?.role ?? "keine");
  // secret_ref (Verweis auf die Zugangsdaten der Postfächer) ist für JEDE Rolle gesperrt, auch für Admins
  expectDenied(who, "mailboxes.secret_ref lesen", await count(sb, "mailboxes", undefined, "secret_ref"));

  // ---- Neues Projekt aus Dokument (Migration 0010)
  const fn = await extractorStatus(sb);
  if (fn === 404 || fn === "nicht erreichbar") rows.push([who, "Auslesung (Edge Function) aufrufen", "–", "übersprungen: Funktion extract-project ist nicht deployt", "–"]);
  else if (k.rolle === "freiberufler") expectText(who, "Auslesung (Edge Function) aufrufen", "403 abgewiesen", fn === 403 ? "403 abgewiesen" : `Status ${fn}`);
  else expectText(who, "Auslesung (Edge Function): Rolle zugelassen", "nicht abgewiesen", fn === 401 || fn === 403 ? `Status ${fn}` : "nicht abgewiesen");
  // Das Protokoll der Auslesungen schreibt nur die Funktion (service_role): für JEDE Rolle gesperrt
  expectDenied(who, "extraction_log beschreiben", await attempt(sb.from("extraction_log").insert({ user_id: id, model: "rollenpruefung" }).select("id")));

  // ---- Schornsteinfeger-Vorschlag (Migration 0015): lesen nur Admin, schreiben nur die Funktion, Function nur Admin/Mitarbeiter
  for (const t of SCHORNSTEINFEGER_TABELLEN) {
    const n = await count(sb, t);
    if (k.rolle === "admin") record(who, `${t} lesen (nur Admin)`, "lesbar", show(n), n.kind === "zeilen");
    else expectRows(who, `${t}: sieht keine Zeile`, 0, n);
    expectDenied(who, `${t} beschreiben`, await attempt(sb.from(t).insert(SCHORNSTEINFEGER_SCHREIBEN[t]).select()));
  }
  const feger = await fegersucheStatus(sb);
  if (feger === 404 || feger === "nicht erreichbar") rows.push([who, "Schornsteinfeger-Vorschlag (Edge Function)", "–", "übersprungen: Funktion schornsteinfeger-suche ist nicht deployt", "–"]);
  else if (k.rolle === "freiberufler") expectText(who, "Schornsteinfeger-Vorschlag (Edge Function) aufrufen", "403 abgewiesen", feger === 403 ? "403 abgewiesen" : `Status ${feger}`);
  else expectText(who, "Schornsteinfeger-Vorschlag (Edge Function): Rolle zugelassen", "400 (ungültige Eingabe, nichts an die Quelle)", feger === 400 ? "400 (ungültige Eingabe, nichts an die Quelle)" : `Status ${feger}`);

  // ---- Projekt löschen (Migration 0011): nur Admin. Geprüft wird mit einer ID, die es nicht gibt: die Funktion prüft
  // zuerst die Berechtigung und meldet erst danach "Projekt nicht gefunden". Es wird in keinem Fall etwas gelöscht.
  const del = await attempt(sb.rpc("delete_project", { p_id: NIL }));
  if (k.rolle === "admin") record(who, "Projekt löschen: nur Admin (Berechtigung vorhanden)", "abgelehnt nur wegen unbekanntem Projekt", show(del), del.kind === "fehler" && /nicht gefunden/.test(del.detail));
  else expectDenied(who, "Projekt löschen: nur Admin", del);
  // direkt in der Tabelle darf niemand löschen, auch kein Admin (nur über die Funktion)
  expectDenied(who, "Projekt direkt in der Tabelle löschen", await attempt(sb.from("projects").delete().eq("id", NIL).select("id")));

  // ---- Urlaub und Krankheit (Migration 0012)
  const jahr = new Date().getFullYear();
  const kal = await sb.rpc("kalender_abwesenheiten", { p_von: `${jahr}-01-01`, p_bis: `${jahr}-12-31` });
  if (k.rolle === "freiberufler") {
    expectRows(who, "sieht keine Abwesenheiten", 0, await count(sb, "abwesenheiten"));
    expectRows(who, "sieht keinen Urlaubsanspruch", 0, await count(sb, "urlaubs_anspruch", undefined, "user_id"));
    expectDenied(who, "Abwesenheitskalender aufrufen", outcome(kal.error, (kal.data ?? []).length, kal.status));
    // gültige Daten in ferner Zukunft: die Zeilenregel muss ablehnen (sonst entstünde ein offener Antrag im Jahr 2099)
    expectDenied(who, "Urlaub beantragen", await attempt(sb.from("abwesenheiten").insert({ user_id: id, art: "urlaub", von: TEST_VON, bis: TEST_BIS }).select("id")));
    expectDenied(who, "krank melden", await attempt(sb.from("abwesenheiten").insert({ user_id: id, art: "krank", von: TEST_VON, bis: TEST_BIS }).select("id")));
  } else {
    const own = await count(sb, "abwesenheiten", (q) => q.eq("user_id", id));
    record(who, "eigene Abwesenheiten lesen", "lesbar", show(own), own.kind === "zeilen");
    const foreign = await count(sb, "abwesenheiten", (q) => q.neq("user_id", id));
    if (k.rolle === "mitarbeiter") {
      expectRows(who, "sieht fremde Anträge und Krankmeldungen NICHT", 0, foreign);
      expectRows(who, "sieht nur den eigenen Urlaubsanspruch", 0, await count(sb, "urlaubs_anspruch", (q) => q.neq("user_id", id), "user_id"));
      // dieselben Werte zurückschreiben würde bei fehlender Regel nichts ändern; die Regel lässt nur Admins schreiben
      expectBlocked(who, "Urlaubsanspruch ändern (nur Admin)", await attempt(sb.from("urlaubs_anspruch").update({ tage: 30 }).eq("user_id", NIL).select("user_id")));
      expectDenied(who, "Urlaubsanspruch anlegen (nur Admin)", await attempt(sb.from("urlaubs_anspruch").insert({ user_id: id, jahr: 2099, tage: 30 }).select("user_id")));
    } else record(who, "Admin liest alle Abwesenheiten", "lesbar", show(foreign), foreign.kind === "zeilen");
    // Status, Werktage und Entscheidung setzt nie der Client: kein Spaltenrecht, für JEDE Rolle
    expectDenied(who, "Antrag gleich als genehmigt anlegen", await attempt(sb.from("abwesenheiten").insert({ user_id: id, art: "urlaub", von: TEST_VON, bis: TEST_BIS, status: "genehmigt" }).select("id")));
    expectDenied(who, "Abwesenheit löschen", await attempt(sb.from("abwesenheiten").delete().eq("id", NIL).select("id")));
    // Kalender: Mitarbeiter bekommen nie den Grund (art), Admins schon
    const arten = ((kal.data ?? []) as { art: string | null }[]).filter((r) => r.art !== null).length;
    if (kal.error) record(who, "Abwesenheitskalender aufrufen", "aufrufbar", show(outcome(kal.error, 0, kal.status)), false);
    else if (k.rolle === "mitarbeiter") expectRows(who, `Kalender liefert für Mitarbeiter keine "art" (${(kal.data ?? []).length} Einträge)`, 0, { kind: "zeilen", n: arten });
    else record(who, "Abwesenheitskalender aufrufen (Admin, mit Art)", "aufrufbar", `${(kal.data ?? []).length} Einträge, ${arten} mit Art`, true);
  }

  // ---- Planungsprotokoll (Migrationen 0013/0014): nur Admin und Mitarbeiter; Vorlagen hochladen nur per Secret key
  expectDenied(who, "Vorlage in den Bucket vorlagen hochladen", await uploadAttempt(sb, "planungsprotokoll/rollenpruefung.txt", "vorlagen"));
  expectDenied(who, "Planungsprotokoll ändern", await attempt(sb.from("planungsprotokolle").update({ variante: "flach" }).eq("id", NIL).select("id")));
  expectDenied(who, "Planungsprotokoll löschen", await attempt(sb.from("planungsprotokolle").delete().eq("id", NIL).select("id")));
  expectDenied(who, "Bürodaten neu anlegen", await attempt(sb.from("buero_daten").insert({ id: true, name: "Rollenprüfung" }).select("id")));
  // Anlegen mit einem Projekt, das es nicht gibt: mit Berechtigung scheitert es erst am Fremdschlüssel, es entsteht keine Zeile
  const pp = await attempt(sb.from("planungsprotokolle").insert({ project_id: NIL, vorlage: "schwabenhaus", variante: "flach", erstellt_von: id }).select("id"));
  if (k.rolle === "freiberufler") {
    expectRows(who, "sieht keine Bürodaten", 0, await count(sb, "buero_daten"));
    expectBlocked(who, "Bürodaten ändern", await attempt(sb.from("buero_daten").update({ name: "Rollenprüfung" }).eq("id", true).select("id")));
    expectRows(who, "sieht keine Planungsprotokolle", 0, await count(sb, "planungsprotokolle"));
    expectDenied(who, "Planungsprotokoll anlegen", pp);
    expectRows(who, "sieht keine Vorlagen im Speicher", 0, await vorlagenAnzahl(sb));
    expectRows(who, "sieht keine Beteiligten der neuen Rollen (Kellerbauer, Ämter, Sachbearbeiter …)", 0, await count(sb, "project_parties", (q) => q.not("role", "in", `(${KLASSISCH.join(",")})`), "project_id"));
  } else {
    expectRows(who, "Bürodaten lesen (eine Zeile)", 1, await count(sb, "buero_daten"));
    const list = await count(sb, "planungsprotokolle");
    record(who, "Planungsprotokolle lesen", "lesbar", show(list), list.kind === "zeilen");
    record(who, "Planungsprotokoll anlegen: Berechtigung vorhanden", "abgelehnt nur wegen unbekanntem Projekt", show(pp), pp.kind === "fehler" && /foreign key|violates/i.test(pp.detail));
    expectRows(who, "Vorlagen im Speicher lesen", all.vorlagen, await vorlagenAnzahl(sb));
    if (all.vorlagen.kind === "zeilen" && all.vorlagen.n < 3) rows.push([who, "Vorlagen im Bucket", "3", `${all.vorlagen.n} (npm run vorlagen:hochladen)`, "–"]);
    expectRows(who, "neue Spalten lesbar (project_parties.mobile)", await count(ref.sb, "project_parties", undefined, "project_id"), await count(sb, "project_parties", undefined, "mobile"));
    expectRows(who, "neue Spalten lesbar (bauherren.site_state)", all.bauherren, await count(sb, "bauherren", undefined, "site_state"));
    expectRows(who, "neue Spalten lesbar (projects.flur)", all.projects, await count(sb, "projects", undefined, "flur"));
    if (k.rolle === "admin") {
      // ungültige E-Mail: die Datenbank lehnt erst NACH der Berechtigungsprüfung ab (Trigger), es ändert sich nichts
      const bad = await attemptRule(sb.from("buero_daten").update({ email: "rollenpruefung-ohne-at" }).eq("id", true).select("id"));
      record(who, "Bürodaten ändern: Berechtigung vorhanden", "abgelehnt nur wegen ungültiger E-Mail", show(bad), bad.kind === "gesperrt" && /E-Mail/.test(bad.detail));
    } else {
      expectBlocked(who, "Bürodaten ändern (nur Admin)", await attempt(sb.from("buero_daten").update({ name: "Rollenprüfung" }).eq("id", true).select("id")));
    }
  }

  if (k.rolle === "admin" || k.rolle === "mitarbeiter") {
    const drafts = await count(sb, "project_drafts");
    record(who, "Entwürfe lesen (project_drafts)", "lesbar", show(drafts), drafts.kind === "zeilen");
    // mit Berechtigung scheitert der Versuch erst am ungültigen Wert (kein "gesperrt"), es entsteht keine Zeile
    const write = await attempt(sb.from("project_drafts").insert(NEVER).select("id"));
    record(who, "Entwürfe anlegen: Berechtigung vorhanden", "abgelehnt nur wegen ungültigem Wert", show(write), write.kind === "fehler");
    const log = await count(sb, "extraction_log");
    if (k.rolle === "admin") record(who, "extraction_log lesen (nur Admin)", "lesbar", show(log), log.kind === "zeilen");
    else expectRows(who, "extraction_log: sieht keine Zeile", 0, log);
    // Mehrere Dokumente je Entwurf und Kostenübersicht (Migration 0019)
    const files = await count(sb, "project_draft_files");
    record(who, "Dateien der Entwürfe lesen (project_draft_files)", "lesbar", show(files), files.kind === "zeilen");
    for (const [view, col] of [["extraction_costs_by_month", "monat"], ["extraction_costs_by_project", "auslesungen"]] as const) {
      const n = await count(sb, view, undefined, col);
      if (k.rolle === "admin") record(who, `${view} lesen (nur Admin)`, "lesbar", show(n), n.kind === "zeilen");
      else expectRows(who, `${view}: sieht keine Zeile`, 0, n);
    }
    if (k.rolle === "admin") {
      const cols = await count(sb, "extraction_log", undefined, "draft_file_id, doc_type");
      record(who, "neue Spalten lesbar (extraction_log.draft_file_id, doc_type)", "lesbar", show(cols), cols.kind === "zeilen");
    }
    expectRows(who, "neue Spalten lesbar (projects.flurstueck)", all.projects, await count(sb, "projects", undefined, "flurstueck"));
    expectRows(who, "neue Spalten lesbar (bauherren.name2)", all.bauherren, await count(sb, "bauherren", undefined, "name2"));
    const docs = await count(sb, "documents", undefined, "doc_type");
    record(who, "neue Spalten lesbar (documents.doc_type)", "lesbar", show(docs), docs.kind === "zeilen");
    // Projektverlauf (Migration 0016): lesen ja (mit details), direkt schreiben nein, log_activity mit Berechtigung
    expectRows(who, "Verlauf lesen (activities.details)", await count(ref.sb, "activities"), await count(sb, "activities", undefined, "details"));
    expectDenied(who, "Verlauf direkt schreiben (nur über Funktionen)", await attempt(sb.from("activities").insert({ project_id: null, kind: "projekt", text: "Rollenprüfung", actor: "x", actor_id: id }).select("id")));
    // unbekanntes Projekt: mit Berechtigung scheitert es erst daran, es entsteht kein Eintrag
    const la = await attempt(sb.rpc("log_activity", { p_project_id: NIL, p_kind: "projekt", p_text: "Rollenprüfung" }));
    record(who, "Verlauf über log_activity: Berechtigung vorhanden", "abgelehnt nur wegen unbekanntem Projekt", show(la), la.kind === "fehler" && /nicht gefunden/.test(la.detail));
  }

  // ---- Nummernkreise der Hausbaufirmen (Migration 0017): lesen Admin und Mitarbeiter, ändern nur Admins.
  // Geschrieben wird derselbe Wert (ändert nichts) bzw. eine Firma mit leerem Namen (die Datenbank lehnt sie nach der
  // Zeilenregel am Namen ab): in keinem Fall ändert sich etwas oder entsteht eine Zeile.
  const samePrefix = prefixCompany ? await attempt(sb.from("companies").update({ number_prefix: prefixCompany.number_prefix }).eq("id", prefixCompany.id).select("id")) : null;
  const newWithPrefix = await attempt(sb.from("companies").insert({ name: " ", number_prefix: "0000" }).select("id"));
  if (!prefixCompany) rows.push([who, "Nummernkreis ändern", "–", "übersprungen: keine Hausbaufirma mit Nummernkreis (Migration 0017 eingespielt?)", "–"]);
  if (k.rolle === "admin") {
    if (samePrefix) expectRows(who, "Nummernkreis ändern: Berechtigung vorhanden (derselbe Wert)", 1, samePrefix);
    record(who, "Firma mit Nummernkreis anlegen: Berechtigung vorhanden", "abgelehnt nur wegen leerem Namen", show(newWithPrefix), newWithPrefix.kind === "fehler" && /companies_name_clean|check constraint/i.test(newWithPrefix.detail));
  } else {
    if (k.rolle === "mitarbeiter") expectRows(who, "Nummernkreise lesen", prefixCount, await count(sb, "companies", (q) => q.not("number_prefix", "is", null)));
    if (samePrefix) expectBlocked(who, "Nummernkreis ändern (nur Admin)", samePrefix);
    expectDenied(who, "Firma mit Nummernkreis anlegen (nur Admin)", newWithPrefix);
  }

  // ---- Bundesland am Projekt (Migration 0018): lesen alle Rollen bei den Projekten, die sie sehen (Freiberufler nur
  // zugewiesene), ändern nur Admin und Mitarbeiter. Geschrieben wird derselbe Wert: es ändert sich nichts.
  expectRows(who, "Bundesland lesen (bei allen sichtbaren Projekten)", await count(sb, "projects"), await count(sb, "projects", undefined, "bundesland"));
  if (blProject) {
    const sameBl = await attempt(sb.from("projects").update({ bundesland: blProject.bundesland }).eq("id", blProject.id).select("id"));
    if (k.rolle === "freiberufler") expectBlocked(who, "Bundesland ändern (nur Admin und Mitarbeiter)", sameBl);
    else expectRows(who, "Bundesland ändern: Berechtigung vorhanden (derselbe Wert)", 1, sameBl);
  } else rows.push([who, "Bundesland ändern", "–", "übersprungen: kein Projekt in der Datenbank", "–"]);

  // ---- Pilot-Modus (VITE_APP_MODE=pilot): Projekt anlegen, Dokument ablegen, Planungsprotokoll erzeugen.
  // Es bleibt nichts zurück: das Projekt scheitert am leeren Bauherrn, die Testdatei wird sofort wieder entfernt,
  // die Dokument-Zeile scheitert an der Prüfregel für meta, die erst NACH der Zeilenregel greift.
  if (k.rolle === "admin" || k.rolle === "mitarbeiter") {
    const cp = await attempt(sb.rpc("create_project", { p_project: { bauherr_label: "" } }));
    record(who, "Pilot: Projekt anlegen: Berechtigung vorhanden", "abgelehnt nur wegen leerem Bauherrn", show(cp), cp.kind === "fehler" && /Nachnamen/.test(cp.detail));
    const target = allProjects[0]?.id;
    if (!target) rows.push([who, "Pilot: Dokument ablegen", "–", "übersprungen: kein Projekt in der Datenbank", "–"]);
    else {
      const up = await uploadAttempt(sb, `${target}/${NIL}/rollenpruefung.txt`);
      record(who, "Pilot: Datei im Projekt ablegen (wird sofort wieder entfernt)", "1", show(up), up.kind === "zeilen");
      const left = await ref.sb.storage.from("project-documents").list(`${target}/${NIL}`);
      expectRows(who, "Pilot: Testdatei ist wieder entfernt", 0, outcome(left.error as DbError | null, left.data?.length ?? 0));
      const doc = await attempt(sb.from("documents").insert({ project_id: target, name: "rollenpruefung.txt", storage_path: `${target}/${NIL}/rollenpruefung.txt`, uploaded_by: id, meta: "kein Objekt" }).select("id"));
      record(who, "Pilot: Dokument eintragen: Berechtigung vorhanden", "abgelehnt nur wegen ungültigem Wert", show(doc), doc.kind === "fehler" && /documents_meta_object|check constraint/i.test(doc.detail));
    }
  }

  if (k.rolle === "admin") {
    expectRows(who, "sieht alle Projekte", all.projects, await count(sb, "projects"));
    expectRows(who, "sieht Rechnungen", all.invoices, await count(sb, "invoices"));
    expectRows(who, "sieht Kontaktdaten der Bauherren", all.bauherren, await count(sb, "bauherren"));
    expectRows(who, "sieht die Rollen aller Konten", all.roles, await count(sb, "user_roles"));
  }

  if (k.rolle === "mitarbeiter") {
    expectRows(who, "sieht alle Projekte", all.projects, await count(sb, "projects"));
    expectRows(who, "sieht Rechnungen", all.invoices, await count(sb, "invoices"));
    expectRows(who, "sieht Kontaktdaten der Bauherren", all.bauherren, await count(sb, "bauherren"));
    expectRows(who, "Nutzerverwaltung: sieht nur die eigene Rolle", 1, await count(sb, "user_roles"));
    expectDenied(who, "Nutzerverwaltung: Rolle vergeben", await attempt(sb.from("user_roles").insert({ user_id: NIL, role: "admin" }).select("user_id")));
    expectDenied(who, "Nutzerverwaltung: eigene Rolle ändern", await attempt(sb.from("user_roles").update({ role: k.rolle }).eq("user_id", id).select("user_id")));
    expectDenied(who, "Nutzerverwaltung: Projekt zuweisen", await attempt(sb.from("project_members").insert({ project_id: NIL, user_id: id }).select("project_id")));
    const cur = await read<{ auto_file_threshold: number; suggest_threshold: number }>(who, "Schwellen lesen", sb.from("agent_settings").select("auto_file_threshold, suggest_threshold"));
    // dieselben Werte zurückschreiben: die Zeilenregel lässt nur Admins ändern, bei Mitarbeitern trifft das Update keine Zeile
    if (cur[0]) expectBlocked(who, "Schwellen des Agenten ändern (nur Admin)", await attempt(sb.from("agent_settings").update(cur[0]).eq("id", true).select("id")));
  }

  if (k.rolle === "freiberufler") {
    const mine = await read<{ id: string; bauherr_id: string | null }>(who, "Projekte lesen", sb.from("projects").select("id, bauherr_id").limit(5000));
    const members = (await read<{ project_id: string }>(who, "eigene Zuweisungen lesen", sb.from("project_members").select("project_id").eq("user_id", id))).map((m) => m.project_id).sort();
    expectRows(who, "sieht genau drei Projekte", 3, await count(sb, "projects"));
    const short = (ids: string[]) => ids.map((x) => x.slice(0, 8)).join(", ");
    expectText(who, "… und zwar die zugewiesenen", short(members) || "keine Zuweisung", short(mine.map((p) => p.id).sort()) || "keine Projekte");
    const foreign = allProjects.find((p) => !mine.some((m) => m.id === p.id));
    if (foreign) {
      expectRows(who, "fremdes Projekt gezielt per ID", 0, await count(sb, "projects", (q) => q.eq("id", foreign.id)));
      expectRows(who, "Schritte eines fremden Projekts", 0, await count(sb, "project_steps", (q) => q.eq("project_id", foreign.id)));
      expectRows(who, "Dokumente eines fremden Projekts", 0, await count(sb, "documents", (q) => q.eq("project_id", foreign.id)));
      const files = await sb.storage.from("project-documents").list(foreign.id);
      expectRows(who, "Dateien eines fremden Projekts im Speicher", 0, outcome(files.error as DbError | null, files.data?.length ?? 0));
    } else record(who, "fremdes Projekt gezielt per ID", "ein fremdes Projekt zum Prüfen", "es gibt kein Projekt außerhalb der Zuweisung", false);
    expectRows(who, "sieht keine Rechnungen", 0, await count(sb, "invoices"));
    if (mine[0]) expectRows(who, "Rechnungen des eigenen Projekts gezielt per ID", 0, await count(sb, "invoices", (q) => q.eq("project_id", mine[0].id)));
    expectRows(who, "sieht keine Kontaktdaten der Bauherren", 0, await count(sb, "bauherren"));
    const ownBauherr = mine.find((p) => p.bauherr_id)?.bauherr_id;
    if (ownBauherr) expectRows(who, "Bauherr des eigenen Projekts gezielt per ID", 0, await count(sb, "bauherren", (q) => q.eq("id", ownBauherr)));
    for (const t of ["companies", "salespeople", "tasks", "mailboxes", "inbox_items", "inbox_attachments", "agent_rules", "agent_settings"]) {
      expectRows(who, `sieht nichts in ${t}`, 0, await count(sb, t));
    }
    // Projektverlauf (Migration 0016): nur zugewiesene Projekte, ohne Rechnungen und Aufgaben, nie direkt schreiben
    const ownIds = mine.map((p) => p.id);
    expectRows(who, "Verlauf: keine Einträge fremder oder ohne Projekt", 0, await count(sb, "activities", (q) => (ownIds.length ? q.or(`project_id.is.null,project_id.not.in.(${ownIds.join(",")})`) : q)));
    expectRows(who, "Verlauf: keine Einträge zu Rechnungen und Aufgaben", 0, await count(sb, "activities", (q) => q.in("kind", ["rechnung", "aufgabe"])));
    if (foreign) expectRows(who, "Verlauf eines fremden Projekts gezielt per ID", 0, await count(sb, "activities", (q) => q.eq("project_id", foreign.id)));
    const ownHistory = await count(sb, "activities");
    record(who, "Verlauf der zugewiesenen Projekte lesen", "lesbar", show(ownHistory), ownHistory.kind === "zeilen");
    expectDenied(who, "Verlauf direkt schreiben", await attempt(sb.from("activities").insert({ project_id: NIL, kind: "projekt", text: "Rollenprüfung", actor: "x", actor_id: id }).select("id")));
    expectDenied(who, "Verlauf über log_activity schreiben (nur Mitarbeiter)", await attempt(sb.rpc("log_activity", { p_project_id: NIL, p_kind: "projekt", p_text: "Rollenprüfung" })));
    // fremdes Dokument: dieselbe Meldung wie "unbekannt", es entsteht kein Eintrag
    const docEvent = await attempt(sb.rpc("log_document_event", { p_document_id: NIL, p_event: "geoeffnet" }));
    record(who, "Öffnen eines unbekannten/fremden Dokuments protokollieren", "abgelehnt (Dokument nicht gefunden)", show(docEvent), docEvent.kind !== "zeilen" && /nicht gefunden/.test(docEvent.detail));
    expectRows(who, "sieht nur die eigene Rolle", 1, await count(sb, "user_roles"));
    // Entwürfe und Protokoll der Auslesungen: nichts lesen, nichts schreiben
    expectRows(who, "sieht keine Entwürfe (project_drafts)", 0, await count(sb, "project_drafts"));
    expectDenied(who, "Entwurf anlegen", await attempt(sb.from("project_drafts").insert(NEVER).select("id")));
    expectBlocked(who, "Entwurf ändern", await attempt(sb.from("project_drafts").update({ status: "verworfen" }).neq("id", NIL).select("id")));
    expectRows(who, "sieht nichts in extraction_log", 0, await count(sb, "extraction_log"));
    expectRows(who, "sieht keine Dateien von Entwürfen (project_draft_files)", 0, await count(sb, "project_draft_files"));
    expectDenied(who, "Datei zu einem Entwurf anlegen", await attempt(sb.from("project_draft_files").insert({ draft_id: NIL, file_name: "rollenpruefung.pdf", file_size: 1 }).select("id")));
    expectBlocked(who, "Datei eines Entwurfs ändern", await attempt(sb.from("project_draft_files").update({ status: "entfernt" }).neq("id", NIL).select("id")));
    expectRows(who, "sieht keine Kosten (extraction_costs_by_month)", 0, await count(sb, "extraction_costs_by_month", undefined, "monat"));
    expectRows(who, "sieht keine Kosten (extraction_costs_by_project)", 0, await count(sb, "extraction_costs_by_project", undefined, "auslesungen"));
    expectRows(who, "zweiter Bauherr (bauherren.name2) nicht lesbar", 0, await count(sb, "bauherren", undefined, "name2"));
    // Dokument-Ablage nur mit Berechtigung: weder im Entwurfsspeicher noch in einem fremden Projekt
    const draftFiles = await sb.storage.from("project-documents").list("drafts");
    expectRows(who, "Dateien von Entwürfen im Speicher", 0, outcome(draftFiles.error as DbError | null, draftFiles.data?.length ?? 0));
    expectDenied(who, "Datei im Entwurfsspeicher ablegen", await uploadAttempt(sb, `drafts/${NIL}/rollenpruefung.txt`));
    if (foreign) expectDenied(who, "Datei in einem fremden Projekt ablegen", await uploadAttempt(sb, `${foreign.id}/rollenpruefung/rollenpruefung.txt`));
    if (mine[0]) {
      // leerer Bauherr: mit Berechtigung käme "Bitte den Nachnamen …", ohne "Keine Berechtigung"
      expectDenied(who, "Projektdaten bearbeiten", await attempt(sb.rpc("update_project", { p_id: mine[0].id, p_project: { bauherr_label: "" } })));
      // ohne Kontaktdaten: mit Berechtigung passiert nichts, ohne kommt "Keine Berechtigung"
      expectDenied(who, "Kontaktdaten setzen", await attempt(sb.rpc("set_project_bauherr", { p_project: mine[0].id, p_bauherr: null })));
    }
    expectDenied(who, "Projekt anlegen", await attempt(sb.rpc("create_project", { p_project: { bauherr_label: "" } })));
    expectDenied(who, "Hausbaufirma anlegen", await attempt(sb.from("companies").insert({ name: " " }).select("id")));

    // Dieselben Daten, wie die App sie lädt: Zahlen des Dashboards
    try {
      const app = getSupabase();
      const login = await app.auth.signInWithPassword({ email: k.email, password: k.passwort! });
      if (login.error) throw login.error;
      const d = await createSupabaseRepo().load({ id, name: k.name, role: "freiberufler" });
      const alerts = computeAlerts(d, todayIso());
      const n = (x: number): Outcome => ({ kind: "zeilen", n: x });
      expectRows(who, "App-Daten: Rechnungen", 0, n(d.invoices.length));
      expectRows(who, "App-Daten: Kontaktdaten Bauherren", 0, n(d.bauherren.length));
      expectRows(who, "Dashboard: Summe nicht versendeter Rechnungen", 0, n(unsentInvoiceTotal(alerts, d)));
      expectRows(who, "Dashboard: Warnungen zu Rechnungen", 0, n(alerts.filter((a) => a.kind === "invoice_unsent").length));
      expectRows(who, "App-Daten: Projekte", 3, n(d.projects.length));
      await app.auth.signOut();
    } catch (e) {
      const err = e as DbError;
      record(who, "App-Daten laden", "ok", `UNERWARTETER FEHLER (${errorText({ message: err?.message ?? String(e), code: err?.code })})`, false);
    }
  }
  await sb.auth.signOut();
}
// ---- Urlaub: Vier-Augen-Prinzip mit echten Testanträgen (2099). Niemand genehmigt den eigenen Antrag; ein Admin
// entscheidet den Antrag einer anderen Person. Die Testanträge enden als "zurückgezogen" oder "abgelehnt".
{
  const ma = mitPasswort.find((k) => k.rolle === "mitarbeiter");
  const m = ma ? await signIn(ma) : null;
  const a = `${adminKonto.email} (admin)`;
  type Row = { id: string; status: string; werktage: number | null };
  const create = async (sb: SupabaseClient, uid: string) => sb.from("abwesenheiten").insert({ user_id: uid, art: "urlaub", von: TEST_VON, bis: TEST_BIS, notiz: TEST_NOTIZ }).select("id, status, werktage").single();
  const status = async (sb: SupabaseClient, rowId: string) => ((await sb.from("abwesenheiten").select("status").eq("id", rowId).maybeSingle()).data as { status: string } | null)?.status ?? "nicht lesbar";

  // Admin: eigener Antrag
  const own = await create(ref.sb, ref.id);
  if (own.error || !own.data) record(a, "Testantrag anlegen", "angelegt", show(outcome(own.error, 0, own.status)), false);
  else {
    const row = own.data as Row;
    expectText(a, "Testantrag: Status und Werktage setzt die Datenbank", "offen, 2 Werktage", `${row.status}, ${Number(row.werktage)} Werktage`);
    expectDenied(a, "Admin genehmigt den EIGENEN Antrag", await attemptRule(ref.sb.from("abwesenheiten").update({ status: "genehmigt" }).eq("id", row.id).select("id")));
    expectDenied(a, "Admin lehnt den EIGENEN Antrag ab", await attemptRule(ref.sb.from("abwesenheiten").update({ status: "abgelehnt" }).eq("id", row.id).select("id")));
    expectText(a, "eigener Antrag ist danach noch offen", "offen", await status(ref.sb, row.id));
    expectDenied(a, "Überschneidung mit dem eigenen Antrag", await attemptRule(ref.sb.from("abwesenheiten").insert({ user_id: ref.id, art: "urlaub", von: TEST_BIS, bis: TEST_BIS }).select("id")));
    expectDenied(a, "Krankmeldung mit Notiz (keine Diagnose)", await attemptRule(ref.sb.from("abwesenheiten").insert({ user_id: ref.id, art: "krank", von: "2099-04-01", bis: "2099-04-01", notiz: "x" }).select("id")));
    expectRows(a, "Admin zieht den eigenen Testantrag zurück", 1, await attempt(ref.sb.from("abwesenheiten").update({ status: "zurueckgezogen" }).eq("id", row.id).select("id")));
  }

  // Mitarbeiter: eigener Antrag, Selbst-Genehmigung verboten; der Admin entscheidet ihn
  if (!ma || !m) rows.push(["Mitarbeiter", "Urlaub: Selbst-Genehmigung und Entscheidung durch Admin", "–", "übersprungen: kein Mitarbeiter-Konto mit Passwort", "–"]);
  else {
    const who = `${ma.email} (mitarbeiter)`;
    const req = await create(m.sb, m.id);
    if (req.error || !req.data) record(who, "Testantrag anlegen", "angelegt", show(outcome(req.error, 0, req.status)), false);
    else {
      const row = req.data as Row;
      expectDenied(who, "Mitarbeiter genehmigt sich selbst", await attemptRule(m.sb.from("abwesenheiten").update({ status: "genehmigt" }).eq("id", row.id).select("id")));
      expectText(who, "eigener Antrag ist danach noch offen", "offen", await status(m.sb, row.id));
      // Der Admin lehnt den Testantrag ab: dieselbe Regel wie beim Genehmigen (nur Admin, nie der eigene), ohne dass
      // ein genehmigter Urlaub im Bestand zurückbleibt.
      expectRows(a, "Admin entscheidet den Antrag einer anderen Person (Testantrag wird abgelehnt)", 1, await attempt(ref.sb.from("abwesenheiten").update({ status: "abgelehnt", ablehn_grund: "Rollenprüfung" }).eq("id", row.id).select("id")));
      expectText(who, "Mitarbeiter sieht die Entscheidung", "abgelehnt", await status(m.sb, row.id));
      expectDenied(who, "entschiedenen Antrag wieder öffnen", await attemptRule(m.sb.from("abwesenheiten").update({ status: "offen" }).eq("id", row.id).select("id")));
    }
    await m.sb.auth.signOut();
  }
}
await ref.sb.auth.signOut();

console.log(table(["Konto", "Prüfung", "Erwartet", "Ist", "Ergebnis"], rows));
const skipped = rows.filter((r) => r[4] === "–").length;
console.log(failed ? `\n${failed} Prüfung(en) FEHLGESCHLAGEN.` : `\nAlle ${rows.filter((r) => r[4] === "ok").length} Prüfungen bestanden.`);
if (skipped) console.log(`${skipped} Konto/Konten übersprungen (kein Passwort in konten.local.json): für diese Rolle ist damit nichts geprüft.`);
process.exit(failed ? 1 : 0);
