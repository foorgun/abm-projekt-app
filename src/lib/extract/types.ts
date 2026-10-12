// Projekt aus einem Vertrag vorbefüllen: Datentypen und Schnittstelle des Extractors.
// Der Entwurf (ProjectDraft) ist bewusst getrennt vom Datenmodell: er hält erkannte Texte mit Herkunft und Sicherheit.
// Erst die Prüfmaske macht daraus ein Projekt (siehe applyDraft.ts), und ein Mensch bestätigt.
// Dieselbe Feldliste nutzt die Edge Function (supabase/functions/extract-project/fields.ts).

import type { NewProject } from "../repo";
import type { ContractMeta, DocumentType } from "../types";

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

/** Art des Dokuments; bestimmt den Typ und den Ordner, mit dem es im Projekt abgelegt wird. */
export type Vertragsart = DocumentType;

export const VERTRAGSART_LABEL: Record<Vertragsart, string> = {
  werkvertrag: "Werkvertrag",
  vermessungsvertrag: "Vermessungsvertrag",
  sonstiges: "Sonstiges",
};

/**
 * Felder, die ein Extractor liefert. Bewusst NICHT dabei: Geburtsdatum und Beruf (werden weder ausgelesen noch
 * gespeichert) sowie die Hausbau-Nr. (steht evtl. nicht im Vertrag, wird nicht geraten; docs/offene-fragen.md).
 */
export const DRAFT_FIELDS = [
  // Bauherr 1 → Projekt und Kontakt
  "bauherrLabel", // Nachname, einziges Pflichtfeld
  "bauherrName", // Vorname und Nachname
  "phone",
  "email",
  "address", // Wohnanschrift (NICHT die Bauadresse)
  // Bauherr 2 → zweiter Kontakt
  "bauherr2Name",
  "bauherr2Phone",
  "bauherr2Email",
  // Abgleich mit Stammdaten
  "company", // Hausbaufirma (Auftragnehmer)
  // Baugrundstück: steht im Werkvertrag nicht und wird daraus nie abgeleitet (nur aus anderen Dokumenten)
  "buildingAddress",
  "location",
  "flurstueck",
  "gemarkung",
  "vermesser",
  // Metadaten am Dokument
  "vertragsart",
  "vertragsdatum", // YYYY-MM-DD
  "vertragspreis", // wie im Vertrag, z. B. "312.450,00 €"
  "angebotsnummer",
  "haustyp",
  // nur Anzeige
  "rechtsform", // "Eheleute" oder "Bauherrengemeinschaft"
  "foerderung", // "ja", wenn KfW/WEF-Förderung angekreuzt ist
] as const;

export type DraftFieldKey = (typeof DRAFT_FIELDS)[number];

/** Felder, die im Werkvertrag nicht stehen und daraus nie übernommen werden. */
export const NOT_IN_WERKVERTRAG: DraftFieldKey[] = ["buildingAddress", "location", "flurstueck", "gemarkung"];

export const NO_SITE_HINT = "Baugrundstück steht nicht im Werkvertrag, kommt aus Verkäufer-Mail oder Vermessungsauftrag.";

/** Frist der KfW/WEF-Förderung in Monaten ab Vertragsdatum. Annahme aus dem Mustervertrag, nur als Hinweis. */
export const FOERDER_FRIST_MONATE = 15;

export interface ProjectDraft {
  datei: { name: string; size: number; type: string };
  /** Woraus die Vorschläge stammen. "dateiname" heißt: nichts lesbar. "ohne": keine Auslesung (manuell ausfüllen). */
  textquelle: "pdf" | "docx" | "bild" | "dateiname" | "ohne";
  extractor: "mock" | "edge";
  /** Scan, Foto oder Handschrift: Sicherheit höchstens "mittel", Telefon und E-Mail immer zur Kontrolle. */
  gescannt: boolean;
  felder: Record<DraftFieldKey, DraftField>;
  /** Hinweise für den Menschen in der Prüfmaske. */
  hinweise: string[];
}

/** Stand der Prüfmaske (wird mit dem Entwurf gespeichert). */
export interface DraftFormState {
  project: NewProject;
  meta: ContractMeta;
  /** Felder, die der Mensch schon selbst geändert hat. */
  edited: string[];
}

/** Aufruf der Edge Function: höchstens zwei Bilder (Seite 1, optional die Plan-Seite), sonst nichts. */
export interface ExtractImage {
  mediaType: "image/jpeg" | "image/png";
  /** Base64 ohne Präfix */
  data: string;
}

export interface ExtractRequest {
  images: ExtractImage[];
}

export type ExtractFailure = "disabled" | "limit" | "forbidden" | "error";

export type ExtractResponse =
  | { ok: true; felder: Record<DraftFieldKey, DraftField>; hinweise: string[] }
  | { ok: false; code: ExtractFailure; message: string };

/** Wird geworfen, wenn die Auslesung nicht möglich ist; die Oberfläche bietet dann die manuelle Anlage an. */
export class ExtractUnavailable extends Error {
  constructor(
    message: string,
    readonly code: ExtractFailure,
  ) {
    super(message);
    this.name = "ExtractUnavailable";
  }
}

export interface ExtractOptions {
  /** Zusätzliche Seite mit dem Plan (Haustyp), ab 1. */
  planPage?: number | null;
}

/** Schnittstelle für alle Extractor (Mock im Browser, Edge Function im Echtbetrieb). */
export interface ProjectExtractor {
  readonly name: "mock" | "edge";
  extract(file: File, options?: ExtractOptions): Promise<ProjectDraft>;
}

export const EMPTY_FIELD: DraftField = { wert: null, quelle: null, sicherheit: "niedrig" };

export function emptyFields(): Record<DraftFieldKey, DraftField> {
  return Object.fromEntries(DRAFT_FIELDS.map((k) => [k, { ...EMPTY_FIELD }])) as Record<DraftFieldKey, DraftField>;
}

/** Leerer Entwurf: Dokument ohne Vorschläge (z. B. Auslesung nicht freigeschaltet). */
export function emptyDraft(datei: ProjectDraft["datei"], extractor: ProjectDraft["extractor"], hinweise: string[]): ProjectDraft {
  const felder = emptyFields();
  felder.vertragsart = { wert: "sonstiges", quelle: null, sicherheit: "niedrig" };
  return { datei, textquelle: "ohne", extractor, gescannt: false, felder, hinweise };
}

const RANK: Record<Sicherheit, number> = { niedrig: 0, mittel: 1, hoch: 2 };

/**
 * Bringt ein Extractor-Ergebnis in die feste Form: nur bekannte Felder, gültige Sicherheit, leere Werte als null.
 * Bei Scans gilt höchstens "mittel". Für Werkverträge werden Angaben zum Baugrundstück verworfen (stehen dort nicht).
 */
export function normalizeFields(raw: unknown, gescannt: boolean): Record<DraftFieldKey, DraftField> {
  const out = emptyFields();
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const key of DRAFT_FIELDS) {
    const f = src[key] as { wert?: unknown; quelle?: unknown; sicherheit?: unknown } | undefined;
    if (!f || typeof f !== "object") continue;
    const wert = typeof f.wert === "string" && f.wert.trim() ? f.wert.trim().slice(0, 300) : null;
    if (!wert) continue;
    const q = f.quelle as { text?: unknown; seite?: unknown } | string | null | undefined;
    const text = typeof q === "string" ? q : typeof q?.text === "string" ? q.text : "";
    const seite = typeof q === "object" && q && typeof q.seite === "number" && q.seite >= 1 ? Math.floor(q.seite) : null;
    let sicherheit: Sicherheit = f.sicherheit === "hoch" || f.sicherheit === "mittel" ? f.sicherheit : "niedrig";
    if (gescannt && RANK[sicherheit] > RANK.mittel) sicherheit = "mittel";
    out[key] = { wert, quelle: text.trim() ? { text: text.trim().slice(0, 120), seite } : null, sicherheit };
  }
  const art = out.vertragsart.wert;
  if (art !== "werkvertrag" && art !== "vermessungsvertrag") out.vertragsart = { ...out.vertragsart, wert: "sonstiges" };
  if (out.vertragsart.wert === "werkvertrag") for (const k of NOT_IN_WERKVERTRAG) out[k] = { ...EMPTY_FIELD };
  if (out.vertragsdatum.wert && !/^\d{4}-\d{2}-\d{2}$/.test(out.vertragsdatum.wert)) out.vertragsdatum = { ...EMPTY_FIELD };
  if (out.foerderung.wert && out.foerderung.wert.toLowerCase() !== "ja") out.foerderung = { ...EMPTY_FIELD };
  return out;
}

/** Ende der Förderfrist (Vertragsdatum plus 15 Monate), oder null ohne gültiges Datum. */
export function foerderFrist(vertragsdatum: string | null | undefined): string | null {
  const m = vertragsdatum?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + FOERDER_FRIST_MONATE, Number(m[3])));
  return d.toISOString().slice(0, 10);
}
