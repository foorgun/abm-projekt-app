// Sicherung: alle Tabellen als JSON in einen lokalen Ordner mit Datum (backups/ steht in .gitignore).
// Braucht den Secret key, weil nur er alle Zeilen unabhängig von Rollen lesen darf. Liest nur.
// Enthalten: alle Tabellen der App (Liste in scripts/lib/backupTables.ts, ein Test prüft sie gegen die Migrationen), die
// Liste der Benutzerkonten (ohne Passwörter) und die Liste der Dateien im Speicher.
// NICHT enthalten: die Dateien selbst (Pläne, PDFs). Die müssen getrennt gesichert werden.
// Aufruf: npm run export:backup -- --ziel development|production
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BACKUP_TABLES } from "./lib/backupTables";
import { adminClient, die, fetchAll, stamp, table, waehleZiel } from "./lib/server";

const ziel = await waehleZiel("Sicherung lesen", ["oeffentlich", "secret"]);
const sb = adminClient();
const dir = join("backups", ziel, `abm-backup-${stamp()}`);
mkdirSync(dir, { recursive: true });
const counts: [string, number][] = [];

for (const [name, order] of Object.entries(BACKUP_TABLES)) {
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

// Dateien im Speicher: nur die Liste, über die Storage-Schnittstelle (das Schema storage ist über die Daten-API nicht erreichbar)
const buckets = await sb.storage.listBuckets();
if (buckets.error) die(`Speicher: ${buckets.error.message}`);
const objects: Record<string, unknown>[] = [];
for (const bucket of buckets.data) {
  const walk = async (folder: string): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.storage.from(bucket.id).list(folder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) die(`Speicher ${bucket.id}/${folder}: ${error.message}`);
      for (const o of data) {
        const name = folder ? `${folder}/${o.name}` : o.name;
        // Ordner haben keine id
        if (o.id) objects.push({ bucket_id: bucket.id, name, created_at: o.created_at, metadata: o.metadata });
        else await walk(name);
      }
      if (data.length < 1000) return;
    }
  };
  await walk("");
}
writeFileSync(join(dir, "storage_objects.json"), JSON.stringify(objects, null, 1));
counts.push(["storage_objects (nur Liste, keine Dateien)", objects.length]);

writeFileSync(join(dir, "_info.json"), JSON.stringify({ erstellt: new Date().toISOString(), tabellen: Object.fromEntries(counts), hinweis: "Dateien aus dem Speicher sind nicht enthalten." }, null, 1));
console.log(table(["Tabelle", "Zeilen"], counts));
console.log(`\nSicherung geschrieben nach ${dir}/ (nicht eingecheckt). Die Dateien im Speicher (Pläne, PDFs) sind NICHT enthalten.`);
