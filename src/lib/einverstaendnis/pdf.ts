// Einverständniserklärung / Vollmacht als PDF (eine Seite A4), aufgebaut wie die bisherige Word-Vorlage des Büros:
// Kopf (Bauherrschaft, Bauvorhaben, Baugrundstück), Titel, Betreff, Entwurfsverfasser, Vollmachtstext mit drei Punkten,
// Datum und eine Unterschriftszeile je Bauherr. Fehlende Werte erscheinen als leere Linie zum Ausfüllen von Hand.
// Läuft im Browser und in Node (Tests). Wird erst beim Erzeugen nachgeladen (pdf-lib ist groß).

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BETREFF, VOLLMACHT_PUNKTE, vollmachtText, type EinverstaendnisDaten } from "./daten";

type Bytes = Uint8Array | ArrayBuffer;

const A4 = { w: 595.28, h: 841.89 };
const RAND_LINKS = 68;
const RAND_RECHTS = 68;
const BREITE = A4.w - RAND_LINKS - RAND_RECHTS;
/** Zweite Spalte im Kopf bzw. bei Betreff und Entwurfsverfasser */
const SPALTE_KOPF = 205;
const SPALTE_BETREFF = 255;
const SCHWARZ = rgb(0, 0, 0);
/** Länge der Linie für einen fehlenden Wert */
const LUECKE_PT = 160;

/** Text in Zeilen umbrechen, die in `breite` passen (an Leerzeichen; überlange Wörter bleiben ganz). */
export function umbrechen(text: string, font: PDFFont, size: number, breite: number): string[] {
  const zeilen: string[] = [];
  let zeile = "";
  for (const wort of text.split(/\s+/).filter(Boolean)) {
    const probe = zeile ? `${zeile} ${wort}` : wort;
    if (zeile && font.widthOfTextAtSize(probe, size) > breite) {
      zeilen.push(zeile);
      zeile = wort;
    } else zeile = probe;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}

class Schreiber {
  y = A4.h - 90;
  constructor(
    private page: PDFPage,
    readonly normal: PDFFont,
    readonly fett: PDFFont,
  ) {}

  text(t: string, x: number, opts: { size?: number; fett?: boolean; y?: number } = {}) {
    this.page.drawText(t, { x, y: opts.y ?? this.y, size: opts.size ?? 11, font: opts.fett ? this.fett : this.normal, color: SCHWARZ });
  }

  linie(x1: number, x2: number, y = this.y, dicke = 0.6) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: dicke, color: SCHWARZ });
  }

  /** Wert in der zweiten Spalte (umgebrochen); null zeichnet eine Linie. Rückt y um die Zeilen weiter. */
  wert(w: string | null, x: number, opts: { fett?: boolean; size?: number; abstand?: number } = {}) {
    const size = opts.size ?? 11;
    const abstand = opts.abstand ?? 13;
    if (!w) {
      this.linie(x, x + LUECKE_PT, this.y - 2);
      this.y -= abstand;
      return;
    }
    for (const z of umbrechen(w, opts.fett ? this.fett : this.normal, size, A4.w - RAND_RECHTS - x)) {
      this.text(z, x, { fett: opts.fett, size });
      this.y -= abstand;
    }
  }

  /** Beschriftung links, Werte rechts untereinander; danach Abstand. */
  block(label: string, werte: (string | null)[], spalte: number, opts: { fett?: boolean; labelFett?: boolean; nachher?: number } = {}) {
    this.text(label, RAND_LINKS, { fett: opts.labelFett ?? true });
    for (const w of werte) this.wert(w, spalte, { fett: opts.fett ?? true });
    this.y -= opts.nachher ?? 14;
  }

  absatz(t: string, opts: { x?: number; breite?: number; zeilenabstand?: number; size?: number } = {}) {
    const x = opts.x ?? RAND_LINKS;
    const size = opts.size ?? 11;
    for (const z of umbrechen(t, this.normal, size, opts.breite ?? A4.w - RAND_RECHTS - x)) {
      this.text(z, x, { size });
      this.y -= opts.zeilenabstand ?? 20;
    }
  }
}

export interface EinverstaendnisPdfEingabe {
  daten: EinverstaendnisDaten;
  /** TrueType-Schrift mit Umlauten (Liberation Sans, normal und fett) */
  schrift: Bytes;
  schriftFett: Bytes;
}

/** Erzeugt die Erklärung als PDF-Bytes. */
export async function erzeugeEinverstaendnis({ daten: d, schrift, schriftFett }: EinverstaendnisPdfEingabe): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const normal = await doc.embedFont(schrift, { subset: true });
  const fett = await doc.embedFont(schriftFett, { subset: true });
  doc.setTitle("Einverständniserklärung / Vollmacht");
  doc.setLanguage("de-DE");
  doc.setCreator("ABM Projekt-App");
  doc.setProducer("ABM Projekt-App");
  const page = doc.addPage([A4.w, A4.h]);
  const s = new Schreiber(page, normal, fett);

  // Kopf
  s.block("Bauherrschaft:", [d.bauherrschaft.namen, d.bauherrschaft.strasse, d.bauherrschaft.plzOrt], SPALTE_KOPF);
  s.block("Bauvorhaben:", [d.bauvorhaben], SPALTE_KOPF);
  s.block("Baugrundstück:", [d.grundstueck.plzOrt, d.grundstueck.strasse, d.grundstueck.flurstueck ? `Flst.-Nr.: ${d.grundstueck.flurstueck}` : null], SPALTE_KOPF, { nachher: 0 });
  s.linie(RAND_LINKS, A4.w - RAND_RECHTS, s.y + 4);
  s.y -= 44;

  // Titel
  s.text("Einverständniserklärung / Vollmacht", RAND_LINKS, { size: 22, fett: true });
  s.y -= 52;

  // Betreff
  s.text("Betreff:", RAND_LINKS, { fett: true });
  for (const z of umbrechen(BETREFF, fett, 11, A4.w - RAND_RECHTS - SPALTE_BETREFF)) {
    s.text(z, SPALTE_BETREFF, { fett: true });
    s.y -= 13;
  }
  s.y -= 40;

  // Entwurfsverfasser
  const e = d.entwurfsverfasser;
  s.text("Entwurfsverfasser und Vertreter", RAND_LINKS, { y: s.y + 13 });
  s.text("der Bauherrschaft:", RAND_LINKS);
  s.wert(e.name ? [e.name, e.titel].filter(Boolean).join(", ") : null, SPALTE_BETREFF);
  s.wert(e.anschrift, SPALTE_BETREFF);
  s.wert(e.tel ? `Tel.: ${e.tel}` : null, SPALTE_BETREFF);
  s.wert(e.email ? `E-Mail: ${e.email}` : null, SPALTE_BETREFF);
  s.y -= 30;

  // Vollmacht
  s.absatz(vollmachtText(d), { breite: BREITE });
  for (const punkt of VOLLMACHT_PUNKTE) {
    const zeilen = umbrechen(punkt, normal, 11, BREITE - 30);
    s.text("-", RAND_LINKS + 10);
    zeilen.forEach((z, i) => {
      s.text(z, RAND_LINKS + 30);
      s.y -= i === zeilen.length - 1 ? 18 : 13;
    });
  }
  s.y -= 70;

  // Datum
  s.text("Aufgestellt:", RAND_LINKS);
  s.text(d.datum, RAND_LINKS + 75);
  s.y -= 50;

  // Unterschriften: zwei je Zeile, mindestens eine
  const namen = d.personen.length ? d.personen : ["Bauherrschaft"];
  const spalte = (BREITE - 30) / 2;
  for (let i = 0; i < namen.length; i += 2) {
    namen.slice(i, i + 2).forEach((name, j) => {
      const x = RAND_LINKS + j * (spalte + 30);
      s.linie(x, x + spalte, s.y);
      s.text(name, x, { y: s.y - 14 });
    });
    s.y -= 60;
  }

  return doc.save();
}
