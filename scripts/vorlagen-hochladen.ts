// Lädt die PDF-Vorlagen in den privaten Bucket "vorlagen" (Migration 0014): Planungsprotokoll aus vorlagen/planungsprotokoll/
// und Baugrundauftrag an Clayton (Auftragsformular, Anlage A) aus vorlagen/clayton/. Die Vorlagen sind Firmendokumente
// und liegen nicht im Repo. Braucht den Secret key.
// Vor dem Hochladen prüft das Skript jede Datei: lesbares PDF und alle Felder, die die App befüllt bzw. ankreuzt, vorhanden.
//
//   npm run vorlagen:hochladen -- --ziel <ziel>              lädt fehlende Vorlagen hoch, vorhandene bleiben unverändert
//   npm run vorlagen:hochladen -- --ziel <ziel> --ersetzen   ersetzt vorhandene (z. B. nach einer neuen Revision der Hausbaufirma)
import { existsSync, readFileSync } from "node:fs";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { ankreuzen, feldwerte, type BaugrundDaten } from "../src/lib/baugrundauftrag/daten";
import { BAUGRUND_VORLAGEN_LISTE, BAUGRUND_VORLAGEN_ORDNER } from "../src/lib/baugrundauftrag/vorlagen";
import { VORLAGEN_BUCKET, VORLAGEN_LISTE, VORLAGEN_ORDNER } from "../src/lib/planungsprotokoll/vorlagen";
import { ZUORDNUNG } from "../src/lib/planungsprotokoll/zuordnung";
import { adminClient, die, table, waehleZiel } from "./lib/server";

const ersetzen = process.argv.includes("--ersetzen");
await waehleZiel(ersetzen ? "Vorlagen hochladen und ersetzen" : "Vorlagen hochladen", ["oeffentlich", "secret"]);
const sb = adminClient();

const { data: buckets, error: bucketError } = await sb.storage.listBuckets();
if (bucketError) die(`Speicher nicht erreichbar: ${bucketError.message}`);
if (!buckets?.some((b) => b.id === VORLAGEN_BUCKET)) die(`Den Bucket „${VORLAGEN_BUCKET}“ gibt es noch nicht. Erst Migration 0014 anwenden (npm run db:bundle -- --ab 0013).`);
if (buckets.find((b) => b.id === VORLAGEN_BUCKET)?.public) die(`Der Bucket „${VORLAGEN_BUCKET}“ ist öffentlich. Er muss privat sein (Migration 0014 legt ihn privat an).`);

// Felder des Baugrundauftrags (Namen hängen nicht von den Werten ab) und die Kästchen, die die App ankreuzt
const leer: BaugrundDaten = {
  auftraggeber: { namen: null, strasse: null, plzOrt: null, tel: null, email: null },
  hersteller: { firma: null, projektNr: null, ansprechpartner: null, tel: null, email: null },
  planer: { name: null, tel: null, email: null },
  bauort: { strasse: null, plzOrt: null, gemarkung: null, flurstueck: null },
  keller: null,
};
const baugrundFelder = feldwerte(leer);
// alle Kästchen, die die App ankreuzen kann (mit E-Mail des Bauherrn); sie liegen alle im Auftragsformular
const ANKREUZ: Record<string, string[]> = { auftrag: ankreuzen({ ...leer, auftraggeber: { ...leer.auftraggeber, email: "x@example.de" } }), anlage: [] };

const alle = [
  ...VORLAGEN_LISTE.map((v) => ({ wer: v.firma, ordner: VORLAGEN_ORDNER, datei: v.datei, speicherPfad: v.speicherPfad, text: Object.keys(ZUORDNUNG[v.key]), kreuze: [] as string[] })),
  ...BAUGRUND_VORLAGEN_LISTE.map((v) => ({ wer: v.label, ordner: BAUGRUND_VORLAGEN_ORDNER, datei: v.datei, speicherPfad: v.speicherPfad, text: Object.keys(baugrundFelder[v.key]), kreuze: ANKREUZ[v.key] })),
];

const rows: string[][] = [];
let failed = 0;
for (const v of alle) {
  const datei = `${v.ordner}/${v.datei}`;
  if (!existsSync(datei)) {
    failed++;
    rows.push([v.wer, v.datei, "FEHLT", `Datei nicht gefunden in ${v.ordner}/`]);
    continue;
  }
  const bytes = readFileSync(datei);
  // Prüfen, bevor etwas hochgeht: passt die Vorlage zur Feldzuordnung der App?
  let fehlend: string[] = [];
  try {
    const form = (await PDFDocument.load(bytes)).getForm();
    fehlend = [...v.text.filter((name) => !(form.getFieldMaybe(name) instanceof PDFTextField)), ...v.kreuze.filter((name) => !(form.getFieldMaybe(name) instanceof PDFCheckBox))];
  } catch {
    failed++;
    rows.push([v.wer, v.datei, "FEHLER", "keine lesbare PDF-Datei"]);
    continue;
  }
  if (fehlend.length) {
    failed++;
    rows.push([v.wer, v.datei, "FEHLER", `passt nicht zur Zuordnung, es fehlen ${fehlend.length} Felder (z. B. ${fehlend.slice(0, 3).join(", ")})`]);
    continue;
  }
  const { error } = await sb.storage.from(VORLAGEN_BUCKET).upload(v.speicherPfad, bytes, { contentType: "application/pdf", upsert: ersetzen });
  if (error && /exists|duplicate/i.test(error.message)) rows.push([v.wer, v.speicherPfad, "liegt schon", "unverändert (mit --ersetzen neu hochladen)"]);
  else if (error) {
    failed++;
    rows.push([v.wer, v.speicherPfad, "FEHLER", error.message]);
  } else rows.push([v.wer, v.speicherPfad, ersetzen ? "hochgeladen/ersetzt" : "hochgeladen", `${(bytes.length / 1e6).toFixed(1)} MB`]);
}
console.log(table(["Vorlage", "Pfad", "Ergebnis", "Hinweis"], rows));
process.exit(failed ? 1 : 0);
