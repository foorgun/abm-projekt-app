// Prüft das echte Supabase-Projekt von außen, nur mit dem Publishable key aus .env (ohne Anmeldung, ohne Secret key):
//   * sind die Tabellen da (Migrationen angewendet)?
//   * bekommt ein nicht angemeldeter Besucher wirklich nichts?
// Liest nur, ändert nichts. Aufruf: npm run check:setup
import { readFileSync } from "node:fs";

function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
    );
  } catch {
    return {};
  }
}
const env = { ...readEnv(".env"), ...readEnv(".env.local") };
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen in .env");
  process.exit(1);
}
if (!key.startsWith("sb_publishable_")) console.warn("Hinweis: der Schlüssel in .env beginnt nicht mit sb_publishable_. Dort darf nie der Secret key stehen.");

const TABLES = [
  "companies", "salespeople", "team_members", "step_definitions", "folder_templates", "bauherren", "projects", "project_steps",
  "project_parties", "invoices", "documents", "tasks", "activities", "mailboxes", "inbox_items", "inbox_attachments",
  "agent_runs", "agent_rules", "agent_settings", "agent_feedback", "user_roles", "project_members", "project_drafts", "extraction_log",
];
const FUNCTIONS = ["list_user_names", "current_user_name", "is_staff", "is_admin", "current_app_role"];
const h = { apikey: key, "content-type": "application/json" };
let bad = 0;
let missing = 0;
const rows = [];

for (const t of TABLES) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: h });
  const body = await r.text();
  let result;
  if (r.status === 404 || body.includes("PGRST205")) { result = "FEHLT (Migration nicht angewendet)"; missing++; }
  else if (r.ok && body.trim() === "[]") { result = "WARNUNG: lesbar, aber leer (GRANT für anon vorhanden?)"; bad++; }
  else if (r.ok) { result = "OFFEN: anon liest Daten!"; bad++; }
  else result = "gesperrt";
  rows.push([`Tabelle ${t}`, r.status, result]);
}
for (const f of FUNCTIONS) {
  const r = await fetch(`${url}/rest/v1/rpc/${f}`, { method: "POST", headers: h, body: "{}" });
  const body = await r.text();
  let result;
  if (r.status === 404 || body.includes("PGRST202")) { result = "FEHLT oder gesperrt (für anon nicht sichtbar)"; }
  else if (r.ok) { result = "OFFEN: anon darf ausführen!"; bad++; }
  else result = "gesperrt";
  rows.push([`Funktion ${f}`, r.status, result]);
}
const s = await fetch(`${url}/auth/v1/settings`, { headers: h }).then((r) => r.json()).catch(() => null);
if (s) {
  rows.push(["Selbstregistrierung", "", s.disable_signup ? "aus" : "AN: bitte im Dashboard abschalten"]);
  if (!s.disable_signup) bad++;
  rows.push(["Anmeldung per E-Mail", "", s.external?.email ? "an" : "AUS: Anmeldung in der App geht so nicht"]);
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log("Projekt aus .env (nur lesend geprüft)\n");
for (const [name, status, result] of rows) console.log(`${name.padEnd(w)}  ${String(status).padEnd(3)}  ${result}`);
console.log("");
if (missing) console.log(`${missing} Tabellen fehlen: Migrationen anwenden (docs/supabase-einrichten.md, Schritt 2).`);
if (bad) console.log(`${bad} Punkt(e) NICHT in Ordnung.`);
if (!missing && !bad) console.log("In Ordnung: alle Tabellen vorhanden, nicht angemeldete Besucher bekommen nichts.");
process.exit(missing || bad ? 1 : 0);
