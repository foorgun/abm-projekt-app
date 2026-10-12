// Sicherung: alle Tabellen als JSON in einen lokalen Ordner mit Datum (backups/ steht in .gitignore).
// Braucht den Secret key (.env.server), weil nur er alle Zeilen unabhängig von Rollen lesen darf. Liest nur.
// Enthalten: alle Tabellen der App, die Liste der Benutzerkonten (ohne Passwörter) und die Liste der Dateien im Speicher.
// NICHT enthalten: die Dateien selbst (Pläne, PDFs). Die müssen getrennt gesichert werden.
// Aufruf: npm run export:backup
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient, die, fetchAll, stamp, table } from "./lib/server";

/** Tabelle → eindeutige Sortierung (nötig, damit seitenweises Lesen keine Zeile doppelt oder gar nicht liefert). */
const TABLES: Record<string, string[]> = {
  companies: ["id"],
  salespeople: ["id"],
  team_members: ["id"],
  step_definitions: ["key"],
  folder_templates: ["id"],
  bauherren: ["id"],
  projects: ["id"],
  project_steps: ["project_id", "step_key"],
  project_parties: ["project_id", "role"],
  project_members: ["project_id", "user_id"],
  invoices: ["id"],
  documents: ["id"],
  tasks: ["id"],
  activities: ["id"],
  mailboxes: ["id"],
  inbox_items: ["id"],
  inbox_attachments: ["id"],
  agent_runs: ["id"],
  agent_rules: ["id"],
  agent_settings: ["id"],
  agent_feedback: ["id"],
  project_drafts: ["id"],
  extraction_log: ["id"],
  user_roles: ["user_id"],
};

const sb = adminClient();
const dir = join("backups", `abm-backup-${stamp()}`);
mkdirSync(dir, { recursive: true });
const counts: [string, number][] = [];

for (const [name, order] of Object.entries(TABLES)) {
  try {
    const rows = await fetchAll(sb, name, order);
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(rows, null, 1));
    counts.push([name, rows.length]);
  } catch (e) {
    die(`Sicherung abgebrochen bei ${e instanceof Error ? e.message : e}\nDer Ordner ${dir} ist unvollständig und kann gelöscht werden.`);
  }
}

// Benutzerkonten (nur Stammdaten; Passwörter gibt die API nicht heraus)
const users: Record<string, unknown>[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) die(`Konten: ${error.message}`);
  users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })));
  if (data.users.length < 200) break;
}
writeFileSync(join(dir, "auth_users.json"), JSON.stringify(users, null, 1));
counts.push(["auth_users (ohne Passwörter)", users.length]);

// Dateien im Speicher: nur die Liste (Pfad = storage_path in documents)
const objects = await sb.schema("storage").from("objects").select("name, bucket_id, created_at, metadata").eq("bucket_id", "project-documents").limit(100000);
if (objects.error) {
  writeFileSync(join(dir, "storage_objects.json"), JSON.stringify({ hinweis: `Liste nicht lesbar: ${objects.error.message}` }));
  counts.push(["storage_objects (Liste nicht lesbar)", 0]);
} else {
  writeFileSync(join(dir, "storage_objects.json"), JSON.stringify(objects.data, null, 1));
  counts.push(["storage_objects (nur Liste, keine Dateien)", objects.data.length]);
}

writeFileSync(join(dir, "_info.json"), JSON.stringify({ erstellt: new Date().toISOString(), tabellen: Object.fromEntries(counts), hinweis: "Dateien aus dem Speicher sind nicht enthalten." }, null, 1));
console.log(table(["Tabelle", "Zeilen"], counts));
console.log(`\nSicherung geschrieben nach ${dir}/ (nicht eingecheckt). Die Dateien im Speicher (Pläne, PDFs) sind NICHT enthalten.`);
