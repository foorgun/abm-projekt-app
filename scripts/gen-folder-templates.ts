// Schreibt die Ordnervorlage als SQL in Migration 0002 (zwischen BEGIN/END folder_templates).
// Quelle: docs/ordnerstruktur.md + src/data/folderHints.ts (dieselbe Funktion wie im Demo-Modus).
// Aufruf: npm run gen:folders
import { readFileSync, writeFileSync } from "node:fs";
import { buildFolderTemplates } from "../src/data/templates";

const FILE = "supabase/migrations/0002_agent_aufgaben_ordner.sql";
const q = (s: string | null) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
const arr = (xs: string[]) => (xs.length ? `array[${xs.map(q).join(", ")}]::text[]` : "'{}'");

const rows = buildFolderTemplates().map(
  (t) => `  (${q(t.path)}, ${q(t.parentPath)}, ${t.sort}, ${q(t.label)}, ${t.hasDate}, ${arr(t.keywords)}, ${q(t.description)})`,
);
const block = [
  "-- BEGIN folder_templates",
  "insert into public.folder_templates (path, parent_path, sort, label, has_date, keywords, description) values",
  rows.join(",\n") + ";",
  "-- END folder_templates",
].join("\n");

const sql = readFileSync(FILE, "utf8");
const next = sql.replace(/-- BEGIN folder_templates[\s\S]*?-- END folder_templates/, block);
if (next === sql && !sql.includes(block)) throw new Error("Marker BEGIN/END folder_templates nicht gefunden");
writeFileSync(FILE, next);
console.log(`${rows.length} Ordner nach ${FILE} geschrieben.`);
