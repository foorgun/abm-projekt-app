// Fasst alle Migrationen in der richtigen Reihenfolge zu EINER Datei zusammen,
// zum Einfügen in den SQL-Editor von Supabase (docs/supabase-einrichten.md).
// Enthält nur das Schema, keine Zugangsdaten. Aufruf: npm run db:bundle -- --ziel development|production [--ab 0004]
// Einspielen: npm run db:einspielen (nie supabase db push, siehe docs/supabase-einrichten.md).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { waehleZiel } from "./lib/server";
import { ZIELE } from "./lib/ziele";

const ziel = await waehleZiel("Migrationsdatei erzeugen (spielt noch nichts ein)", []);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
// "--ab 15" und "--ab 0015" sind gleich: die Nummern werden als Zahl verglichen, nicht als Text
const ab = process.argv.includes("--ab") ? process.argv[process.argv.indexOf("--ab") + 1] : "0";
if (!/^\d{1,4}$/.test(ab ?? "")) {
  console.error(`Ungültige Angabe bei --ab: "${ab ?? ""}". Erwartet wird die Nummer einer Migration, z. B. --ab 15 oder --ab 0015.`);
  process.exit(1);
}
const from = ab.padStart(4, "0");
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= Number(ab)).sort();
if (!files.length) {
  console.error(`Keine Migration ab ${from} gefunden.`);
  process.exit(1);
}

const parts = [
  `-- ABM Projekt-App: Migrationen ${files[0].slice(0, 4)} bis ${files.at(-1).slice(0, 4)} in einem Stück.`,
  `-- ZIEL: ${ziel} (${ZIELE[ziel].ref}). ERZEUGT von scripts/db-bundle.mjs. Nicht bearbeiten, nicht einchecken.`,
  "-- Alles oder nichts: schlägt eine Anweisung fehl, wird nichts übernommen.",
  "begin;",
  ...files.map((f) => `\n-- ============================================================ ${f}\n${readFileSync(join(dir, f), "utf8").trim()}\n`),
  "commit;",
  "",
  "-- Daten-API soll die neuen Tabellen sofort kennen",
  "notify pgrst, 'reload schema';",
  "",
];
const out = join(root, "supabase", ".out", ziel);
mkdirSync(out, { recursive: true });
const name = from === "0000" ? "migrationen-gesamt.sql" : `migrationen-ab-${from}.sql`;
writeFileSync(join(out, name), parts.join("\n"));
console.log(`${files.length} Migrationen → supabase/.out/${ziel}/${name}`);
for (const f of files) console.log("  " + f);
