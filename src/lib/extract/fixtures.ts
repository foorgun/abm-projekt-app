// Zwei erfundene Beispieldokumente, die die Struktur der echten nachbilden (keine echten Personen oder Daten):
//   a) gescannter Werkvertrag einer Hausbaufirma: Bild ohne Textebene, handschriftliche Eintragungen
//   b) leerer Vermessungsauftrag: Vorlage mit Formularfeldern, die ABM selbst ausfüllt
// Der Demo-Modus bietet sie im Dialog "Neues Projekt" an; die Tests nutzen dieselben Daten.

import type { DraftField, DraftFieldKey, Sicherheit } from "./types";

const f = (wert: string, text: string, sicherheit: Sicherheit, seite: number | null = 1): DraftField => ({ wert, quelle: { text, seite }, sicherheit });

/**
 * a) Was ein Bildmodell aus dem erfundenen Scan lesen würde. Handschrift: höchstens "mittel".
 * Bewusst ohne Bauadresse, Flurstück, Hausbau-Nr., Geburtsdatum und Beruf.
 */
export const SCAN_WERKVERTRAG_FELDER: Partial<Record<DraftFieldKey, DraftField>> = {
  bauherrLabel: f("Hoffmann", "1. Bauherr: Hoffmann, Jonas", "mittel"),
  bauherrName: f("Jonas Hoffmann", "1. Bauherr: Hoffmann, Jonas", "mittel"),
  phone: f("0731 000111", "Telefon: 0731 000111 (handschriftlich)", "niedrig"),
  email: f("j.hoffmann@example.com", "E-Mail: j.hoffmann@example.com (handschriftlich)", "niedrig"),
  address: f("Lindenweg 12, 89073 Ulm", "Anschrift: Lindenweg 12, 89073 Ulm", "mittel"),
  bauherr2Name: f("Anna Hoffmann", "2. Bauherr: Hoffmann, Anna", "mittel"),
  bauherr2Phone: f("0171 0001112", "Telefon: 0171 0001112 (handschriftlich)", "niedrig"),
  rechtsform: f("Eheleute", "☒ Eheleute ☐ Bauherrengemeinschaft", "mittel"),
  company: f("Bien-Zenker", "Auftragnehmer: Bien-Zenker (Briefkopf)", "mittel"),
  vertragsart: f("werkvertrag", "Werkvertrag über die Errichtung eines Hauses", "mittel"),
  vertragsdatum: f("2026-10-02", "Ulm, den 02.10.2026", "mittel"),
  vertragspreis: f("312.450,00 €", "Vertragspreis: 312.450,00 € (handschriftlich)", "niedrig"),
  angebotsnummer: f("A-2026-0417", "Angebot Nr. A-2026-0417", "mittel"),
  haustyp: f("Beispielhaus 140", "Haustyp: Beispielhaus 140", "mittel"),
  foerderung: f("ja", "☒ KfW/WEF-Förderung", "mittel"),
};

/** Zeilen des erfundenen Scans; daraus zeichnet der Demo-Modus das Bild (gedruckter Vordruck, Eintragungen wie von Hand). */
export const SCAN_WERKVERTRAG_ZEILEN: { text: string; hand?: string }[] = [
  { text: "BEISPIEL-HAUS GMBH · Werkvertrag über die Errichtung eines Hauses" },
  { text: "Angebot Nr.", hand: "A-2026-0417" },
  { text: "1. Bauherr (Name, Vorname):", hand: "Hoffmann, Jonas" },
  { text: "2. Bauherr (Name, Vorname):", hand: "Hoffmann, Anna" },
  { text: "☒ Eheleute   ☐ Bauherrengemeinschaft" },
  { text: "Anschrift:", hand: "Lindenweg 12, 89073 Ulm" },
  { text: "Telefon:", hand: "0731 000111 / 0171 0001112" },
  { text: "E-Mail:", hand: "j.hoffmann@example.com" },
  { text: "Haustyp:", hand: "Beispielhaus 140" },
  { text: "Vertragspreis (inkl. USt.):", hand: "312.450,00 €" },
  { text: "☒ KfW/WEF-Förderung wird beantragt (Frist 15 Monate ab Vertragsdatum)" },
  { text: "Ort, Datum:", hand: "Ulm, den 02.10.2026" },
  { text: "ERFUNDENES BEISPIEL · keine echten Daten" },
];

/** b) Text der leeren Vorlage (eine Seite): Beschriftungen ohne Eintragungen. */
export const VORLAGE_VERMESSUNG_ZEILEN: string[] = [
  "Vermessungsbüro Beispiel · Musterstraße 1 · 89073 Ulm",
  "Vermessungsauftrag",
  "Auftraggeber: ______________________________",
  "Bauherr: ______________________________",
  "Anschrift: ______________________________",
  "Telefon: ______________   E-Mail: ______________",
  "Baugrundstück: ______________________________",
  "Flurstück: __________   Gemarkung: __________",
  "Leistungen: [ ] Lageplan zum Bauantrag   [ ] Absteckung   [ ] Höhenaufnahme",
  "Ort, Datum: ______________   Unterschrift: ______________",
  "ERFUNDENES BEISPIEL - keine echten Daten",
];

/** Kleines, gültiges Text-PDF (eine Seite, Helvetica). Reicht für pdf.js und für die einfache Textextraktion. */
export function textPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const content = `BT /F1 11 Tf 56 780 Td ${lines.map((l, i) => `${i ? "0 -22 Td " : ""}(${esc(l)}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // Latin-1: ein Byte je Zeichen, passend zu WinAnsiEncoding (Umlaute)
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0) & 0xff);
}

/** b) als Datei */
export function vorlageVermessungFile(): File {
  return new File([textPdf(VORLAGE_VERMESSUNG_ZEILEN) as BlobPart], "Vermessungsauftrag_Vorlage.pdf", { type: "application/pdf" });
}

/** a) als Bilddatei: zeichnet den erfundenen Vordruck auf eine Fläche (nur im Browser). */
export async function scanWerkvertragFile(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1414;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.rotate(-0.006); // leicht schief, wie ein Scan
  let y = 120;
  SCAN_WERKVERTRAG_ZEILEN.forEach((line, i) => {
    ctx.fillStyle = "#222";
    ctx.font = i === 0 ? "bold 26px Helvetica, Arial, sans-serif" : "22px Helvetica, Arial, sans-serif";
    ctx.fillText(line.text, 80, y);
    if (line.hand) {
      ctx.fillStyle = "#1c3f94";
      ctx.font = "italic 30px 'Bradley Hand', 'Segoe Script', 'Comic Sans MS', cursive";
      ctx.fillText(line.hand, 80 + ctx.measureText(line.text).width * 0.78 + 30, y + 2);
    }
    y += i === 0 ? 110 : 92;
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Beispiel konnte nicht erzeugt werden.");
  return new File([blob], "Scan_Werkvertrag_Beispiel.jpg", { type: "image/jpeg" });
}
