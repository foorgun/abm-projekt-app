// Erfundene Termine für die Karte "Termine diese Woche" (keine echten Kunden, Orte nur als Beispiel).
// Sie werden relativ zur laufenden Woche erzeugt, damit die Karte immer "diese Woche" zeigt.
// Keine Netzwerkaufrufe, keine Zugangsdaten. Die echte Quelle (Outlook über Microsoft Graph) folgt später
// und implementiert dieselbe Schnittstelle TermineQuelle.

import { arbeitswoche, type Termin, type TermineQuelle, type TerminTyp } from "../lib/termine";

type Vorlage = [tag: number, von: string, bis: string | null, titel: string, ort: string, typ: TerminTyp];

/** tag: 0 = Montag … 4 = Freitag */
const VORLAGEN: Vorlage[] = [
  [0, "08:30", "09:15", "Teambesprechung", "Büro", "intern"],
  [0, "10:00", "11:30", "Baustellenbesichtigung", "Neubau Musterweg, Blaustein", "baustelle"],
  [0, "14:00", "15:00", "Bauherrengespräch Entwurf", "Büro, Besprechungsraum", "besprechung"],
  [1, "09:00", "10:00", "Termin Bauamt: Rückfragen Bauantrag", "Baurechtsamt, Zimmer 2.14", "behoerde"],
  [1, "11:00", "12:00", "Bauanlaufgespräch", "Neubau Lindenhof, Laupheim", "baustelle"],
  [1, "15:30", "16:30", "Abstimmung Vermesser", "Telefon", "besprechung"],
  [2, "08:00", "09:30", "Bauabnahme Rohbau", "Neubau Am Hang, Senden", "baustelle"],
  [2, "10:00", "10:45", "Bauherrengespräch Bemusterung", "Büro, Besprechungsraum", "besprechung"],
  [2, "11:30", "12:15", "Abstimmung Hausbaufirma", "Videokonferenz", "besprechung"],
  [2, "13:30", "14:30", "Baustellenbesichtigung", "Neubau Wiesengrund, Ehingen", "baustelle"],
  [2, "15:00", "15:45", "Planungsrunde Werkpläne", "Büro", "intern"],
  [2, "16:30", "17:00", "Rückruf Landratsamt", "Telefon", "behoerde"],
  [3, "09:30", "10:30", "Vorabstimmung Bauvoranfrage", "Gemeindeverwaltung, Bauamt", "behoerde"],
  [3, "13:00", "14:00", "Bauherrengespräch Vertrag", "Büro, Besprechungsraum", "besprechung"],
  [4, "08:30", "09:00", "Wochenrückblick", "Büro", "intern"],
  [4, "10:00", "11:30", "Bauabnahme", "Neubau Sonnenhalde, Neu-Ulm", "baustelle"],
];

/**
 * Demo-Termine für eine Arbeitswoche (`offset` 0 = die Woche, in der `heute` liegt). Andere Wochen nutzen dieselben
 * Vorlagen, um einen Tag je Woche verschoben, damit Vor- und Folgewoche nicht gleich aussehen.
 */
export function demoTermine(heute: string, offset = 0): Termin[] {
  const woche = arbeitswoche(heute, offset);
  const schieben = (((offset % 5) + 5) % 5);
  return VORLAGEN.map(([tag, von, bis, titel, ort, typ], i) => ({ id: `demo-termin-${woche[0]}-${i + 1}`, datum: woche[(tag + schieben) % 5], von, bis, titel, ort, typ }));
}

export const demoTermineQuelle: TermineQuelle = {
  hinweis: "Demo – Outlook-Anbindung folgt",
  getTermineDieseWoche: async (heute, offset = 0) => demoTermine(heute, offset),
};
