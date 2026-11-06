// Entfernt die Testanträge, die check:roles anlegt (Urlaub 02.–03.03.2099 mit der festen Notiz aus lib/pruefdaten.ts).
// Nur diese Zeilen: alle Merkmale müssen passen. Zeigt sie vorher an. Braucht den Secret key (Löschen ist sonst gesperrt).
// Aufruf: npm run aufraeumen:pruefdaten -- --ziel development|production
import { TEST_BIS, TEST_NOTIZ, TEST_VON } from "./lib/pruefdaten";
import { adminClient, die, waehleZiel } from "./lib/server";

await waehleZiel("Testanträge der Rollenprüfung löschen", ["oeffentlich", "secret"]);
const sb = adminClient();
const found = await sb.from("abwesenheiten").select("id, status, user_id").eq("art", "urlaub").eq("von", TEST_VON).eq("bis", TEST_BIS).eq("notiz", TEST_NOTIZ);
if (found.error) die(`Lesen fehlgeschlagen: ${found.error.message}`);
const rows = (found.data ?? []) as { id: string; status: string; user_id: string }[];
if (!rows.length) {
  console.log("Keine Testanträge vorhanden, nichts zu tun.");
  process.exit(0);
}
for (const r of rows) console.log(`  ${r.id}  ${TEST_VON} bis ${TEST_BIS}  ${r.status}`);
// Beim Löschen dieselben Merkmale noch einmal: nur Zeilen, die gerade angezeigt wurden und weiter passen
const del = await sb.from("abwesenheiten").delete().in("id", rows.map((r) => r.id)).eq("art", "urlaub").eq("von", TEST_VON).eq("bis", TEST_BIS).eq("notiz", TEST_NOTIZ).select("id");
if (del.error) die(`Löschen fehlgeschlagen: ${del.error.message}`);
console.log(`${del.data?.length ?? 0} von ${rows.length} Testanträgen gelöscht.`);
