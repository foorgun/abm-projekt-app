// Urlaub und Krankheit: Kennzahlen, Überschneidungen und Prüfung eines Antrags. Reine Funktionen.
// Dieselben Regeln erzwingt die Datenbank (Migration 0012); hier dienen sie der Anzeige und frühen Hinweisen.

import type { Abwesenheit, UrlaubsAnspruch } from "../types";
import { jahreVon, werktage, werktageImJahr } from "./werktage";

/** Urlaubstage pro Jahr, wenn für eine Person nichts eingetragen ist. Annahme, mit ABM abzustimmen. */
export const STANDARD_ANSPRUCH = 30;

export interface UrlaubsStand {
  jahr: number;
  /** Anspruch des Jahres ohne Übertrag */
  anspruch: number;
  uebertrag: number;
  /** genehmigte Urlaubstage im Jahr */
  genommen: number;
  /** beantragte, noch offene Urlaubstage im Jahr */
  beantragt: number;
  /** Anspruch + Übertrag − genommen − beantragt */
  rest: number;
}

/** Ende eines Zeitraums für Vergleiche: eine offene Krankmeldung reicht bis heute (mindestens bis zu ihrem Beginn). */
export function endeVon(a: Pick<Abwesenheit, "von" | "bis">, heute: string): string {
  return a.bis ?? (a.von > heute ? a.von : heute);
}

/** Zählt für den Urlaubsstand und für Überschneidungen: offene und genehmigte Einträge. */
export const zaehlt = (a: Pick<Abwesenheit, "status">): boolean => a.status === "offen" || a.status === "genehmigt";

export function urlaubsStand(userId: string, jahr: number, abwesenheiten: Abwesenheit[], anspruch: UrlaubsAnspruch[]): UrlaubsStand {
  const row = anspruch.find((x) => x.userId === userId && x.jahr === jahr);
  const tage = row?.tage ?? STANDARD_ANSPRUCH;
  const uebertrag = row?.uebertrag ?? 0;
  let genommen = 0;
  let beantragt = 0;
  for (const a of abwesenheiten) {
    if (a.userId !== userId || a.art !== "urlaub" || !a.bis) continue;
    const n = werktageImJahr(a.von, a.bis, jahr);
    if (a.status === "genehmigt") genommen += n;
    else if (a.status === "offen") beantragt += n;
  }
  return { jahr, anspruch: tage, uebertrag, genommen, beantragt, rest: tage + uebertrag - genommen - beantragt };
}

/** Eigene Einträge, die sich mit dem Zeitraum überschneiden (offene Anträge, genehmigter Urlaub, Krankmeldungen). */
export function ueberschneidungen(userId: string, von: string, bis: string, abwesenheiten: Abwesenheit[], heute: string, ohneId?: string): Abwesenheit[] {
  return abwesenheiten.filter((a) => a.userId === userId && a.id !== ohneId && zaehlt(a) && a.von <= bis && endeVon(a, heute) >= von);
}

/** Wer im Zeitraum bereits abwesend ist (für die Genehmigung): genehmigter Urlaub und Krankmeldungen anderer. */
export function gleichzeitigAbwesend(antrag: Pick<Abwesenheit, "id" | "userId" | "von" | "bis">, abwesenheiten: Abwesenheit[], heute: string): Abwesenheit[] {
  const bis = antrag.bis ?? antrag.von;
  return abwesenheiten.filter((a) => a.userId !== antrag.userId && a.id !== antrag.id && a.status === "genehmigt" && a.von <= bis && endeVon(a, heute) >= antrag.von);
}

export interface AntragPruefung {
  /** Werktage des Antrags insgesamt */
  werktage: number;
  /** Fehler verhindern das Absenden */
  fehler: string[];
  /** Warnungen sind Hinweise (z. B. mehr als die Resttage), kein Hindernis */
  warnungen: string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Prüft einen Urlaubsantrag. Die Resttage werden je Jahr getrennt gerechnet (Antrag über den Jahreswechsel) und führen
 * nur zu einer Warnung: der Anspruch des neuen Jahres ist oft noch nicht eingetragen, entscheiden muss ohnehin ein Admin.
 */
export function pruefeUrlaub(input: { userId: string; von: string; bis: string }, abwesenheiten: Abwesenheit[], anspruch: UrlaubsAnspruch[], heute: string): AntragPruefung {
  const fehler: string[] = [];
  const warnungen: string[] = [];
  if (!ISO.test(input.von) || !ISO.test(input.bis)) return { werktage: 0, fehler: ["Bitte Beginn und Ende wählen."], warnungen };
  if (input.bis < input.von) return { werktage: 0, fehler: ["Das Ende liegt vor dem Beginn."], warnungen };
  const n = werktage(input.von, input.bis);
  if (n === 0) fehler.push("Im gewählten Zeitraum liegt kein Werktag.");
  if (ueberschneidungen(input.userId, input.von, input.bis, abwesenheiten, heute).length) fehler.push("Der Zeitraum überschneidet sich mit einem eigenen Antrag oder einer Krankmeldung.");
  for (const jahr of jahreVon(input.von, input.bis)) {
    const tage = werktageImJahr(input.von, input.bis, jahr);
    const rest = urlaubsStand(input.userId, jahr, abwesenheiten, anspruch).rest;
    if (tage > rest) warnungen.push(`${jahr}: ${zahl(tage)} ${tage === 1 ? "Tag" : "Tage"} beantragt, aber nur ${zahl(rest)} Resttage.`);
  }
  return { werktage: n, fehler, warnungen };
}

/** Prüft eine Krankmeldung: Ende nicht vor Beginn, keine Überschneidung mit eigenen Einträgen. */
export function pruefeKrank(input: { userId: string; von: string; bis: string | null }, abwesenheiten: Abwesenheit[], heute: string, ohneId?: string): string[] {
  if (!ISO.test(input.von)) return ["Bitte den ersten Krankheitstag wählen."];
  if (input.bis && (!ISO.test(input.bis) || input.bis < input.von)) return ["Das Ende liegt vor dem Beginn."];
  const bis = input.bis ?? (input.von > heute ? input.von : heute);
  return ueberschneidungen(input.userId, input.von, bis, abwesenheiten, heute, ohneId).length ? ["Der Zeitraum überschneidet sich mit einem eigenen Antrag oder einer Krankmeldung."] : [];
}

/** Darf diese Person den Antrag entscheiden? Nur Admins, und nie den eigenen (die Datenbank erzwingt dasselbe). */
export function darfEntscheiden(entscheider: { id: string | null; role: string }, antrag: Pick<Abwesenheit, "userId" | "art" | "status">): boolean {
  return entscheider.role === "admin" && Boolean(entscheider.id) && antrag.art === "urlaub" && antrag.status === "offen" && antrag.userId !== entscheider.id;
}

/** Tage als Text: ganze Zahlen ohne Nachkommastelle, halbe mit Komma. */
export function zahl(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export const STATUS_LABEL: Record<Abwesenheit["status"], string> = { offen: "offen", genehmigt: "genehmigt", abgelehnt: "abgelehnt", zurueckgezogen: "zurückgezogen" };
