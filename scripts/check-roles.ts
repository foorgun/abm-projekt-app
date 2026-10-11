// Prüft die Rollen gegen die ECHTE Datenbank: meldet sich je Konto aus konten.local.json an (mit dem Publishable key,
// wie die App) und prüft, was das Konto sieht und was nicht. Braucht KEINEN Secret key.
// Schreibversuche sind so gewählt, dass sie auch dann nichts verändern, wenn eine Regel wider Erwarten nicht greift:
// Werte werden auf sich selbst gesetzt, oder der Versuch enthält absichtlich einen ungültigen Wert, den die Datenbank
// erst NACH der Berechtigungsprüfung ablehnt (leerer Name, nicht vorhandene Benutzer-ID).
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
function check(konto: string, what: string, expected: string | number, actual: string | number) {
  const ok = String(expected) === String(actual);
  if (!ok) failed++;
  rows.push([konto, what, String(expected), String(actual), ok ? "ok" : "FEHLER"]);
}

async function count(sb: SupabaseClient, tableName: string, filter?: (q: any) => any): Promise<number | string> {
  let q: any = sb.from(tableName).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  return error ? `Fehler: ${error.code ?? error.message}` : n ?? 0;
}
/**
 * "gesperrt" nur, wenn die Datenbank wegen fehlender Berechtigung ablehnt (GRANT, Zeilenregel, Rollenprüfung der Funktion)
 * oder die Zeilenregel keine Zeile trifft. Jede andere Ablehnung (z. B. ein ungültiger Wert) heißt: die Berechtigung war da.
 */
async function denied(run: PromiseLike<{ error: { message: string; code?: string } | null; data?: unknown }>): Promise<string> {
  const { error, data } = await run;
  if (error) {
    const noRight = error.code === "42501" || /permission denied|row-level security|Keine Berechtigung/i.test(error.message);
    return noRight ? "gesperrt" : `ERLAUBT (erst später abgelehnt: ${error.message.slice(0, 60)})`;
  }
  return Array.isArray(data) && data.length === 0 ? "gesperrt" : "ERLAUBT";
}
async function signIn(k: Konto): Promise<{ sb: SupabaseClient; id: string } | null> {
  const sb = publicClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: k.email, password: k.passwort! });
  if (error || !data.user) return null;
  return { sb, id: data.user.id };
}

const konten = readKonten();
const mitPasswort = konten.filter((k) => k.passwort);
for (const k of konten.filter((x) => !x.passwort)) rows.push([`${k.email} (${k.rolle})`, "Anmeldung", "–", "übersprungen: kein Passwort in konten.local.json", "–"]);

// ---- nicht angemeldet
const anon = publicClient();
check("nicht angemeldet", "Projekte lesen", "gesperrt", typeof (await count(anon, "projects")) === "string" ? "gesperrt" : "LESBAR");
check("nicht angemeldet", "Rechnungen lesen", "gesperrt", typeof (await count(anon, "invoices")) === "string" ? "gesperrt" : "LESBAR");
check("nicht angemeldet", "Bauherren lesen", "gesperrt", typeof (await count(anon, "bauherren")) === "string" ? "gesperrt" : "LESBAR");

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
};
const allProjects = ((await ref.sb.from("projects").select("id, bauherr_id").limit(5000)).data ?? []) as { id: string; bauherr_id: string | null }[];
if (Number(all.invoices) === 0 || Number(all.bauherren) === 0) {
  console.warn("Hinweis: In der Datenbank gibt es keine Rechnungen oder keine Bauherren. Die Prüfungen \"sieht keine\" sind dann wenig aussagekräftig (vorher npm run seed:demo).\n");
}

for (const k of mitPasswort) {
  const who = `${k.email} (${k.rolle})`;
  const s = await signIn(k);
  check(who, "Anmeldung", "ok", s ? "ok" : "fehlgeschlagen");
  if (!s) continue;
  const { sb, id } = s;
  const own = await sb.from("user_roles").select("role, full_name").eq("user_id", id).maybeSingle();
  check(who, "Rolle laut Datenbank", k.rolle, own.data?.role ?? "keine");

  if (k.rolle === "admin") {
    check(who, "sieht alle Projekte", all.projects, await count(sb, "projects"));
    check(who, "sieht Rechnungen", all.invoices, await count(sb, "invoices"));
    check(who, "sieht Kontaktdaten der Bauherren", all.bauherren, await count(sb, "bauherren"));
    check(who, "sieht die Rollen aller Konten", all.roles, await count(sb, "user_roles"));
  }

  if (k.rolle === "mitarbeiter") {
    check(who, "sieht alle Projekte", all.projects, await count(sb, "projects"));
    check(who, "sieht Rechnungen", all.invoices, await count(sb, "invoices"));
    check(who, "sieht Kontaktdaten der Bauherren", all.bauherren, await count(sb, "bauherren"));
    check(who, "Nutzerverwaltung: sieht nur die eigene Rolle", 1, await count(sb, "user_roles"));
    check(who, "Nutzerverwaltung: Rolle vergeben", "gesperrt", await denied(sb.from("user_roles").insert({ user_id: NIL, role: "admin" }).select()));
    check(who, "Nutzerverwaltung: eigene Rolle ändern", "gesperrt", await denied(sb.from("user_roles").update({ role: k.rolle }).eq("user_id", id).select()));
    check(who, "Nutzerverwaltung: Projekt zuweisen", "gesperrt", await denied(sb.from("project_members").insert({ project_id: NIL, user_id: id }).select()));
    const cur = await sb.from("agent_settings").select("auto_file_threshold, suggest_threshold").maybeSingle();
    if (cur.data) check(who, "Schwellen des Agenten ändern (nur Admin)", "gesperrt", await denied(sb.from("agent_settings").update(cur.data).eq("id", true).select()));
  }

  if (k.rolle === "freiberufler") {
    const mine = ((await sb.from("projects").select("id, bauherr_id").limit(5000)).data ?? []) as { id: string; bauherr_id: string | null }[];
    const members = ((await sb.from("project_members").select("project_id").eq("user_id", id)).data ?? []).map((m) => m.project_id).sort();
    check(who, "sieht genau drei Projekte", 3, mine.length);
    check(who, "… und zwar die zugewiesenen", members.join(","), mine.map((p) => p.id).sort().join(","));
    const foreign = allProjects.find((p) => !mine.some((m) => m.id === p.id));
    if (foreign) {
      check(who, "fremdes Projekt gezielt per ID", 0, await count(sb, "projects", (q) => q.eq("id", foreign.id)));
      check(who, "Schritte eines fremden Projekts", 0, await count(sb, "project_steps", (q) => q.eq("project_id", foreign.id)));
      check(who, "Dokumente eines fremden Projekts", 0, await count(sb, "documents", (q) => q.eq("project_id", foreign.id)));
      const files = await sb.storage.from("project-documents").list(foreign.id);
      check(who, "Dateien eines fremden Projekts im Speicher", 0, files.error ? 0 : files.data.length);
    }
    check(who, "sieht keine Rechnungen", 0, await count(sb, "invoices"));
    if (mine[0]) check(who, "Rechnungen des eigenen Projekts gezielt per ID", 0, await count(sb, "invoices", (q) => q.eq("project_id", mine[0].id)));
    check(who, "sieht keine Kontaktdaten der Bauherren", 0, await count(sb, "bauherren"));
    const ownBauherr = mine.find((p) => p.bauherr_id)?.bauherr_id;
    if (ownBauherr) check(who, "Bauherr des eigenen Projekts gezielt per ID", 0, await count(sb, "bauherren", (q) => q.eq("id", ownBauherr)));
    for (const t of ["companies", "salespeople", "tasks", "activities", "mailboxes", "inbox_items", "inbox_attachments", "agent_rules", "agent_settings"]) {
      check(who, `sieht nichts in ${t}`, 0, await count(sb, t));
    }
    check(who, "sieht nur die eigene Rolle", 1, await count(sb, "user_roles"));
    if (mine[0]) {
      // leerer Bauherr: mit Berechtigung käme "Bitte den Nachnamen …", ohne "Keine Berechtigung"
      check(who, "Projektdaten bearbeiten", "gesperrt", await denied(sb.rpc("update_project", { p_id: mine[0].id, p_project: { bauherr_label: "" } })));
      // ohne Kontaktdaten: mit Berechtigung passiert nichts, ohne kommt "Keine Berechtigung"
      check(who, "Kontaktdaten setzen", "gesperrt", await denied(sb.rpc("set_project_bauherr", { p_project: mine[0].id, p_bauherr: null })));
    }
    check(who, "Projekt anlegen", "gesperrt", await denied(sb.rpc("create_project", { p_project: { bauherr_label: "" } })));
    check(who, "Hausbaufirma anlegen", "gesperrt", await denied(sb.from("companies").insert({ name: " " }).select()));

    // Dieselben Daten, wie die App sie lädt: Zahlen des Dashboards
    try {
      const app = getSupabase();
      const login = await app.auth.signInWithPassword({ email: k.email, password: k.passwort! });
      if (login.error) throw login.error;
      const d = await createSupabaseRepo().load({ id, name: k.name, role: "freiberufler" });
      const alerts = computeAlerts(d, todayIso());
      check(who, "App-Daten: Rechnungen", 0, d.invoices.length);
      check(who, "App-Daten: Kontaktdaten Bauherren", 0, d.bauherren.length);
      check(who, "Dashboard: Summe nicht versendeter Rechnungen", 0, unsentInvoiceTotal(alerts, d));
      check(who, "Dashboard: Warnungen zu Rechnungen", 0, alerts.filter((a) => a.kind === "invoice_unsent").length);
      check(who, "App-Daten: Projekte", 3, d.projects.length);
      await app.auth.signOut();
    } catch (e) {
      check(who, "App-Daten laden", "ok", `Fehler: ${e instanceof Error ? e.message : e}`);
    }
  }
  await sb.auth.signOut();
}
await ref.sb.auth.signOut();

console.log(table(["Konto", "Prüfung", "Erwartet", "Ist", "Ergebnis"], rows));
console.log(failed ? `\n${failed} Prüfung(en) FEHLGESCHLAGEN.` : `\nAlle ${rows.filter((r) => r[4] === "ok").length} Prüfungen bestanden.`);
process.exit(failed ? 1 : 0);
