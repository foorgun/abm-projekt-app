// Werktage: Montag bis Freitag ohne die gesetzlichen Feiertage in Baden-Württemberg.
// Die Datenbank rechnet beim Anlegen eines Antrags selbst nach (Funktion werktage in Migration 0012); die Zahl aus dem
// Browser dient nur der Anzeige.

import { addDays } from "../format";
import { istFeiertag } from "./feiertage";

/** Wochentag 1 (Montag) bis 7 (Sonntag). */
export function wochentag(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

export const istWerktag = (iso: string): boolean => wochentag(iso) <= 5 && !istFeiertag(iso);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Anzahl Werktage von `von` bis `bis`, beide Tage eingeschlossen. 0, wenn das Ende vor dem Anfang liegt. */
export function werktage(von: string, bis: string): number {
  if (!ISO.test(von) || !ISO.test(bis) || bis < von) return 0;
  let n = 0;
  for (let d = von; d <= bis; d = addDays(d, 1)) if (istWerktag(d)) n++;
  return n;
}

/** Werktage des Zeitraums, die in ein bestimmtes Jahr fallen (Anträge über den Jahreswechsel zählen je Jahr getrennt). */
export function werktageImJahr(von: string, bis: string, jahr: number): number {
  const start = von > `${jahr}-01-01` ? von : `${jahr}-01-01`;
  const ende = bis < `${jahr}-12-31` ? bis : `${jahr}-12-31`;
  return werktage(start, ende);
}

/** Jahre, die ein Zeitraum berührt. */
export function jahreVon(von: string, bis: string): number[] {
  const out: number[] = [];
  for (let j = Number(von.slice(0, 4)); j <= Number(bis.slice(0, 4)); j++) out.push(j);
  return out;
}
