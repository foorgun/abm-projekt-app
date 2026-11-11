// Feld-Inventar der Clayton-Vorlagen (Baugrundauftrag und Anlage A): liest alle Formularfelder (AcroForm) mit Typ, Seite
// und Lage. Nur lokal, ohne Netz. Schreibt docs/baugrundauftrag/clayton.json; die Tests bauen die Vorlagen daraus nach.
// Werte übernimmt das Skript nur aus schreibgeschützten Feldern und Auswahllisten: das sind Clayton-Vorgaben (Formular-Nr.,
// Anzahl Sondierungen, Preise), keine Personendaten.
//   node scripts/baugrundauftrag/felder.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField } from "pdf-lib";

const ORDNER = "vorlagen/clayton";
const TEILE = {
  auftrag: "Auftragsformular Bauherr allgemein 2 RKS 924,36 € netto F324 -2024- (1).pdf",
  anlage: "Anlage zum Baugrundauftrag (1).pdf",
};
const typOf = (f) => (f instanceof PDFTextField ? "Text" : f instanceof PDFCheckBox ? "Checkbox" : f instanceof PDFRadioGroup ? "Radio" : f instanceof PDFDropdown ? "Dropdown" : f.constructor.name.replace(/^PDF/, ""));
const r1 = (n) => Math.round(n * 10) / 10;

const out = { quelle: "clayton Umwelt-Consult GmbH, Auftragsformular F324 (2024) und Anlage A (2023)", teile: {} };
for (const [teil, datei] of Object.entries(TEILE)) {
  const doc = await PDFDocument.load(readFileSync(`${ORDNER}/${datei}`));
  const pages = doc.getPages();
  const felder = [];
  for (const f of doc.getForm().getFields()) {
    const typ = typOf(f);
    const nurLesen = f.isReadOnly();
    let wert = null;
    if (typ === "Text" && nurLesen) wert = f.getText() ?? null;
    if (typ === "Dropdown") wert = f.getSelected()[0] ?? null;
    f.acroField.getWidgets().forEach((w, i) => {
      const r = w.getRectangle();
      felder.push({
        name: f.getName(),
        typ,
        widget: i + 1,
        seite: pages.findIndex((p) => p.ref === w.P()) + 1,
        x: r1(r.x),
        y: r1(r.y),
        breite: r1(r.width),
        hoehe: r1(r.height),
        nurLesen,
        wert,
        optionen: typ === "Dropdown" ? f.getOptions() : null,
      });
    });
  }
  out.teile[teil] = { datei, seiten: doc.getPageCount(), seitenformat: [r1(pages[0].getWidth()), r1(pages[0].getHeight())], felder };
}
mkdirSync("docs/baugrundauftrag", { recursive: true });
writeFileSync("docs/baugrundauftrag/clayton.json", `${JSON.stringify(out, null, 2)}\n`);
console.log("docs/baugrundauftrag/clayton.json", Object.entries(out.teile).map(([k, v]) => `${k}: ${v.felder.length} Widgets`).join(", "));
