// Feld-Inventar der Planungsprotokoll-Vorlagen: liest alle Formularfelder (AcroForm) und die Beschriftung daneben.
// Nur lokal, ohne Netz. Schreibt docs/planungsprotokoll/<vorlage>.json (maschinenlesbar) und den Rohstoff für
// docs/planungsprotokoll-felder.md (siehe bericht.mjs). Inhalte vorhandener Textfelder werden NICHT übernommen.
//   node scripts/planungsprotokoll/felder.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFRef, PDFTextField } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { klassifiziere } from "./klassen.mjs";
import { VORLAGEN, VORLAGEN_DIR } from "./vorlagen.mjs";

const typOf = (f) =>
  f instanceof PDFTextField ? "Text" : f instanceof PDFCheckBox ? "Checkbox" : f instanceof PDFRadioGroup ? "Radio" : f instanceof PDFDropdown ? "Dropdown" : f instanceof PDFOptionList ? "Liste" : f.constructor.name.replace(/^PDF/, "");

/** Textstücke je Seite (pdf.js) mit Position und Schrifthöhe. Koordinaten wie im PDF (Ursprung unten links). */
async function seitenText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const seiten = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    seiten.push(
      tc.items
        .filter((i) => i.str && i.str.trim())
        .map((i) => ({ text: i.str.replace(/\s+/g, " ").trim(), x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 8 })),
    );
  }
  await doc.destroy();
  return seiten;
}

/** Stücke zu Zeilen (gleiche Grundlinie ±2 pt), links nach rechts. */
function zeilen(items) {
  const out = [];
  for (const i of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const z = out.find((l) => Math.abs(l.y - i.y) <= 2);
    if (z) z.items.push(i);
    else out.push({ y: i.y, items: [i] });
  }
  for (const z of out) {
    z.items.sort((a, b) => a.x - b.x);
    z.text = z.items.map((i) => i.text).join(" ").replace(/\s+/g, " ").trim();
    z.h = Math.max(...z.items.map((i) => i.h));
  }
  return out;
}

/** Abschnittsüberschriften: "1. Allgemeine Angaben …", "A1 – Angaben …", "Checkliste …" in großer Schrift. */
const KOPF = /^(\d{1,2}\.\s+\S|A\d\s*[–-]?\s*\S|Checkliste\s)/;
function ueberschriften(seiten) {
  const out = [];
  seiten.forEach((items, s) => {
    for (const z of zeilen(items)) if (z.h >= 11.5 && KOPF.test(z.text) && !/_{3,}/.test(z.text)) out.push({ seite: s + 1, y: z.y, text: z.text.slice(0, 90) });
  });
  return out;
}

/** Letzte Überschrift vor einem Feld (auf der Seite darüber oder auf einer früheren Seite); vor der ersten: Kopfdaten. */
function abschnittVon(koepfe, seite, y) {
  const davor = koepfe.filter((k) => k.seite < seite || (k.seite === seite && k.y > y));
  return davor.length ? davor[davor.length - 1].text : "0. Kopfdaten und Projektbeteiligte";
}

/**
 * Nächstgelegene Beschriftung eines Felds: bei Textfeldern das Textstück direkt links auf derselben Zeile, bei
 * Ankreuzfeldern das direkt rechts, sonst das direkt darüber. Dazu der Zeilenanfang (Frage bzw. Zeilenbezeichnung).
 */
function beschriftung(items, r, typ) {
  const mitte = r.y + r.height / 2;
  const aufZeile = items.filter((i) => Math.abs(i.y + i.h / 3 - mitte) <= Math.max(6, r.height / 2 + 2));
  const links = aufZeile.filter((i) => i.x + i.w <= r.x + 4 && r.x - (i.x + i.w) < 220).sort((a, b) => b.x + b.w - (a.x + a.w));
  const rechts = aufZeile.filter((i) => i.x >= r.x + r.width - 4 && i.x - (r.x + r.width) < 160).sort((a, b) => a.x - b.x);
  const darueber = items.filter((i) => i.y >= r.y + r.height - 2 && i.y - (r.y + r.height) < 22 && i.x < r.x + r.width && i.x + i.w > r.x - 20).sort((a, b) => a.y - b.y || a.x - b.x);
  const sauber = (t) => t.replace(/_{3,}/g, " ").replace(/\s+/g, " ").trim();
  let text = "";
  let wo = "";
  const kreuz = typ === "Checkbox" || typ === "Radio";
  for (const [list, w] of kreuz ? [[rechts, "rechts"], [links, "links"], [darueber, "darüber"]] : [[links, "links"], [darueber, "darüber"], [rechts, "rechts"]]) {
    const t = list.map((i) => sauber(i.text)).find(Boolean);
    if (t) {
      [text, wo] = [t, w];
      break;
    }
  }
  const anfang = sauber(aufZeile.filter((i) => i.x < r.x - 4).sort((a, b) => a.x - b.x).map((i) => i.text)[0] ?? "");
  return { text: text.slice(0, 120), wo, zeile: anfang.slice(0, 120) };
}

mkdirSync("docs/planungsprotokoll", { recursive: true });
const zusammenfassung = [];
for (const v of VORLAGEN) {
  const bytes = readFileSync(`${VORLAGEN_DIR}/${v.datei}`);
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const refIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));
  // Seite eines Widgets: über /P, sonst über die Annots der Seiten
  const annotSeite = new Map();
  pages.forEach((p, i) => {
    const annots = p.node.Annots();
    if (annots) for (let k = 0; k < annots.size(); k++) { const a = annots.get(k); if (a instanceof PDFRef) annotSeite.set(a.toString(), i); }
  });
  const text = await seitenText(bytes);
  const koepfe = ueberschriften(text);
  const felder = [];
  for (const f of doc.getForm().getFields()) {
    const typ = typOf(f);
    const name = f.getName();
    const optionen = f instanceof PDFRadioGroup ? f.getOptions() : f instanceof PDFDropdown || f instanceof PDFOptionList ? f.getOptions() : null;
    let vorbelegt = false;
    try {
      vorbelegt = f instanceof PDFTextField ? Boolean(f.getText()) : f instanceof PDFCheckBox ? f.isChecked() : f instanceof PDFRadioGroup ? Boolean(f.getSelected()) : false;
    } catch {}
    f.acroField.getWidgets().forEach((w, wi) => {
      const ref = doc.context.getObjectRef(w.dict)?.toString();
      const p = w.P();
      const seite = (p ? refIndex.get(p.toString()) : undefined) ?? (ref ? annotSeite.get(ref) : undefined);
      const r = w.getRectangle();
      // Exportwert eines Ankreuz-Widgets (Name des "an"-Zustands)
      const ap = w.dict.lookup(PDFName.of("AP"))?.lookup?.(PDFName.of("N"));
      const exportwert = ap?.keys ? ap.keys().map((k) => k.decodeText()).find((k) => k !== "Off") ?? null : null;
      const label = seite === undefined ? { text: "", wo: "", zeile: "" } : beschriftung(text[seite], r, typ);
      felder.push({
        name,
        typ,
        widget: wi + 1,
        widgets: f.acroField.getWidgets().length,
        seite: seite === undefined ? null : seite + 1,
        x: Math.round(r.x),
        y: Math.round(r.y),
        breite: Math.round(r.width),
        hoehe: Math.round(r.height),
        // Ankreuzfelder: Radio = eine Gruppe je Feldname; Checkboxen mit gleichem Namen teilen sich den Zustand
        gruppe: typ === "Radio" ? name : typ === "Checkbox" && f.acroField.getWidgets().length > 1 ? name : null,
        exportwert: typ === "Radio" || typ === "Checkbox" ? exportwert : null,
        optionen,
        beschriftung: label.text,
        beschriftung_lage: label.wo,
        zeilenanfang: label.zeile,
        abschnitt: seite === undefined ? "" : abschnittVon(koepfe, seite + 1, r.y + r.height),
        vorbelegt,
      });
    });
  }
  felder.sort((a, b) => (a.seite ?? 999) - (b.seite ?? 999) || b.y - a.y || a.x - b.x);
  // Einzelne Checkboxen ohne gemeinsamen Namen: Gruppe = Zeile, wenn mehrere Ankreuzfelder auf derselben Zeile stehen
  for (const f of felder) {
    if (f.typ !== "Checkbox" || f.gruppe) continue;
    const nachbarn = felder.filter((g) => g !== f && g.typ === "Checkbox" && g.seite === f.seite && Math.abs(g.y - f.y) <= 3);
    if (nachbarn.length) f.gruppe = `S. ${f.seite}, Zeile „${f.zeilenanfang || f.beschriftung}“`;
  }
  for (const f of felder) Object.assign(f, klassifiziere(v.key, f));
  const out = { vorlage: v.key, abschnitte: koepfe.map((k) => ({ seite: k.seite, text: k.text })), firma: v.firma, titel: v.titel, datei: v.datei, seiten: pages.length, seitenformat: pages.map((p) => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`), feldanzahl: doc.getForm().getFields().length, widgets: felder.length, felder };
  writeFileSync(`docs/planungsprotokoll/${v.key}.json`, JSON.stringify(out, null, 2) + "\n");
  zusammenfassung.push(`${v.firma}: ${pages.length} Seiten, ${out.feldanzahl} Felder, ${felder.length} Widgets, ohne Seite: ${felder.filter((f) => f.seite === null).length}, vorbelegt: ${felder.filter((f) => f.vorbelegt).length}`);
}
console.log(zusammenfassung.join("\n"));
