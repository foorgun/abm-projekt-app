// Machbarkeitstest: füllt Seite 1 jeder Vorlage mit einem erfundenen Demo-Projekt (pdf-lib, nicht flach gemacht)
// und prüft, dass alle übrigen Felder unverändert bleiben. Ausgabe: screenshots/planungsprotokoll/ (nicht im Repo).
// Aufruf: node scripts/planungsprotokoll/befuellen.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PDFCheckBox, PDFDocument, PDFName, PDFRadioGroup, PDFTextField } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { VORLAGEN, VORLAGEN_DIR } from "./vorlagen.mjs";

const require = createRequire(import.meta.url);
// Unicode-Schrift mit ä ö ü ß (SIL OFL, liegt pdfjs-dist bei). Die Vorlagen nennen Calibri/Helv ohne eingebettete Glyphen.
const SCHRIFT = readFileSync(require.resolve("pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"));
const OUT = "screenshots/planungsprotokoll";

/** Erfundenes Demo-Projekt in der Form des vorgeschlagenen Datenmodells (siehe docs/planungsprotokoll-analyse.md). */
const DEMO = {
  projektNr: "HB-2026-0815",
  bauherr: { name: "Jörg und Bärbel Müller-Weißgerber", strasse: "Größlestraße 7", plzOrt: "89077 Ulm-Söflingen", mobil: "0170 0000001", mail: "mueller-weissgerber@example.de" },
  bauort: { strasse: "Am Hölzle 12 (Baugebiet Kühäcker)", plzOrt: "89134 Blaustein", gemarkung: "Bermaringen", ortsteil: "Bermaringen", flurstueck: "Flur 3, Flst. 1234/5", bundesland: "Baden-Württemberg" },
  rollen: {
    architekt: { name: "ABM Demo-Architektin Dörte Fuß", tel: "0731 0000010", mobil: "0170 0000010", mail: "architektur@example.de" },
    vermesser: { name: "Vermessungsbüro Kößler (erfunden)", tel: "0731 0000020", mobil: "0170 0000020", mail: "koessler@example.de" },
    bodengutachter: { name: "Baugrund Süß GmbH (erfunden)", tel: "0731 0000030", mobil: "0170 0000030", mail: "suess@example.de" },
    erdbau: { name: "Erdbau Grübel KG (erfunden)", tel: "0731 0000040", mobil: "0170 0000040", mail: "gruebel@example.de" },
    keller: { name: "Kellerbau Löffler (erfunden)", tel: "0731 0000050", mobil: "0170 0000050", mail: "loeffler@example.de" },
    gemeinde: { name: "Gemeinde Blaustein, Bürgerbüro", tel: "0731 0000060", mail: "gemeinde@example.de", fax: "0731 0000061" },
    bauamt: { name: "Baurechtsamt (erfunden), Straße der Ämter 1", tel: "0731 0000070", mobil: "0170 0000070", mail: "bauamt@example.de", fax: "0731 0000071" },
    schornsteinfeger: { name: "Schornsteinfeger Rußwurm (erfunden)", tel: "0731 0000080", mobil: "0170 0000080", mail: "russwurm@example.de" },
    strom: { name: "Stadtwerke Überall (erfunden)", tel: "0731 0000090", mail: "strom@example.de" },
    gas: { name: "Gasversorgung Höhenweg (erfunden)", tel: "0731 0000100", mail: "gas@example.de" },
    fernwaerme: { name: "Wärmenetz Ölmühle (erfunden)", tel: "0731 0000110", mail: "waerme@example.de" },
    wasser: { name: "Zweckverband Wasser Älbler (erfunden)", tel: "0731 0000120", mail: "wasser@example.de" },
    abwasser: { name: "Abwasserverband Flußtal (erfunden)", tel: "0731 0000130", mail: "abwasser@example.de" },
  },
};

/** Zuordnung Datenfeld → Feldname je Vorlage (nur Seite 1). */
function werte(vorlage) {
  const r = DEMO.rollen;
  if (vorlage === "schwabenhaus") {
    const out = {
      "BV-Nr": DEMO.projektNr,
      BauherrName: DEMO.bauherr.name, BauherrStraße: DEMO.bauherr.strasse, BauherrOrt: DEMO.bauherr.plzOrt, BauherrMobil: DEMO.bauherr.mobil, BauherrMail: DEMO.bauherr.mail,
      BauortPLZ: DEMO.bauort.plzOrt, BauortStr: DEMO.bauort.strasse, BauortGemarkung: DEMO.bauort.gemarkung, BauortOrtsteil: DEMO.bauort.ortsteil, BauortFlurstück: DEMO.bauort.flurstueck, BauortBundesland: DEMO.bauort.bundesland,
    };
    const prefix = { Architekt: "architekt", Vermesser: "vermesser", BGGutachter: "bodengutachter", Erdbau: "erdbau", Keller: "keller" };
    for (const [p, k] of Object.entries(prefix)) Object.assign(out, { [`${p}Name`]: r[k].name, [`${p}Tel`]: r[k].tel, [`${p}Mobil`]: r[k].mobil, [`${p}Mail`]: r[k].mail });
    Object.assign(out, { Gemeinde: r.gemeinde.name, GemeindeTel: r.gemeinde.tel, GemeindeMail: r.gemeinde.mail, GemeindeFax: r.gemeinde.fax });
    Object.assign(out, { Bauamt: r.bauamt.name, BauamtTel: r.bauamt.tel, BauamtMail: r.bauamt.mail, BauamtFax: r.bauamt.fax });
    return out;
  }
  const t = (n) => `Textfeld 1.${n}`;
  const out = {
    [t("01")]: DEMO.projektNr,
    [t("02")]: DEMO.bauherr.name, [t("03")]: DEMO.bauherr.strasse, [t("05")]: DEMO.bauherr.plzOrt, [t("04")]: DEMO.bauherr.mobil, [t("06")]: DEMO.bauherr.mail,
    [t("07")]: DEMO.bauort.strasse, [t("10")]: DEMO.bauort.plzOrt, [t("08")]: DEMO.bauort.gemarkung, [t("11")]: DEMO.bauort.ortsteil, [t("09")]: DEMO.bauort.flurstueck, [t("12")]: DEMO.bauort.bundesland,
  };
  const rollen = [
    ["architekt", "13", "14", "15", "16"], ["vermesser", "17", "29", "28", "27"], ["keller", "18", "32", "31", "30"], ["erdbau", "19", "35", "34", "33"],
    ["bauamt", "20", "38", "37", "36"], ["schornsteinfeger", "21", "41", "40", "39"], ["strom", "22", "44", null, "43"], ["gas", "23", "42", null, "47"],
    ["fernwaerme", "24", "46", null, "45"], ["wasser", "25", "50", null, "49"], ["abwasser", "26", "48", null, "51"],
  ];
  for (const [k, name, tel, mobil, mail] of rollen) {
    Object.assign(out, { [t(name)]: r[k].name, [t(tel)]: r[k].tel, [t(mail)]: r[k].mail });
    if (mobil) out[t(mobil)] = r[k].mobil;
  }
  return out;
}

/** Zustand aller Felder: Wert bzw. Ankreuzstatus und die Appearance-Objekte der Widgets. */
function zustand(doc) {
  const out = {};
  for (const f of doc.getForm().getFields()) {
    let wert = null;
    // Rohwert statt getText(): pdf-lib liest Rich-Text-Felder (z. B. Schwabenhaus "WasserschutzgebietAuflagen") nicht
    if (f instanceof PDFTextField) wert = f.isRichFormatted() ? `RV:${String(f.acroField.dict.get(PDFName.of("V")) ?? "")}` : (f.getText() ?? "");
    else if (f instanceof PDFCheckBox) wert = f.isChecked();
    else if (f instanceof PDFRadioGroup) wert = f.getSelected() ?? null;
    const ap = f.acroField.getWidgets().map((w) => `${String(w.dict.get(PDFName.of("AS")) ?? "")}|${String(w.dict.get(PDFName.of("AP")) ?? "")}`);
    out[f.getName()] = { typ: f.constructor.name, wert, ap };
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const v of VORLAGEN) {
  const bytes = readFileSync(`${VORLAGEN_DIR}/${v.datei}`);
  const doc = await PDFDocument.load(bytes);
  doc.registerFontkit(fontkit);
  const schrift = await doc.embedFont(SCHRIFT, { subset: false });
  const vorher = zustand(doc);
  const form = doc.getForm();
  const soll = werte(v.key);
  const fehlend = [];
  for (const [name, wert] of Object.entries(soll)) {
    const f = form.getFieldMaybe(name);
    if (!(f instanceof PDFTextField)) {
      fehlend.push(name);
      continue;
    }
    const max = f.getMaxLength();
    const text = max !== undefined && wert.length > max ? wert.slice(0, max) : wert;
    f.setText(text);
    // Die Vorlagen stehen auf Auto-Größe ("0 Tf"): ergibt in mehrzeiligen Feldern Riesenschrift. Fest 9 pt, bei
    // langen Werten kleiner, bis der Text in die Breite passt (mindestens 6 pt).
    const breite = Math.min(...f.acroField.getWidgets().map((w) => w.getRectangle().width)) - 10; // Innenabstand von pdf-lib
    let groesse = 9;
    while (groesse > 6 && schrift.widthOfTextAtSize(text, groesse) > breite) groesse -= 0.5;
    f.setFontSize(groesse);
    f.updateAppearances(schrift);
  }
  const ausgabe = `${OUT}/${v.key}-seite1.pdf`;
  // Keine globale Neuberechnung: nur die gesetzten Felder haben neue Appearances (Ankreuzfelder bleiben, wie sie sind)
  writeFileSync(ausgabe, await doc.save({ updateFieldAppearances: false }));

  const nachher = zustand(await PDFDocument.load(readFileSync(ausgabe)));
  const geaendert = Object.keys(vorher).filter((n) => JSON.stringify(vorher[n]) !== JSON.stringify(nachher[n]));
  const unerwartet = geaendert.filter((n) => !(n in soll));
  const falsch = Object.entries(soll).filter(([n, w]) => nachher[n] && nachher[n].wert !== w).map(([n]) => n);
  const kreuze = Object.values(nachher).filter((z) => z.typ !== "PDFTextField" && z.typ !== "PDFButton");
  console.log(
    `${v.firma}: ${Object.keys(soll).length} Felder gesetzt, nicht gefunden: ${fehlend.length ? fehlend.join(", ") : "keine"}; ` +
      `Wert abweichend: ${falsch.length ? falsch.join(", ") : "keiner"}; sonst geändert: ${unerwartet.length ? unerwartet.join(", ") : "nichts"} ` +
      `(${kreuze.length} Ankreuzfelder geprüft) → ${ausgabe}`,
  );
  if (fehlend.length || falsch.length || unerwartet.length) process.exitCode = 1;
}
