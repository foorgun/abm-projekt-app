// Standortangaben fürs Planungsprotokoll: Zuordnung und Abfragen liegen in supabase/functions/standort-analyse/logic.ts
// (ohne Importe, damit die Edge Function dieselbe Datei nutzt). Hier: Übernahme, Auswahl fürs Formular, Demo-Antwort.

import { adresseText, anfrageAusProjekt, THEMEN, viewerFuer, type Ergebnis, type Projektangaben, type StandortAntwort, type StandortFehler, type Thema, type Verwaltung } from "../../../supabase/functions/standort-analyse/logic";
import type { PartyInput } from "../repo";
import type { ProjectParty, StandortWert } from "../types";

export { THEMA_LABEL, THEMEN, MAX_ANALYSEN_PRO_TAG } from "../../../supabase/functions/standort-analyse/logic";
export type { Ergebnis, Genauigkeit, Projektangaben, StandortAntwort, StandortFehler, Status, Thema, Verwaltung } from "../../../supabase/functions/standort-analyse/logic";

/**
 * Gemeindeverwaltung als Beteiligte „Gemeinde“ (Seite 1). Name, Anschrift und E-Mail kommen aus dem Verzeichnis. Bei derselben
 * Gemeinde bleiben Tel., Mobil und Fax stehen (das Verzeichnis hat keine); bei einer anderen werden sie geleert.
 */
export function gemeindeAusVerwaltung(v: Verwaltung, bisher: ProjectParty | undefined): PartyInput {
  const gleich = bisher?.name.trim().toLowerCase() === v.name.trim().toLowerCase();
  return { name: v.name, address: v.anschrift, email: v.email ?? (gleich ? (bisher?.email ?? null) : null), ...(gleich ? {} : { phone: null, mobile: null, fax: null }) };
}

/** Auswahlwerte der Felder, die im PDF angekreuzt werden. Die übrigen Themen sind Freitext. */
export const AUSWAHL: Partial<Record<Thema, { wert: string; text: string }[]>> = {
  schneelast: ["1", "1a", "2", "2a", "3", "3a", ">3a"].map((z) => ({ wert: z, text: `Zone ${z}` })),
  erdbeben: [{ wert: "keine", text: "Keine Erdbebenzone" }, ...["0", "1", "2", "3"].map((z) => ({ wert: z, text: `Zone ${z}` }))],
  radon: [{ wert: "ja", text: "Radonvorsorgegebiet" }, { wert: "nein", text: "Kein Radonvorsorgegebiet" }],
  wasserschutz: [
    { wert: "keine", text: "Kein Wasserschutzgebiet" },
    { wert: "gebiet", text: "Wasserschutzgebiet, Zone offen" },
    ...["1", "2", "3"].map((z) => ({ wert: z, text: `Wasserschutzgebiet, Zone ${["I", "II", "III"][Number(z) - 1]}` })),
  ],
  hochwasser: [{ wert: "ja", text: "Im HQ100-Gebiet" }, { wert: "nein", text: "Nicht im kartierten HQ100-Gebiet" }],
};

export interface Zeile {
  thema: Thema;
  gewaehlt: boolean;
  wert: string;
}

/** Ausgangszustand der Liste: Ermitteltes mit Wert, unsichere Werte und Fehlendes nicht angehakt. */
export function zeilenAus(ergebnisse: Ergebnis[]): Zeile[] {
  return ergebnisse.map((e) => ({ thema: e.thema, gewaehlt: e.status === "ermittelt" && e.vorgewaehlt, wert: e.wert ?? "" }));
}

/**
 * Was "Alle übernehmen" speichert: nur angehakte, ermittelte Zeilen mit Wert. Bisher Übernommenes bleibt erhalten, außer bei
 * Themen, die jetzt einen neuen Wert bekommen. Nicht ermittelbare Themen können so nie einen Wert erhalten.
 */
export function uebernahme(ergebnisse: Ergebnis[], zeilen: Zeile[], bisher: Record<string, StandortWert> = {}): Record<string, StandortWert> {
  const out: Record<string, StandortWert> = { ...bisher };
  for (const z of zeilen) {
    const e = ergebnisse.find((x) => x.thema === z.thema);
    const wert = z.wert.trim();
    if (!e || e.status !== "ermittelt" || !z.gewaehlt || !wert) continue;
    const geaendert = wert !== e.wert;
    const auswahl = AUSWAHL[z.thema]?.find((a) => a.wert === wert)?.text;
    out[z.thema] = { wert, anzeige: geaendert ? (auswahl ?? wert) : (e.anzeige ?? wert), quelle: e.quelle, abgerufenAm: e.abgerufenAm, geaendert };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Demo-Modus: feste Beispielantwort, kein Dienst wird abgefragt
// ---------------------------------------------------------------------------

const DEMO_QUELLE = "Demo-Modus: erfundener Beispielwert";
const DEMO_WERTE: Partial<Record<Thema, Pick<Ergebnis, "wert" | "anzeige" | "hinweis" | "vorgewaehlt">>> = {
  schneelast: { wert: "2", anzeige: "Zone 2", hinweis: null, vorgewaehlt: true },
  hoehe: { wert: "480 m", anzeige: "etwa 480 m ü. NN", hinweis: "Gelände-Übersichtswert, kein Vermesserwert.", vorgewaehlt: true },
  radon: { wert: "nein", anzeige: "Kein Radonvorsorgegebiet", hinweis: null, vorgewaehlt: true },
  wasserschutz: { wert: "gebiet", anzeige: "Wasserschutzgebiet Musterried", hinweis: "Die Quelle nennt keine Zone. Die genaue Zone bitte wählen.", vorgewaehlt: true },
  hochwasser: { wert: "nein", anzeige: "Nicht im kartierten HQ100-Gebiet", hinweis: null, vorgewaehlt: true },
  laerm: { wert: "Straße LDEN 58 dB(A), LNight 49 dB(A)", anzeige: "Straße: LDEN 58 dB(A), LNight 49 dB(A)", hinweis: "Kein Ersatz für den Lärmpegelbereich nach DIN 4109.", vorgewaehlt: false },
};
const DEMO_GRUND: Partial<Record<Thema, string>> = {
  erdbeben: "Demo-Modus: Beispiel für ein nicht ermittelbares Feld (die Zone hängt von der Gemarkung ab).",
  strom: "Demo-Modus: Es gibt keine amtliche, frei nutzbare Zuordnung von Standort zu Netzbetreiber.",
};

/** Dieselben Prüfungen wie im Echtbetrieb (fehlende Angaben, Bundesland), dann eine feste Antwort. */
export function demoStandort(p: Projektangaben, jetzt = new Date()): StandortAntwort | StandortFehler {
  const { anfrage, fehler } = anfrageAusProjekt(p);
  if (!anfrage) return fehler!;
  const am = jetzt.toISOString();
  return {
    ok: true,
    adresse: adresseText(anfrage),
    bundesland: anfrage.land,
    gemeinde: "Musterstadt",
    genauigkeit: "haus",
    verwaltung: { name: "Gemeindeverwaltung Musterstadt", anschrift: "Rathausplatz 1, 89000 Musterstadt", email: "rathaus@musterstadt.example", quelle: DEMO_QUELLE },
    ergebnisse: THEMEN.map((thema): Ergebnis => {
      const w = DEMO_WERTE[thema];
      return w
        ? { thema, status: "ermittelt", ...w, quelle: DEMO_QUELLE, abgerufenAm: am, grund: null, viewer: null }
        : { thema, status: "nicht_ermittelbar", wert: null, anzeige: null, hinweis: null, quelle: null, abgerufenAm: null, grund: DEMO_GRUND[thema] ?? null, viewer: viewerFuer(thema, anfrage.land), vorgewaehlt: false };
    }),
  };
}
