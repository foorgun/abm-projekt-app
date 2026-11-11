// Baugrundauftrag an clayton Umwelt-Consult GmbH (nur Schwabenhaus): aus Projekt, Bauherr, Verkäufer und Bürodaten die
// Werte bilden und den Formularfeldern zuordnen. Reine Funktionen. Fehlt etwas, bleibt das Feld leer (nie raten).
// Bauherr, Bauort und Kellerbauer kommen aus denselben Regeln wie im Planungsprotokoll (protokollDaten).

import { CONTRACT_FOLDER } from "../extract/filing";
import { protokollDaten } from "../planungsprotokoll/daten";
import type { Dataset } from "../types";

/** Ordner im Projekt: derselbe, in den die Vertragsauslesung den Typ "baugrundauftrag" ablegt. */
export const BAUGRUND_ORDNER = CONTRACT_FOLDER.baugrundauftrag;

export interface BaugrundDaten {
  auftraggeber: { namen: string | null; strasse: string | null; plzOrt: string | null; tel: string | null; email: string | null };
  hersteller: { firma: string | null; projektNr: string | null; ansprechpartner: string | null; tel: string | null; email: string | null };
  /** Nur das Büro (Bürodaten), keine Personennamen */
  planer: { name: string | null; tel: string | null; email: string | null };
  bauort: { strasse: string | null; plzOrt: string | null; gemarkung: string | null; flurstueck: string | null };
  /** Ausführung Keller/Bodenplatte: Eintrag im Projekt (z. B. „Bauseits“), sonst die Hausbaufirma */
  keller: string | null;
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};
const join = (parts: (string | null | undefined)[], sep: string): string | null => clean(parts.map(clean).filter(Boolean).join(sep));

/** Alle Werte des Auftrags eines Projekts. `data` ist der geladene Datenbestand (Admin oder Mitarbeiter). */
export function baugrundDaten(data: Pick<Dataset, "projects" | "bauherren" | "parties" | "buero" | "companies" | "salespeople">, projectId: string): BaugrundDaten {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Projekt nicht gefunden");
  const contact = data.bauherren.find((b) => b.projectId === projectId) ?? null;
  const pp = protokollDaten(data, projectId);
  const verkaeufer = data.salespeople.find((s) => s.id === project.salespersonId);
  const buero = data.buero;
  return {
    auftraggeber: {
      namen: clean(pp.bauherr.name),
      strasse: pp.bauherr.strasse,
      plzOrt: pp.bauherr.plzOrt,
      // Das Formular fragt "Tel.-Nr.": Festnetz vor Mobil
      tel: clean(contact?.phone) ?? clean(contact?.mobile),
      email: clean(contact?.email),
    },
    hersteller: {
      firma: clean(data.companies.find((c) => c.id === project.companyId)?.name),
      projektNr: clean(project.hausbauNr),
      ansprechpartner: clean(verkaeufer?.name),
      // Für Verkäufer führt die App keine Telefonnummer
      tel: null,
      email: clean(verkaeufer?.email),
    },
    planer: { name: clean(buero?.name), tel: clean(buero?.tel) ?? clean(buero?.mobil), email: clean(buero?.email) },
    bauort: { strasse: pp.bauort.strasse, plzOrt: pp.bauort.plzOrt, gemarkung: pp.bauort.gemarkung, flurstueck: pp.bauort.flurstueck },
    keller: pp.beteiligte.kellerbauer.name,
  };
}

/** "Tel. / E-Mail" in einer Zeile (Kontaktdaten Bauherrschaft). */
export const kontaktZeile = (d: BaugrundDaten): string | null => join([d.auftraggeber.tel, d.auftraggeber.email], " / ");
/** "89134 Blaustein, Gemarkung Bermaringen" (Feld "PLZ, Ort, Gemarkung"). */
export const ortGemarkung = (d: BaugrundDaten): string | null => join([d.bauort.plzOrt, d.bauort.gemarkung && `Gemarkung ${d.bauort.gemarkung}`], ", ");
/** Bauadresse in einer Zeile (Anlage A, "Ort des BV"). */
export const bauadresse = (d: BaugrundDaten): string | null => join([d.bauort.strasse, d.bauort.plzOrt], ", ");

/**
 * Zuordnung Formularfeld → Wert. Felder mit null bleiben leer, müssen aber in der Vorlage vorhanden sein (Prüfung auf
 * eine neue Revision). Feldnamen genau wie in der Vorlage (docs/baugrundauftrag/clayton.json). Vorbelegte Felder
 * (Formular-Nr., Anzahl Sondierungen, Preise) und alles, was der Kunde ankreuzt, kommen hier nicht vor.
 */
export function feldwerte(d: BaugrundDaten): { auftrag: Record<string, string | null>; anlage: Record<string, string | null> } {
  return {
    auftrag: {
      // Seite 1, Auftraggeber (= Rechnungsempfänger) ist die Bauherrschaft
      "Vorund Zunamen AG": d.auftraggeber.namen,
      "Straße HausNr AG": d.auftraggeber.strasse,
      "ggf Land PLZ Ort AG": d.auftraggeber.plzOrt,
      "TelNr_2 AG": d.auftraggeber.tel,
      "EMail_2 AG": d.auftraggeber.email,
      // Haushersteller
      Haushersteller: d.hersteller.firma,
      Ansprechpartner: d.hersteller.ansprechpartner,
      Projektnummer: d.hersteller.projektNr,
      "TelNr HH": d.hersteller.tel,
      "EMail HH": d.hersteller.email,
      // Planer: das Büro
      Planer: d.planer.name,
      "TelNr_3 Planer": d.planer.tel,
      "EMail_3 Planer": d.planer.email,
      // Bauvorhaben und Bauort
      "Bauherrschaft falls abweichend vom Auftraggeber": null,
      "Kontaktdaten Bauherrschaft TelEMail": kontaktZeile(d),
      "Straße HausNr_2": d.bauort.strasse,
      Flurstück: d.bauort.flurstueck,
      "PLZ Ort Gemarkung": ortGemarkung(d),
      "Ausführung KellerBodenplatte durch Firma": d.keller,
      // Seite 2: Ort, Datum und Unterschrift macht der Kunde
      "Ort Datum": null,
    },
    anlage: {
      "Name BH": d.auftraggeber.namen,
      "Ort des BV": bauadresse(d),
      "Kontaktdaten BH TelEMail 1": kontaktZeile(d),
      Datum: null,
    },
  };
}

/** Kontrollkästchen, die die App ankreuzt: Versand per E-Mail (nur mit E-Mail des Bauherrn) und „Anlage A beigefügt“. */
export function ankreuzen(d: BaugrundDaten): string[] {
  return [...(d.auftraggeber.email ? ["GA/RG per EMail im PDFFormat"] : []), "beigefügt"];
}

/** Bezeichnung jedes Werts, der noch fehlt (für den Hinweis vor dem Erzeugen). */
export function fehlendeAngaben(d: BaugrundDaten): string[] {
  const out: string[] = [];
  const pruefe = (wert: string | null, label: string) => {
    if (!wert) out.push(label);
  };
  pruefe(d.auftraggeber.namen, "Name des Bauherrn");
  pruefe(d.auftraggeber.strasse, "Straße des Bauherrn");
  pruefe(d.auftraggeber.plzOrt, "PLZ und Ort des Bauherrn");
  pruefe(d.auftraggeber.tel, "Tel. des Bauherrn");
  pruefe(d.auftraggeber.email, "E-Mail des Bauherrn");
  pruefe(d.hersteller.projektNr, "Projektnummer (Hausbau-Nr.)");
  pruefe(d.hersteller.ansprechpartner, "Verkäufer");
  pruefe(d.planer.name, "Bürodaten (Name)");
  pruefe(d.planer.tel, "Bürodaten (Tel.)");
  pruefe(d.planer.email, "Bürodaten (E-Mail)");
  pruefe(d.bauort.strasse, "Straße des Bauorts");
  pruefe(d.bauort.plzOrt, "PLZ und Ort des Bauorts");
  pruefe(d.bauort.gemarkung, "Gemarkung");
  pruefe(d.bauort.flurstueck, "Flurstück");
  pruefe(d.keller, "Ausführung Keller/Bodenplatte");
  return out;
}

/** Dateiname: "Baugrundauftrag_Clayton_<Bauherr>_<JJJJ-MM-TT_HHMM>.pdf" */
export function baugrundDateiname(bauherr: string, stamp: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const datum = `${stamp.getFullYear()}-${p(stamp.getMonth() + 1)}-${p(stamp.getDate())}_${p(stamp.getHours())}${p(stamp.getMinutes())}`;
  const name = bauherr.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-") || "Projekt";
  return `Baugrundauftrag_Clayton_${name}_${datum}.pdf`;
}
