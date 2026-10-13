// Gesetzliche Feiertage in Baden-Württemberg, berechnet ohne externe Quelle.
// Der 24.12. und der 31.12. sind keine Feiertage und zählen als Werktage (wer frei haben will, beantragt Urlaub).
// Dieselbe Regel steht in der Datenbank (Migration 0012, Funktion bw_feiertag); ein Test hält beide gleich.

import { addDays } from "../format";

/** Ostersonntag (gregorianischer Kalender, Verfahren nach Gauß in der Fassung von Butcher/Meeus). */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

export interface Feiertag {
  datum: string;
  name: string;
}

/** Alle gesetzlichen Feiertage eines Jahres in Baden-Württemberg, nach Datum sortiert. */
export function feiertageBW(jahr: number): Feiertag[] {
  const ostern = ostersonntag(jahr);
  const fest = (monatTag: string, name: string): Feiertag => ({ datum: `${jahr}-${monatTag}`, name });
  const beweglich = (tage: number, name: string): Feiertag => ({ datum: addDays(ostern, tage), name });
  return [
    fest("01-01", "Neujahr"),
    fest("01-06", "Heilige Drei Könige"),
    beweglich(-2, "Karfreitag"),
    beweglich(1, "Ostermontag"),
    fest("05-01", "Tag der Arbeit"),
    beweglich(39, "Christi Himmelfahrt"),
    beweglich(50, "Pfingstmontag"),
    beweglich(60, "Fronleichnam"),
    fest("10-03", "Tag der Deutschen Einheit"),
    fest("11-01", "Allerheiligen"),
    fest("12-25", "1. Weihnachtstag"),
    fest("12-26", "2. Weihnachtstag"),
  ].sort((x, y) => x.datum.localeCompare(y.datum));
}

const cache = new Map<number, Map<string, string>>();

/** Name des Feiertags an diesem Tag, oder null. */
export function feiertagName(iso: string): string | null {
  const jahr = Number(iso.slice(0, 4));
  let map = cache.get(jahr);
  if (!map) {
    map = new Map(feiertageBW(jahr).map((f) => [f.datum, f.name]));
    cache.set(jahr, map);
  }
  return map.get(iso) ?? null;
}

export const istFeiertag = (iso: string): boolean => feiertagName(iso) !== null;
