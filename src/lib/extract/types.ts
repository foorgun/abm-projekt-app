// Projekt aus einem Vertrag vorbefüllen: Datentypen und Schnittstelle des Extractors.
// Der Entwurf (ProjectDraft) ist bewusst getrennt vom Datenmodell: er hält erkannte Texte mit Herkunft und Sicherheit.
// Erst die Prüfmaske macht daraus ein Projekt (siehe applyDraft.ts), und ein Mensch bestätigt.

export type Sicherheit = "hoch" | "mittel" | "niedrig";

export const SICHERHEIT_LABEL: Record<Sicherheit, string> = { hoch: "hoch", mittel: "mittel", niedrig: "niedrig" };

/** Woher ein Wert stammt: Textstelle (gekürzt) und Seite, soweit bekannt. */
export interface DraftQuelle {
  text: string;
  /** Seite im Dokument (ab 1), null wenn unbekannt (DOCX, Dateiname). */
  seite: number | null;
}

export interface DraftField {
  /** Erkannter Wert als Text, null wenn nichts erkannt wurde. */
  wert: string | null;
  quelle: DraftQuelle | null;
  sicherheit: Sicherheit;
}

/** Art des Dokuments; bestimmt später den Typ, mit dem es im Projekt abgelegt wird. */
export type Vertragsart = "werkvertrag" | "vermessungsvertrag" | "sonstiges";

export const VERTRAGSART_LABEL: Record<Vertragsart, string> = {
  werkvertrag: "Werkvertrag",
  vermessungsvertrag: "Vermessungsvertrag",
  sonstiges: "Sonstiges",
};

/**
 * Felder, die der Extractor liefert. Die obere Gruppe gibt es im Datenmodell (Projekt, Kontakt Bauherr, Beteiligte).
 * Die untere Gruppe steht typischerweise im Vertrag, hat im Projekt aber noch kein eigenes Feld (docs/offene-fragen.md).
 */
export const DRAFT_FIELDS = [
  // im Datenmodell vorhanden
  "bauherrLabel", // Nachname, einziges Pflichtfeld
  "bauherrName", // vollständiger Name für den Kontakt
  "phone",
  "email",
  "address", // Anschrift des Bauherrn
  "buildingAddress", // Bauadresse (Straße, PLZ Ort)
  "location", // Bauort
  "company", // Hausbaufirma (Name, wird gegen die Stammdaten abgeglichen)
  "salesperson", // Verkäufer (Name)
  "hausbauNr",
  "abmNr",
  "vermesser",
  // im Vertrag üblich, im Projekt ohne eigenes Feld
  "flurstueck", // wird an die Bauadresse angehängt
  "vertragsart",
  "vertragsdatum", // YYYY-MM-DD
  "honorar", // Betrag wie im Vertrag, z. B. "12.500,00 €"
] as const;

export type DraftFieldKey = (typeof DRAFT_FIELDS)[number];

export interface ProjectDraft {
  datei: { name: string; size: number; type: string };
  /** Wie der Text gewonnen wurde; "dateiname" heißt: kein lesbarer Text (z. B. Bild, gescanntes PDF). */
  textquelle: "pdf" | "docx" | "dateiname";
  felder: Record<DraftFieldKey, DraftField>;
  /** Hinweise für den Menschen in der Prüfmaske (z. B. "Bild: Text wird noch nicht erkannt"). */
  hinweise: string[];
}

/** Schnittstelle für alle Extractor (Mock im Browser, später Edge Function). */
export interface ProjectExtractor {
  readonly name: "mock" | "edge";
  extract(file: File): Promise<ProjectDraft>;
}

export const EMPTY_FIELD: DraftField = { wert: null, quelle: null, sicherheit: "niedrig" };

export function emptyFields(): Record<DraftFieldKey, DraftField> {
  return Object.fromEntries(DRAFT_FIELDS.map((k) => [k, { ...EMPTY_FIELD }])) as Record<DraftFieldKey, DraftField>;
}
