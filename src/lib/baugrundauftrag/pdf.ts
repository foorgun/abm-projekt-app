// Baugrundauftrag als ein PDF: Auftragsformular (3 Seiten) und Anlage A angehängt, Felder bleiben ausfüllbar (der Kunde
// kreuzt Unterkellerung, Art des Bauvorhabens usw. selbst an und unterschreibt). Befüllt wird mit derselben Logik wie das
// Planungsprotokoll (erzeugeProtokoll): Unicode-Schrift, Schriftgröße passend, Prüfung, dass sonst nichts verändert wurde.
// Läuft im Browser und in Node (Tests). Wird erst beim Erzeugen nachgeladen (pdf-lib ist groß).

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { erzeugeProtokoll, ProtokollFehler } from "../planungsprotokoll/pdf";

type Bytes = Uint8Array | ArrayBuffer;

async function laden(bytes: Bytes, was: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes);
  } catch {
    throw new ProtokollFehler(`${was} ist keine lesbare PDF-Datei.`);
  }
}

/**
 * Hängt die Seiten der Anlage an das Auftragsformular an und übernimmt ihre Formularfelder. Gleich benannte Felder würden
 * im PDF zu einem Feld verschmelzen: dann lieber kein PDF.
 */
export async function vorlagenZusammenfuegen(auftrag: Bytes, anlage: Bytes): Promise<Uint8Array> {
  const ziel = await laden(auftrag, "Die Vorlage des Auftrags");
  const quelle = await laden(anlage, "Die Vorlage der Anlage A");
  const namen = new Set(ziel.getForm().getFields().map((f) => f.getName()));
  const doppelt = quelle.getForm().getFields().map((f) => f.getName()).filter((n) => namen.has(n));
  if (doppelt.length) throw new ProtokollFehler(`Auftrag und Anlage A haben gleich benannte Felder (${doppelt.slice(0, 3).join(", ")}).`);

  // Verweis der Widgets auf ihre alte Seite (/P) entfernen: sonst kopiert pdf-lib über ihn den ganzen alten Seitenbaum mit
  for (const page of quelle.getPages()) {
    const annots = page.node.Annots();
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const a = annots!.lookup(i);
      if (a instanceof PDFDict) a.delete(PDFName.of("P"));
    }
  }
  const seiten = await ziel.copyPages(quelle, quelle.getPageIndices());
  const acroForm = ziel.getForm().acroForm;
  for (const page of seiten) {
    ziel.addPage(page);
    const annots = page.node.Annots();
    const wurzeln = new Set<PDFRef>();
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const ref = annots!.get(i);
      const a = annots!.lookup(i);
      if (!(ref instanceof PDFRef) || !(a instanceof PDFDict) || a.get(PDFName.of("Subtype")) !== PDFName.of("Widget")) continue;
      a.set(PDFName.of("P"), page.ref);
      // Bis zum obersten Feld hochgehen (Widget kann selbst das Feld sein)
      let feld: PDFRef = ref;
      let dict: PDFDict = a;
      while (dict.get(PDFName.of("Parent")) instanceof PDFRef) {
        feld = dict.get(PDFName.of("Parent")) as PDFRef;
        dict = ziel.context.lookup(feld, PDFDict);
      }
      wurzeln.add(feld);
    }
    for (const ref of wurzeln) acroForm.addField(ref);
  }
  const bytes = await ziel.save({ updateFieldAppearances: false });
  // Probe: alle Felder beider Vorlagen da, Seitenzahl stimmt
  const probe = await PDFDocument.load(bytes);
  const anzahl = probe.getForm().getFields().length;
  const erwartet = namen.size + quelle.getForm().getFields().length;
  if (anzahl !== erwartet || probe.getPageCount() !== ziel.getPageCount()) throw new ProtokollFehler(`Zusammenfügen fehlerhaft: ${anzahl} statt ${erwartet} Felder.`);
  if (!(probe.catalog.lookup(PDFName.of("AcroForm"), PDFDict).lookup(PDFName.of("Fields")) instanceof PDFArray)) throw new ProtokollFehler("Zusammenfügen fehlerhaft: kein Formular.");
  return bytes;
}

export interface BaugrundPdfEingabe {
  auftrag: Bytes;
  anlage: Bytes;
  /** TrueType-Schrift mit Umlauten (Liberation Sans) */
  schrift: Bytes;
  werte: { auftrag: Record<string, string | null>; anlage: Record<string, string | null> };
  /** Namen der Kontrollkästchen, die angekreuzt werden */
  ankreuzen: string[];
}

export interface ErzeugterAuftrag {
  bytes: Uint8Array;
  gesetzt: string[];
  leer: string[];
}

/** Erzeugt Auftrag + Anlage A als ein bearbeitbares PDF. Fehler: ProtokollFehler (dann gibt es kein PDF). */
export async function erzeugeBaugrundauftrag(e: BaugrundPdfEingabe): Promise<ErzeugterAuftrag> {
  const vorlage = await vorlagenZusammenfuegen(e.auftrag, e.anlage);
  const res = await erzeugeProtokoll({
    vorlage,
    schrift: e.schrift,
    werte: { ...e.werte.auftrag, ...e.werte.anlage },
    variante: "bearbeitbar",
    ankreuzen: e.ankreuzen.map((feld) => ({ feld })),
  });
  return res;
}
