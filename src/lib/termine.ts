// Termine der Woche fürs Dashboard: Wochenberechnung, Gruppierung je Tag und die Schnittstelle zur Quelle.
// Heute liefert nur die Demo-Quelle (src/demo/termine.ts). Später ersetzt sie eine Quelle, die Outlook über
// Microsoft Graph liest (serverseitig, ohne Schlüssel im Frontend); die Oberfläche bleibt gleich.

import { addDays } from "./format";

export type TerminTyp = "baustelle" | "besprechung" | "behoerde" | "intern";

export const TERMIN_TYP_LABEL: Record<TerminTyp, string> = { baustelle: "Baustelle", besprechung: "Besprechung", behoerde: "Behörde", intern: "Intern" };

export interface Termin {
  id: string;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM */
  von: string;
  /** HH:MM, optional */
  bis?: string | null;
  titel: string;
  /** Ort oder Projekt */
  ort: string | null;
  typ: TerminTyp;
}

/** Woher die Termine kommen. Demo jetzt, Outlook später. */
export interface TermineQuelle {
  /** Kurzer Hinweis zur Herkunft für die Karte, z. B. "Demo – Outlook-Anbindung folgt". */
  readonly hinweis: string | null;
  /**
   * Termine einer Arbeitswoche (Montag bis Freitag). `offset` 0 ist die Woche, in der `heute` liegt,
   * -1 die Woche davor, 1 die danach.
   */
  getTermineDieseWoche(heute: string, offset?: number): Promise<Termin[]>;
}

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** So viele Termine zeigt ein Tag, der Rest steht als "+N weitere". */
export const TERMINE_PRO_TAG = 4;

/** Montag der Woche, in der `iso` liegt (Wochen beginnen am Montag; der Sonntag gehört zur Woche davor). */
export function montagVon(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return addDays(iso, 1 - dow);
}

/** Die fünf Arbeitstage (Montag bis Freitag) der Woche, in der `heute` liegt, verschoben um `offset` Wochen. */
export function arbeitswoche(heute: string, offset = 0): string[] {
  const montag = addDays(montagVon(heute), 7 * Math.trunc(offset));
  return [0, 1, 2, 3, 4].map((i) => addDays(montag, i));
}

/** Wochenwechsel in der Karte: eine Woche zurück oder vor; "heute" springt auf die laufende Woche. */
export function wocheWechseln(offset: number, schritt: "zurueck" | "vor" | "heute"): number {
  return schritt === "heute" ? 0 : offset + (schritt === "vor" ? 1 : -1);
}

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Datumsbereich einer Woche: "12.–16. Oktober 2026", über Monats- oder Jahreswechsel "28. September – 2. Oktober 2026". */
export function wochenBereich(woche: string[]): string {
  const [y1, m1, d1] = woche[0].split("-").map(Number);
  const [y2, m2, d2] = woche[woche.length - 1].split("-").map(Number);
  if (y1 !== y2) return `${d1}. ${MONATE[m1 - 1]} ${y1} – ${d2}. ${MONATE[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1}. ${MONATE[m1 - 1]} – ${d2}. ${MONATE[m2 - 1]} ${y2}`;
  return `${d1}.–${d2}. ${MONATE[m2 - 1]} ${y2}`;
}

/**
 * Ist der Termin schon vorbei? Nur am heutigen Tag: maßgeblich ist das Ende, ohne Ende der Beginn (`jetzt` als HH:MM).
 * Termine an anderen Tagen gelten nie als vergangen (auch nicht in zurückliegenden Wochen): abgedunkelt wird nur heute.
 */
export function istVergangen(termin: Pick<Termin, "datum" | "von" | "bis">, heute: string, jetzt: string): boolean {
  return termin.datum === heute && (termin.bis ?? termin.von) < jetzt;
}

/** Der nächste anstehende Termin heute (für die "jetzt"-Markierung), oder null. */
export function naechsterHeute(termine: Termin[], heute: string, jetzt: string): Termin | null {
  return termine.filter((t) => t.datum === heute && !istVergangen(t, heute, jetzt)).sort((a, b) => a.von.localeCompare(b.von))[0] ?? null;
}

export interface TerminTag {
  datum: string;
  heute: boolean;
  /** höchstens `limit` Termine, nach Uhrzeit */
  termine: Termin[];
  /** alle Termine des Tages, nach Uhrzeit (für das Aufklappen von "+N weitere") */
  alle: Termin[];
  /** Anzahl der nicht gezeigten Termine ("+N weitere") */
  weitere: number;
  /** alle Termine des Tages */
  gesamt: number;
}

/**
 * Termine je Arbeitstag der Woche (`offset` wie bei arbeitswoche). Termine außerhalb von Montag bis Freitag dieser
 * Woche entfallen. "heute" ist nur in der laufenden Woche markiert.
 */
export function termineJeTag(termine: Termin[], heute: string, limit = TERMINE_PRO_TAG, offset = 0): TerminTag[] {
  return arbeitswoche(heute, offset).map((datum) => {
    const alle = termine.filter((t) => t.datum === datum).sort((a, b) => a.von.localeCompare(b.von) || a.titel.localeCompare(b.titel, "de"));
    return { datum, heute: datum === heute, termine: alle.slice(0, limit), alle, weitere: Math.max(0, alle.length - limit), gesamt: alle.length };
  });
}

/** Was eine Spalte zeigt: eingeklappt die ersten Termine und "+N weitere", aufgeklappt alle. */
export function tagAnzeige(tag: TerminTag, aufgeklappt: boolean): { termine: Termin[]; weitere: number } {
  return aufgeklappt ? { termine: tag.alle, weitere: 0 } : { termine: tag.termine, weitere: tag.weitere };
}

/** Kopf einer Spalte: Wochentagskürzel und Tageszahl ("Mo", 12). */
export function tagKopf(iso: string): { kuerzel: string; zahl: number } {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return { kuerzel: TAGE[dow - 1], zahl: d };
}

/** "Mo 12.10." */
export function tagLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return `${TAGE[dow - 1]} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}
