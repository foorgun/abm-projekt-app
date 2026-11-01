// Feldzuordnung Seite 1: Formularfeld der Vorlage → Wert aus den Protokolldaten.
// Grundlage: Feld-Inventar docs/planungsprotokoll/<vorlage>.json (scripts/planungsprotokoll/felder.mjs) und der
// Machbarkeitstest (docs/planungsprotokoll-analyse.md). Living Haus und Bien-Zenker haben dieselben Feldnamen.
// Nicht zugeordnet und damit unberührt: alles ab Seite 2 (Ausnahme: der Schornsteinfeger bei Schwabenhaus, der dort erst
// auf Seite 2 steht), das Rich-Text-Feld von Schwabenhaus und die vier Summenfelder der Flächenberechnung von
// Living Haus/Bien-Zenker.

import type { ProtokollVorlage, StandortWert } from "../types";
import { nameAnschrift, type Kontakt, type ProtokollDaten, type ProtokollRolle } from "./daten";

type Wert = (d: ProtokollDaten) => string | null;
export type Zuordnung = Record<string, Wert>;

const rolle = (r: ProtokollRolle) => (d: ProtokollDaten) => d.beteiligte[r];
/** FB-22 kennt nur eine "Genehmigungsbehörde (Gemeinde bzw. Bauamt)": das Bauamt, sonst die Gemeinde. */
const genehmigung = (d: ProtokollDaten): Kontakt => (d.beteiligte.bauamt.name ? d.beteiligte.bauamt : d.beteiligte.gemeinde);

const SCHWABENHAUS: Zuordnung = {
  "BV-Nr": (d) => d.projektNr,
  BauherrName: (d) => d.bauherr.name,
  BauherrStraße: (d) => d.bauherr.strasse,
  BauherrOrt: (d) => d.bauherr.plzOrt,
  BauherrMobil: (d) => d.bauherr.mobil,
  BauherrMail: (d) => d.bauherr.mail,
  BauortPLZ: (d) => d.bauort.plzOrt,
  BauortStr: (d) => d.bauort.strasse,
  BauortGemarkung: (d) => d.bauort.gemarkung,
  BauortOrtsteil: (d) => d.bauort.ortsteil,
  BauortFlurstück: (d) => d.bauort.flurstueck,
  BauortBundesland: (d) => d.bauort.bundesland,
};
// Beteiligte auf Seite 1: "Name/Anschrift", Tel., Mobil, E-Mail
for (const [prefix, r] of [
  ["Architekt", "architekt"],
  ["Vermesser", "vermesser"],
  ["BGGutachter", "baugrundgutachter"],
  ["Erdbau", "erdbauer"],
  ["Keller", "kellerbauer"],
] as const) {
  const k = rolle(r);
  Object.assign(SCHWABENHAUS, {
    [`${prefix}Name`]: (d: ProtokollDaten) => nameAnschrift(k(d)),
    [`${prefix}Tel`]: (d: ProtokollDaten) => k(d).tel,
    [`${prefix}Mobil`]: (d: ProtokollDaten) => k(d).mobil,
    [`${prefix}Mail`]: (d: ProtokollDaten) => k(d).mail,
  });
}
// Genehmigungsbehörde: Gemeinde und Bauaufsicht getrennt, mit Fax, ohne Mobil
for (const [prefix, r] of [
  ["Gemeinde", "gemeinde"],
  ["Bauamt", "bauamt"],
] as const) {
  const k = rolle(r);
  Object.assign(SCHWABENHAUS, {
    [prefix]: (d: ProtokollDaten) => nameAnschrift(k(d)),
    [`${prefix}Tel`]: (d: ProtokollDaten) => k(d).tel,
    [`${prefix}Mail`]: (d: ProtokollDaten) => k(d).mail,
    [`${prefix}Fax`]: (d: ProtokollDaten) => k(d).fax,
  });
}

// Schornsteinfeger (Seite 2): Name und Anschrift getrennt, nur ein Telefonfeld. Es heißt "SchornsteinTel", ist im
// Formular aber mit "Mobil:" beschriftet: deshalb die Mobilnummer, ohne sie die Festnetznummer.
Object.assign(SCHWABENHAUS, {
  SchornsteinName: (d: ProtokollDaten) => d.beteiligte.schornsteinfeger.name,
  SchornsteinAnschrift: (d: ProtokollDaten) => d.beteiligte.schornsteinfeger.anschrift,
  SchornsteinTel: (d: ProtokollDaten) => d.beteiligte.schornsteinfeger.mobil ?? d.beteiligte.schornsteinfeger.tel,
  SchornsteinMail: (d: ProtokollDaten) => d.beteiligte.schornsteinfeger.mail,
});

const t = (n: string) => `Textfeld 1.${n}`;
const FB22: Zuordnung = {
  [t("01")]: (d) => d.projektNr,
  [t("02")]: (d) => d.bauherr.name,
  [t("03")]: (d) => d.bauherr.strasse,
  [t("05")]: (d) => d.bauherr.plzOrt,
  [t("04")]: (d) => d.bauherr.mobil,
  [t("06")]: (d) => d.bauherr.mail,
  [t("07")]: (d) => d.bauort.strasse,
  [t("10")]: (d) => d.bauort.plzOrt,
  [t("08")]: (d) => d.bauort.gemarkung,
  [t("11")]: (d) => d.bauort.ortsteil,
  [t("09")]: (d) => d.bauort.flurstueck,
  [t("12")]: (d) => d.bauort.bundesland,
};
// Name, Tel., Mobil (nicht bei den Versorgern), E-Mail. Die Nummern folgen nicht der Reihenfolge auf der Seite.
const FB22_ROLLEN: [(d: ProtokollDaten) => Kontakt, string, string, string | null, string][] = [
  [rolle("architekt"), "13", "14", "15", "16"],
  [rolle("vermesser"), "17", "29", "28", "27"],
  [rolle("kellerbauer"), "18", "32", "31", "30"],
  [rolle("erdbauer"), "19", "35", "34", "33"],
  [genehmigung, "20", "38", "37", "36"],
  [rolle("schornsteinfeger"), "21", "41", "40", "39"],
  [rolle("strom"), "22", "44", null, "43"],
  [rolle("gas"), "23", "42", null, "47"],
  [rolle("fernwaerme"), "24", "46", null, "45"],
  [rolle("wasser"), "25", "50", null, "49"],
  [rolle("abwasser"), "26", "48", null, "51"],
];
for (const [k, name, tel, mobil, mail] of FB22_ROLLEN) {
  FB22[t(name)] = (d) => nameAnschrift(k(d));
  FB22[t(tel)] = (d) => k(d).tel;
  if (mobil) FB22[t(mobil)] = (d) => k(d).mobil;
  FB22[t(mail)] = (d) => k(d).mail;
}

export const ZUORDNUNG: Record<ProtokollVorlage, Zuordnung> = {
  schwabenhaus: SCHWABENHAUS,
  "living-haus": FB22,
  "bien-zenker": FB22,
};

/** Werte je Formularfeld (null = leer lassen). */
export function feldwerte(vorlage: ProtokollVorlage, daten: ProtokollDaten): Record<string, string | null> {
  return Object.fromEntries(Object.entries(ZUORDNUNG[vorlage]).map(([feld, wert]) => [feld, wert(daten)]));
}

// ---------------------------------------------------------------------------
// Standortangaben: Ankreuzfelder. Nur übernommene Werte (Tabelle standort_angaben) werden angekreuzt.
// Schwabenhaus (Seite 3): Radio-Gruppen, in der Datei liegt jede Auswahl dreifach übereinander. `widget` zeigt auf die oberste, zuletzt
// gezeichnete Lage: Ein Kreuz in einer unteren Lage wäre vom leeren Kästchen darüber verdeckt. Reihenfolge je Lage von links nach
// rechts. Living Haus/Bien-Zenker (Seite 2): einzelne Kontrollkästchen.
// Bewusst ohne Ziel: Lärm (die Felder dort sind Lärmpegelbereiche nach DIN 4109, nicht die Lärmkartierung), Hochwasser (kein Feld
// in den Vorlagen), Geländehöhe („Höhe über NN“ meint RFB/FFB des Gebäudes), Radon bei FB-22 (kein Feld) und das
// Rich-Text-Feld der Wasserschutz-Auflagen.
// ---------------------------------------------------------------------------

export interface Ankreuz {
  feld: string;
  /** Nur bei Radio-Gruppen */
  widget?: number;
}

const kk = (n: string): Ankreuz => ({ feld: `Kontrollkästchen 2.${n}` });
const sh = (feld: string, widget: number): Ankreuz => ({ feld, widget });
const FB22_ANKREUZ: Record<string, Record<string, Ankreuz>> = {
  schneelast: { "1": kk("03"), "1a": kk("04"), "2": kk("05"), "2a": kk("06"), "3": kk("07") },
  erdbeben: { keine: kk("11"), "0": kk("12"), "1": kk("13"), "2": kk("14"), "3": kk("15") },
  wasserschutz: { keine: kk("16"), "1": kk("17"), "2": kk("18"), "3": kk("19") },
};
export const ANKREUZ: Record<ProtokollVorlage, Record<string, Record<string, Ankreuz>>> = {
  schwabenhaus: {
    schneelast: { "1": sh("SLZ", 10), "1a": sh("SLZ", 11), "2": sh("SLZ", 12), "2a": sh("SLZ", 13), "3": sh("SLZ", 14) },
    erdbeben: { "0": sh("Erdbebenzone", 8), "1": sh("Erdbebenzone", 9), "2": sh("Erdbebenzone", 10), "3": sh("Erdbebenzone", 11) },
    radon: { ja: sh("Radon", 4), nein: sh("Radon", 5) },
    // Ein einziger Kreis "Wasserschutzgebiet, Auflagen": angekreuzt, sobald das Grundstück in einem Gebiet liegt
    wasserschutz: { gebiet: sh("Wasserschutz", 2), "1": sh("Wasserschutz", 2), "2": sh("Wasserschutz", 2), "3": sh("Wasserschutz", 2) },
  },
  "living-haus": FB22_ANKREUZ,
  "bien-zenker": FB22_ANKREUZ,
};

/** Bei "keine" hat Schwabenhaus kein eigenes Kästchen: Der leere Kreis sagt dort bereits "nein". */
const OHNE_KREUZ_RICHTIG: Partial<Record<ProtokollVorlage, Record<string, string[]>>> = { schwabenhaus: { wasserschutz: ["keine"] } };

/** Übernommene Werte in Kreuze übersetzen. `offen`: Werte, die diese Vorlage nicht ankreuzen kann (zum Vermerken von Hand). */
export function ankreuzWerte(vorlage: ProtokollVorlage, angaben: Record<string, StandortWert> | undefined): { kreuze: Ankreuz[]; offen: string[] } {
  const kreuze: Ankreuz[] = [];
  const offen: string[] = [];
  for (const [thema, ziele] of Object.entries(ANKREUZ[vorlage])) {
    const a = angaben?.[thema];
    if (!a) continue;
    const ziel = ziele[a.wert];
    if (ziel) kreuze.push(ziel);
    else if (!OHNE_KREUZ_RICHTIG[vorlage]?.[thema]?.includes(a.wert)) offen.push(a.anzeige);
  }
  return { kreuze, offen };
}

/** Kurzer Stand für die Oberfläche: wie viele Felder auf Seite 1 einen Wert bekommen. */
export function feldStand(vorlage: ProtokollVorlage, daten: ProtokollDaten): { gefuellt: number; gesamt: number } {
  const werte = Object.values(feldwerte(vorlage, daten));
  return { gefuellt: werte.filter(Boolean).length, gesamt: werte.length };
}

/** Beteiligte, die die Vorlage vorbefüllt (für den Hinweis „noch leer“; bei Schwabenhaus der Schornsteinfeger auf Seite 2). */
export const ROLLEN_SEITE1: Record<ProtokollVorlage, ProtokollRolle[]> = {
  schwabenhaus: ["architekt", "vermesser", "baugrundgutachter", "erdbauer", "kellerbauer", "gemeinde", "bauamt", "schornsteinfeger"],
  "living-haus": ["architekt", "vermesser", "kellerbauer", "erdbauer", "bauamt", "schornsteinfeger", "strom", "gas", "fernwaerme", "wasser", "abwasser"],
  "bien-zenker": ["architekt", "vermesser", "kellerbauer", "erdbauer", "bauamt", "schornsteinfeger", "strom", "gas", "fernwaerme", "wasser", "abwasser"],
};

export const ROLLE_LABEL: Record<ProtokollRolle, string> = {
  architekt: "Architekt (Bürodaten)",
  vermesser: "Vermesser",
  baugrundgutachter: "Baugrundgutachter",
  erdbauer: "Erdbau",
  kellerbauer: "Kellerbauer/Bodenplatte",
  gemeinde: "Gemeinde",
  bauamt: "Bauamt/Bauaufsicht",
  schornsteinfeger: "Schornsteinfeger",
  strom: "Strom",
  gas: "Gas",
  fernwaerme: "Fernwärme",
  wasser: "Wasser",
  abwasser: "Abwasser",
  sonstige: "Sonstige",
};

/** Was auf Seite 1 dieser Vorlage noch leer bleibt, in Worten (für den Hinweis über den Knöpfen). */
export function nochLeer(vorlage: ProtokollVorlage, d: ProtokollDaten): string[] {
  const out: string[] = [];
  if (!d.projektNr) out.push("Hausbau-Nr.");
  const b = d.bauherr;
  for (const [v, l] of [
    [b.strasse, "Straße des Bauherrn"],
    [b.plzOrt, "PLZ/Ort des Bauherrn"],
    [b.mobil, "Mobil des Bauherrn"],
    [b.mail, "E-Mail des Bauherrn"],
  ] as const)
    if (!v) out.push(l);
  const o = d.bauort;
  for (const [v, l] of [
    [o.strasse, "Bauort Straße"],
    [o.plzOrt, "Bauort PLZ/Ort"],
    [o.gemarkung, "Gemarkung"],
    [o.ortsteil, "Ortsteil"],
    [o.flurstueck, "Flur/Flurstück"],
    [o.bundesland, "Bundesland"],
  ] as const)
    if (!v) out.push(l);
  for (const r of ROLLEN_SEITE1[vorlage]) {
    // FB-22: eine Genehmigungsbehörde, Bauamt oder Gemeinde genügt
    if (r === "bauamt" && vorlage !== "schwabenhaus" && (d.beteiligte.bauamt.name || d.beteiligte.gemeinde.name)) continue;
    if (!d.beteiligte[r].name) out.push(r === "bauamt" && vorlage !== "schwabenhaus" ? "Genehmigungsbehörde" : ROLLE_LABEL[r]);
  }
  return out;
}
