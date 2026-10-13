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
  /** Termine der Arbeitswoche (Montag bis Freitag), in der `heute` liegt. */
  getTermineDieseWoche(heute: string): Promise<Termin[]>;
}

/** So viele Termine zeigt ein Tag, der Rest steht als "+N weitere". */
export const TERMINE_PRO_TAG = 4;

/** Montag der Woche, in der `iso` liegt (Wochen beginnen am Montag; der Sonntag gehört zur Woche davor). */
export function montagVon(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return addDays(iso, 1 - dow);
}

/** Die fünf Arbeitstage (Montag bis Freitag) der Woche, in der `heute` liegt. */
export function arbeitswoche(heute: string): string[] {
  const montag = montagVon(heute);
  return [0, 1, 2, 3, 4].map((i) => addDays(montag, i));
}

export interface TerminTag {
  datum: string;
  heute: boolean;
  /** höchstens `limit` Termine, nach Uhrzeit */
  termine: Termin[];
  /** Anzahl der nicht gezeigten Termine ("+N weitere") */
  weitere: number;
  /** alle Termine des Tages */
  gesamt: number;
}

/** Termine je Arbeitstag der Woche. Termine außerhalb von Montag bis Freitag dieser Woche entfallen. */
export function termineJeTag(termine: Termin[], heute: string, limit = TERMINE_PRO_TAG): TerminTag[] {
  return arbeitswoche(heute).map((datum) => {
    const alle = termine.filter((t) => t.datum === datum).sort((a, b) => a.von.localeCompare(b.von) || a.titel.localeCompare(b.titel, "de"));
    return { datum, heute: datum === heute, termine: alle.slice(0, limit), weitere: Math.max(0, alle.length - limit), gesamt: alle.length };
  });
}

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** "Mo 12.10." */
export function tagLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return `${TAGE[dow - 1]} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}
