// Lädt die PDF-Vorlagen des Planungsprotokolls aus vorlagen/planungsprotokoll/ in den privaten Bucket "vorlagen"
// (Migration 0014). Die Vorlagen sind Firmendokumente und liegen nicht im Repo. Braucht den Secret key in .env.server.
// Vor dem Hochladen prüft das Skript jede Datei: lesbares PDF und alle Felder, die die App auf Seite 1 befüllt, vorhanden.
//
//   npm run vorlagen:hochladen                 lädt fehlende Vorlagen hoch, vorhandene bleiben unverändert
//   npm run vorlagen:hochladen -- --ersetzen   ersetzt vorhandene (z. B. nach einer neuen Revision der Hausbaufirma)
import { existsSync, readFileSync } from "node:fs";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { VORLAGEN_BUCKET, VORLAGEN_LISTE, VORLAGEN_ORDNER } from "../src/lib/planungsprotokoll/vorlagen";
import { ZUORDNUNG } from "../src/lib/planungsprotokoll/zuordnung";
import { adminClient, die, table } from "./lib/server";

const ersetzen = process.argv.includes("--ersetzen");
const sb = adminClient();

const { data: buckets, error: bucketError } = await sb.storage.listBuckets();
if (bucketError) die(`Speicher nicht erreichbar: ${bucketError.message}`);
if (!buckets?.some((b) => b.id === VORLAGEN_BUCKET)) die(`Den Bucket „${VORLAGEN_BUCKET}“ gibt es noch nicht. Erst Migration 0014 anwenden (npm run db:bundle -- --ab 0013).`);
if (buckets.find((b) => b.id === VORLAGEN_BUCKET)?.public) die(`Der Bucket „${VORLAGEN_BUCKET}“ ist öffentlich. Er muss privat sein (Migration 0014 legt ihn privat an).`);

const rows: string[][] = [];
let failed = 0;
for (const v of VORLAGEN_LISTE) {
  const datei = `${VORLAGEN_ORDNER}/${v.datei}`;
  if (!existsSync(datei)) {
    failed++;
    rows.push([v.firma, v.datei, "FEHLT", `Datei nicht gefunden in ${VORLAGEN_ORDNER}/`]);
    continue;
  }
  const bytes = readFileSync(datei);
  // Prüfen, bevor etwas hochgeht: passt die Vorlage zur Feldzuordnung der App?
  let fehlend: string[] = [];
  try {
    const form = (await PDFDocument.load(bytes)).getForm();
    fehlend = Object.keys(ZUORDNUNG[v.key]).filter((name) => !(form.getFieldMaybe(name) instanceof PDFTextField));
  } catch {
    failed++;
    rows.push([v.firma, v.datei, "FEHLER", "keine lesbare PDF-Datei"]);
    continue;
  }
  if (fehlend.length) {
    failed++;
    rows.push([v.firma, v.datei, "FEHLER", `passt nicht zur Zuordnung, es fehlen ${fehlend.length} Felder (z. B. ${fehlend.slice(0, 3).join(", ")})`]);
    continue;
  }
  const { error } = await sb.storage.from(VORLAGEN_BUCKET).upload(v.speicherPfad, bytes, { contentType: "application/pdf", upsert: ersetzen });
  if (error && /exists|duplicate/i.test(error.message)) rows.push([v.firma, v.speicherPfad, "liegt schon", "unverändert (mit --ersetzen neu hochladen)"]);
  else if (error) {
    failed++;
    rows.push([v.firma, v.speicherPfad, "FEHLER", error.message]);
  } else rows.push([v.firma, v.speicherPfad, ersetzen ? "hochgeladen/ersetzt" : "hochgeladen", `${(bytes.length / 1e6).toFixed(1)} MB`]);
}
console.log(table(["Hausbaufirma", "Pfad", "Ergebnis", "Hinweis"], rows));
process.exit(failed ? 1 : 0);
