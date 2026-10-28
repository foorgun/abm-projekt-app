// Mehrere Dokumente zu einem Projektentwurf zusammenführen (z. B. Werkvertrag und Vermesservertrag). Reine Funktionen.
//   * Jedes Dokument wurde mit dem Schema seiner Art ausgelesen; hier zählen nur die Projektfelder (DOCUMENT_FIELDS wie
//     Vertragsdatum oder Preis bleiben beim jeweiligen Dokument).
//   * Gleicher Wert in mehreren Dokumenten (nach Vereinheitlichung von Schreibweise und Leerzeichen): übernehmen, die
//     Quelle nennt das erste Dokument, die Sicherheit ist die höchste.
//   * Abweichende Werte: Konflikt. Der Mensch wählt in der Prüfmaske; bis dahin steht der Wert aus dem Dokument, das für
//     dieses Feld am verlässlichsten ist (Bauherr aus dem Werkvertrag, Grundstück aus dem Vermesservertrag), als Vorschlag.

import { compactText } from "../projectFilters";
import {
  DOCUMENT_FIELDS,
  DRAFT_FIELDS,
  EMPTY_FIELD,
  emptyFields,
  VERTRAGSART_LABEL,
  type DraftField,
  type DraftFieldKey,
  type ProjectDraft,
  type Sicherheit,
  type Vertragsart,
} from "./types";

/** Ein ausgelesenes Dokument im Entwurf. */
export interface MergeInput {
  id: string;
  art: Vertragsart;
  draft: ProjectDraft;
}

export interface ConflictOption {
  wert: string;
  dokumentId: string;
  art: Vertragsart;
  feld: DraftField;
}

export interface MergedDraft {
  /** Zusammengeführte Felder; jede Quelle trägt dokumentId und dokumentArt. */
  felder: Record<DraftFieldKey, DraftField>;
  /** Felder mit abweichenden Werten: alle Varianten mit Quelle, die bevorzugte zuerst. */
  conflicts: Partial<Record<DraftFieldKey, ConflictOption[]>>;
  hinweise: string[];
  gescannt: boolean;
}

/** Projektfelder, die zwischen Dokumenten verglichen werden. */
export const MERGED_FIELDS: readonly DraftFieldKey[] = DRAFT_FIELDS.filter((k) => !DOCUMENT_FIELDS.includes(k));

const SITE: DraftFieldKey[] = ["buildingAddress", "location", "flurstueck", "gemarkung"];

/** Welche Dokumentart für ein Feld zuerst gilt (Vorschlag bei Konflikten). */
export function preferenceFor(key: DraftFieldKey): Vertragsart[] {
  if (SITE.includes(key)) return ["vermessungsvertrag", "baugrundauftrag", "honorarvereinbarung", "sonstiges", "werkvertrag"];
  if (key === "vermesser") return ["vermessungsvertrag", "sonstiges", "honorarvereinbarung", "baugrundauftrag", "werkvertrag"];
  return ["werkvertrag", "honorarvereinbarung", "vermessungsvertrag", "baugrundauftrag", "sonstiges"];
}

const PHONE: DraftFieldKey[] = ["phone", "bauherr2Phone"];

/** Vergleichsform: Telefon nur Ziffern (führendes +49 wie 0), sonst Kleinbuchstaben ohne Leer- und Satzzeichen. */
export function sameValueKey(key: DraftFieldKey, value: string): string {
  if (PHONE.includes(key)) return value.replace(/^\s*\+49/, "0").replace(/\D/g, "");
  return compactText(value).replace(/[,;:()"„“'’]/g, "");
}

const RANK: Record<Sicherheit, number> = { niedrig: 0, mittel: 1, hoch: 2 };

export function mergeDrafts(docs: MergeInput[]): MergedDraft {
  const felder = emptyFields();
  const conflicts: MergedDraft["conflicts"] = {};
  for (const key of MERGED_FIELDS) {
    const order = preferenceFor(key);
    // Kandidaten in Reihenfolge der Bevorzugung, bei gleicher Art in der Reihenfolge der Dokumente
    const found = docs
      .map((d, i) => ({ d, i, f: d.draft.felder[key] }))
      .filter((x) => x.f?.wert)
      .sort((a, b) => order.indexOf(a.d.art) - order.indexOf(b.d.art) || a.i - b.i);
    if (!found.length) continue;
    const groups = new Map<string, typeof found>();
    for (const x of found) {
      const k = sameValueKey(key, x.f.wert!);
      groups.set(k, [...(groups.get(k) ?? []), x]);
    }
    const tag = (x: (typeof found)[number]): DraftField => ({ ...x.f, quelle: { text: x.f.quelle?.text ?? "", seite: x.f.quelle?.seite ?? null, dokumentId: x.d.id, dokumentArt: x.d.art } });
    const best = (g: typeof found): DraftField => {
      const top = tag(g[0]);
      // gleicher Wert aus mehreren Dokumenten: die höchste Sicherheit gilt
      return { ...top, sicherheit: g.reduce<Sicherheit>((s, x) => (RANK[x.f.sicherheit] > RANK[s] ? x.f.sicherheit : s), "niedrig") };
    };
    const variants = [...groups.values()];
    felder[key] = best(variants[0]);
    if (variants.length > 1) {
      conflicts[key] = variants.map((g) => ({ wert: g[0].f.wert!, dokumentId: g[0].d.id, art: g[0].d.art, feld: best(g) }));
    }
  }
  // Art: bei einem Dokument dessen Art, sonst die des ersten (bestimmt nur die Anzeige; abgelegt wird je Dokument)
  felder.vertragsart = docs[0] ? { wert: docs[0].art, quelle: null, sicherheit: "hoch" } : { ...EMPTY_FIELD };
  const hinweise = docs.flatMap((d) => d.draft.hinweise.map((h) => (docs.length > 1 ? `${VERTRAGSART_LABEL[d.art]}: ${h}` : h)));
  return { felder, conflicts, hinweise: [...new Set(hinweise)].slice(0, 8), gescannt: docs.some((d) => d.draft.gescannt) };
}

/** "aus Werkvertrag" bzw. bei zwei Dokumenten gleicher Art "aus Werkvertrag (Datei.pdf)". */
export function sourceLabel(art: Vertragsart, fileName: string | null, sameTypeCount: number): string {
  return `aus ${VERTRAGSART_LABEL[art]}${sameTypeCount > 1 && fileName ? ` (${fileName})` : ""}`;
}
