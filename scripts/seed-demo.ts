// Erfundene Demo-Daten in die ECHTE Datenbank laden oder wieder entfernen. Echte Daten werden nie angefasst:
// jede Demo-Zeile trägt is_demo = true bzw. hängt per Fremdschlüssel an einer solchen Zeile.
//
//   npm run seed:demo                 lädt die Demo-Daten (braucht den Secret key in .env.server)
//   npm run seed:demo -- --loeschen   entfernt ALLE Demo-Daten wieder (Secret key)
//   npm run seed:demo -- --sql        schreibt stattdessen SQL nach supabase/.out/ (kein Schlüssel nötig):
//                                     demo-seed.sql und demo-loeschen.sql, zum Einfügen in den SQL-Editor
import { mkdirSync, writeFileSync } from "node:fs";
import { absenceSeedRows, absenceSeedSql } from "../src/data/demoAbwesenheit";
import { buildDemoDataset } from "../src/data/demoData";
import { buildSeedTables, deleteDemoSql, DELETE_ORDER, LINK_ATTACHMENTS_SQL, REAL_COMPANY_ID, seedSql, type SeedRow } from "../src/data/seedRows";
import { todayIso } from "../src/lib/format";
import { adminClient, die, table } from "./lib/server";

const args = new Set(process.argv.slice(2));
const tables = buildSeedTables(buildDemoDataset(todayIso()));
const total = tables.reduce((n, t) => n + t.rows.length, 0);

if (args.has("--sql")) {
  mkdirSync("supabase/.out", { recursive: true });
  // Abwesenheiten hängen an vorhandenen Konten: das SQL sucht sie selbst heraus (ohne Konten wird nichts eingefügt)
  writeFileSync("supabase/.out/demo-seed.sql", seedSql(tables) + absenceSeedSql(todayIso()));
  writeFileSync("supabase/.out/demo-loeschen.sql", deleteDemoSql());
  console.log(`${total} Zeilen in ${tables.length} Tabellen → supabase/.out/demo-seed.sql`);
  console.log("Löschen aller Demo-Daten → supabase/.out/demo-loeschen.sql");
  process.exit(0);
}

const sb = adminClient();

async function countDemo(): Promise<[string, number][]> {
  const out: [string, number][] = [];
  for (const t of DELETE_ORDER) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true }).eq("is_demo", true);
    if (error) die(`${t}: ${error.message}\nSind die Migrationen bis 0012 angewendet?`);
    out.push([t, count ?? 0]);
  }
  return out;
}

async function deleteDemo(): Promise<void> {
  for (const t of DELETE_ORDER) {
    const { error } = await sb.from(t).delete().eq("is_demo", true);
    if (error) die(`Löschen in ${t} fehlgeschlagen: ${error.message}`);
  }
}

if (args.has("--loeschen")) {
  const before = await countDemo();
  await deleteDemo();
  const after = await countDemo();
  console.log(table(["Tabelle", "Demo-Zeilen vorher", "nachher"], before.map(([t, n], i) => [t, n, after[i][1]])));
  console.log("\nDemo-Daten entfernt. Abhängige Zeilen (Schritte, Rechnungen, Dokumente, Mails …) sind mit gelöscht. Echte Daten wurden nicht berührt.");
  process.exit(0);
}

// ---- Laden
const existing = await countDemo();
if (existing.some(([, n]) => n > 0)) {
  console.log(table(["Tabelle", "Demo-Zeilen"], existing));
  die("\nEs sind schon Demo-Daten vorhanden. Erst entfernen: npm run seed:demo -- --loeschen");
}
const companies = await sb.from("companies").select("id, name").in("id", Object.values(REAL_COMPANY_ID));
if (companies.error) die(companies.error.message);
if ((companies.data ?? []).length !== 3) die("Die drei Hausbaufirmen aus Migration 0007 fehlen. Bitte zuerst die Migrationen anwenden.");

const done: [string, number][] = [];
try {
  for (const t of tables) {
    for (let i = 0; i < t.rows.length; i += 500) {
      const chunk: SeedRow[] = t.rows.slice(i, i + 500);
      const { error } = await sb.from(t.table).insert(chunk);
      if (error) throw new Error(`${t.table}: ${error.message}`);
    }
    done.push([t.table, t.rows.length]);
  }
  // Anhänge mit ihren Dokumenten verknüpfen (gegenseitiger Verweis; entspricht LINK_ATTACHMENTS_SQL)
  const docs = tables.find((t) => t.table === "documents")!.rows.filter((r) => r.source_item_id);
  for (let i = 0; i < docs.length; i += 100) {
    await Promise.all(
      docs.slice(i, i + 100).map(async (doc) => {
        const { error } = await sb.from("inbox_attachments").update({ document_id: doc.id, storage_path: doc.storage_path }).eq("id", doc.source_item_id as string);
        if (error) throw new Error(`inbox_attachments: ${error.message}`);
      }),
    );
  }
  // Urlaub und Krankheit: Anträge in allen Stati und eine Krankmeldung, an den vorhandenen Konten (Admins zuerst)
  const staff = await sb.from("user_roles").select("user_id, role").in("role", ["admin", "mitarbeiter"]);
  if (staff.error) throw new Error(`user_roles: ${staff.error.message}`);
  const ids = (staff.data ?? []).sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin") || a.user_id.localeCompare(b.user_id)).map((r) => r.user_id);
  const absences = absenceSeedRows(ids, todayIso());
  if (absences.length) {
    const { error } = await sb.from("abwesenheiten").insert(absences);
    if (error) throw new Error(`abwesenheiten: ${error.message}`);
  }
  done.push([`abwesenheiten (für ${Math.min(ids.length, 4)} Konten)`, absences.length]);
} catch (e) {
  // Die API kennt keine Transaktion über mehrere Aufrufe: bei einem Fehler alles Geladene wieder entfernen
  console.error(`\nFehler beim Laden: ${e instanceof Error ? e.message : e}\nEntferne die bereits geladenen Demo-Zeilen wieder …`);
  await deleteDemo();
  die("Nichts geladen. Die Datenbank ist im Zustand von vorher.");
}
void LINK_ATTACHMENTS_SQL;
console.log(table(["Tabelle", "Zeilen geladen"], done));
console.log(`\n${total} Demo-Zeilen geladen. Entfernen: npm run seed:demo -- --loeschen`);
