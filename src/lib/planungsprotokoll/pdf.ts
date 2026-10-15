// Planungsprotokoll erzeugen: Formularfelder von Seite 1 füllen (pdf-lib), prüfen, dass sonst nichts verändert wurde,
// und auf Wunsch eine flache Fassung erzeugen (Felder eingebrannt, nicht mehr bearbeitbar).
// Läuft im Browser und in Node (Tests). Wird erst beim Erzeugen nachgeladen (pdf-lib ist groß).

import fontkit from "@pdf-lib/fontkit";
import {
  concatTransformationMatrix,
  drawObject,
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRadioGroup,
  PDFRef,
  PDFStream,
  PDFTextField,
  popGraphicsState,
  pushGraphicsState,
  type PDFFont,
} from "pdf-lib";
import type { ProtokollVariante } from "../types";

/** Schriftgröße der eingetragenen Werte; bei langen Werten kleiner, bis sie passen, aber nie unter MIN. */
export const SCHRIFT_PT = 9;
export const SCHRIFT_MIN_PT = 6;

/** Die Prüfung nach dem Befüllen ist fehlgeschlagen: es gibt kein PDF. */
export class ProtokollFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtokollFehler";
  }
}

export interface ErzeugtesProtokoll {
  bytes: Uint8Array;
  /** Felder, die einen Wert bekommen haben */
  gesetzt: string[];
  /** Zugeordnete Felder ohne Wert (bleiben leer) */
  leer: string[];
}

type Bytes = Uint8Array | ArrayBuffer;

// ---------------------------------------------------------------------------
// Zustand aller Felder: Wert bzw. Ankreuzstatus und Erscheinungsbild jedes Widgets
// ---------------------------------------------------------------------------

export type FeldZustand = Record<string, { typ: string; wert: string | boolean | null; ap: string[] }>;

export function feldZustand(doc: PDFDocument): FeldZustand {
  const out: FeldZustand = {};
  for (const f of doc.getForm().getFields()) {
    let wert: string | boolean | null = null;
    // Rich-Text-Felder liest pdf-lib nicht: dort den Rohwert vergleichen
    if (f instanceof PDFTextField) wert = f.isRichFormatted() ? `RV:${String(f.acroField.dict.get(PDFName.of("V")) ?? "")}` : (f.getText() ?? "");
    else if (f instanceof PDFCheckBox) wert = f.isChecked();
    else if (f instanceof PDFRadioGroup) wert = f.getSelected() ?? null;
    const ap = f.acroField.getWidgets().map((w) => `${String(w.dict.get(PDFName.of("AS")) ?? "")}|${String(w.dict.get(PDFName.of("AP")) ?? "")}`);
    out[f.getName()] = { typ: f.constructor.name, wert, ap };
  }
  return out;
}

/**
 * Vergleich vorher/nachher. Erlaubt sind Änderungen nur an `gesetzt`; dort muss der Wert genau stimmen.
 * Liefert die Abweichungen als lesbare Liste (leer = alles in Ordnung).
 */
export function abweichungen(vorher: FeldZustand, nachher: FeldZustand, gesetzt: Record<string, string>): string[] {
  const out: string[] = [];
  for (const name of Object.keys(vorher)) {
    if (!(name in nachher)) out.push(`Feld „${name}“ fehlt danach`);
    else if (name in gesetzt) {
      if (nachher[name].wert !== gesetzt[name]) out.push(`Feld „${name}“ hat nicht den eingetragenen Wert`);
    } else if (JSON.stringify(vorher[name]) !== JSON.stringify(nachher[name])) {
      out.push(`${nachher[name].typ === "PDFTextField" ? "Feld" : "Ankreuzfeld"} „${name}“ wurde verändert`);
    }
  }
  for (const name of Object.keys(nachher)) if (!(name in vorher)) out.push(`Feld „${name}“ ist neu hinzugekommen`);
  return out;
}

// ---------------------------------------------------------------------------
// Schriftgröße
// ---------------------------------------------------------------------------

const MULTILINE = 1 << 12;
const INNEN = 8; // Rand und Innenabstand von pdf-lib (beidseitig), mit etwas Luft

/** Wörter umbrechen wie ein mehrzeiliges Feld. */
function zeilen(text: string, font: PDFFont, size: number, breite: number): string[] {
  const out: string[] = [];
  for (const absatz of text.split("\n")) {
    let cur = "";
    for (const wort of absatz.split(" ")) {
      const probe = cur ? `${cur} ${wort}` : wort;
      if (cur && font.widthOfTextAtSize(probe, size) > breite) {
        out.push(cur);
        cur = wort;
      } else cur = probe;
    }
    out.push(cur);
  }
  return out;
}

/** Größte Schriftgröße zwischen MIN und SCHRIFT_PT, bei der der Text ins Feld passt. */
export function passendeGroesse(text: string, font: PDFFont, rect: { width: number; height: number }, mehrzeilig: boolean): number {
  const breite = rect.width - INNEN;
  for (let size = SCHRIFT_PT; size > SCHRIFT_MIN_PT; size -= 0.5) {
    if (!mehrzeilig) {
      if (font.widthOfTextAtSize(text, size) <= breite) return size;
      continue;
    }
    const z = zeilen(text, font, size, breite);
    if (z.every((l) => font.widthOfTextAtSize(l, size) <= breite) && z.length * font.heightAtSize(size) <= rect.height - 2) return size;
  }
  return SCHRIFT_MIN_PT;
}

// ---------------------------------------------------------------------------
// Einbrennen (flache Fassung)
// ---------------------------------------------------------------------------

const HIDDEN = 1 << 1;
const NO_VIEW = 1 << 5;

function zahlen(arr: PDFArray | undefined, n: number): number[] | null {
  if (!arr || arr.size() < n) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = arr.lookup(i);
    if (!(v instanceof PDFNumber)) return null;
    out.push(v.asNumber());
  }
  return out;
}

/**
 * Zeichnet jedes Widget mit seinem aktuellen Erscheinungsbild in den Seiteninhalt und entfernt danach Widgets und
 * Formular. Abbildung nach PDF 32000-1, 12.5.5: Begrenzung (BBox) des Erscheinungsbilds, transformiert mit seiner
 * Matrix, wird auf das Rechteck des Widgets gelegt. Widgets ohne Erscheinungsbild (leere Felder) verschwinden einfach.
 * Eigene Umsetzung, weil form.flatten() von pdf-lib an Feldern dieser Vorlagen abbricht (fehlendes /N, verwaiste Namen).
 */
export function einbrennen(doc: PDFDocument): void {
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const bleiben: (PDFRef | PDFDict)[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const annot = annots.lookup(i);
      if (!(annot instanceof PDFDict) || annot.get(PDFName.of("Subtype")) !== PDFName.of("Widget")) {
        if (raw instanceof PDFRef || raw instanceof PDFDict) bleiben.push(raw);
        continue;
      }
      const flags = annot.lookup(PDFName.of("F"));
      const versteckt = flags instanceof PDFNumber && (flags.asNumber() & (HIDDEN | NO_VIEW)) !== 0;
      const rect = zahlen(annot.lookup(PDFName.of("Rect")) as PDFArray | undefined, 4);
      const ap = annot.lookup(PDFName.of("AP"));
      let normal = ap instanceof PDFDict ? ap.get(PDFName.of("N")) : undefined;
      const normalObj = normal instanceof PDFRef ? ctx.lookup(normal) : normal;
      if (normalObj instanceof PDFDict && !(normalObj instanceof PDFStream)) {
        // Ankreuzfeld: Erscheinungsbild je Zustand, gewählt über /AS
        const as = annot.get(PDFName.of("AS"));
        normal = as instanceof PDFName ? normalObj.get(as) : undefined;
      }
      const stream = normal instanceof PDFRef ? ctx.lookup(normal) : normal;
      if (!versteckt && rect && normal instanceof PDFRef && stream instanceof PDFStream) {
        const bbox = zahlen(stream.dict.lookup(PDFName.of("BBox")) as PDFArray | undefined, 4);
        const m = zahlen(stream.dict.lookup(PDFName.of("Matrix")) as PDFArray | undefined, 6) ?? [1, 0, 0, 1, 0, 0];
        if (bbox) {
          const ecken = [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[1]],
            [bbox[0], bbox[3]],
            [bbox[2], bbox[3]],
          ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
          const xs = ecken.map((e) => e[0]);
          const ys = ecken.map((e) => e[1]);
          const [bx0, by0, bx1, by1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          const [rx0, ry0, rx1, ry1] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
          if (bx1 > bx0 && by1 > by0) {
            const sx = (rx1 - rx0) / (bx1 - bx0);
            const sy = (ry1 - ry0) / (by1 - by0);
            const name = page.node.newXObject("FlatWidget", normal);
            page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, rx0 - bx0 * sx, ry0 - by0 * sy), drawObject(name), popGraphicsState());
          }
        }
      }
      if (raw instanceof PDFRef) ctx.delete(raw);
    }
    if (bleiben.length) page.node.set(PDFName.of("Annots"), ctx.obj(bleiben));
    else page.node.delete(PDFName.of("Annots"));
  }
  doc.catalog.delete(PDFName.of("AcroForm"));
}

// ---------------------------------------------------------------------------
// Erzeugen
// ---------------------------------------------------------------------------

export async function erzeugeProtokoll(opts: { vorlage: Bytes; schrift: Bytes; werte: Record<string, string | null>; variante: ProtokollVariante }): Promise<ErzeugtesProtokoll> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(opts.vorlage);
  } catch {
    throw new ProtokollFehler("Die Vorlage ist keine lesbare PDF-Datei.");
  }
  const form = doc.getForm();
  if (!form.getFields().length) throw new ProtokollFehler("Die Vorlage enthält keine Formularfelder.");
  doc.registerFontkit(fontkit);
  const schrift = await doc.embedFont(opts.schrift, { subset: false });
  const seiten = doc.getPageCount();
  const vorher = feldZustand(doc);

  const gesetzt: Record<string, string> = {};
  const leer: string[] = [];
  for (const [name, roh] of Object.entries(opts.werte)) {
    const feld = form.getFieldMaybe(name);
    // Eine neue Revision der Vorlage mit anderen Feldnamen: lieber kein PDF als ein falsch befülltes
    if (!feld) throw new ProtokollFehler(`Die Vorlage passt nicht zur Zuordnung: Feld „${name}“ fehlt.`);
    if (!(feld instanceof PDFTextField)) throw new ProtokollFehler(`Die Vorlage passt nicht zur Zuordnung: „${name}“ ist kein Textfeld.`);
    const wert = roh?.replace(/\s+/g, " ").trim();
    if (!wert) {
      leer.push(name);
      continue;
    }
    if (feld.isRichFormatted()) throw new ProtokollFehler(`Feld „${name}“ ist ein Rich-Text-Feld und wird nicht befüllt.`);
    const max = feld.getMaxLength();
    const text = max !== undefined && wert.length > max ? wert.slice(0, max) : wert;
    feld.setText(text);
    const widgets = feld.acroField.getWidgets();
    const rect = widgets.map((w) => w.getRectangle()).reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b));
    feld.setFontSize(passendeGroesse(text, schrift, rect, (feld.acroField.getFlags() & MULTILINE) !== 0));
    feld.updateAppearances(schrift);
    gesetzt[name] = text;
  }

  // Nur die gesetzten Felder haben neue Erscheinungsbilder; keine globale Neuberechnung (sonst sähen Ankreuzfelder anders aus)
  const bearbeitbar = await doc.save({ updateFieldAppearances: false });
  const geladen = await PDFDocument.load(bearbeitbar);
  const fehler = abweichungen(vorher, feldZustand(geladen), gesetzt);
  if (geladen.getPageCount() !== seiten) fehler.unshift("Die Seitenzahl hat sich verändert");
  if (fehler.length) {
    throw new ProtokollFehler(`Prüfung nach dem Befüllen fehlgeschlagen, kein PDF erzeugt: ${fehler.slice(0, 5).join("; ")}${fehler.length > 5 ? ` (und ${fehler.length - 5} weitere)` : ""}.`);
  }
  if (opts.variante === "bearbeitbar") return { bytes: bearbeitbar, gesetzt: Object.keys(gesetzt), leer };

  einbrennen(geladen);
  const flach = await geladen.save({ updateFieldAppearances: false });
  const probe = await PDFDocument.load(flach);
  const rest = probe.getForm().getFields().length;
  if (rest || probe.getPageCount() !== seiten) throw new ProtokollFehler(`Flache Fassung fehlerhaft: ${rest} Felder sind noch bearbeitbar.`);
  return { bytes: flach, gesetzt: Object.keys(gesetzt), leer };
}
