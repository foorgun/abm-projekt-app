// Fasst alle Migrationen in der richtigen Reihenfolge zu EINER Datei zusammen,
// zum Einfügen in den SQL-Editor von Supabase (docs/supabase-einrichten.md).
// Enthält nur das Schema, keine Zugangsdaten. Aufruf: npm run db:bundle [-- --ab 0004]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const from = process.argv.includes("--ab") ? process.argv[process.argv.indexOf("--ab") + 1] : "0000";
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f.slice(0, 4) >= from).sort();
if (!files.length) {
  console.error(`Keine Migration ab ${from} gefunden.`);
  process.exit(1);
}

const parts = [
  `-- ABM Projekt-App: Migrationen ${files[0].slice(0, 4)} bis ${files.at(-1).slice(0, 4)} in einem Stück.`,
  "-- ERZEUGT von scripts/db-bundle.mjs. Nicht bearbeiten, nicht einchecken.",
  "-- Alles oder nichts: schlägt eine Anweisung fehl, wird nichts übernommen.",
  "begin;",
  ...files.map((f) => `\n-- ============================================================ ${f}\n${readFileSync(join(dir, f), "utf8").trim()}\n`),
  "commit;",
  "",
  "-- Daten-API soll die neuen Tabellen sofort kennen",
  "notify pgrst, 'reload schema';",
  "",
];
const out = join(root, "supabase", ".out");
mkdirSync(out, { recursive: true });
const name = from === "0000" ? "migrationen-gesamt.sql" : `migrationen-ab-${from}.sql`;
writeFileSync(join(out, name), parts.join("\n"));
console.log(`${files.length} Migrationen → supabase/.out/${name}`);
for (const f of files) console.log("  " + f);
