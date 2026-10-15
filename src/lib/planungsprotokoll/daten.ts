// Planungsprotokoll: aus Projekt, Bauherr, Beteiligten und Bürodaten die Werte für Seite 1 bilden. Reine Funktionen.
// Fehlt etwas, bleibt der Wert null (das Feld im PDF bleibt leer); es gibt keinen Fehler.

import type { BauherrContact, BueroDaten, Dataset, PartyRole, ProjectParty } from "../types";

/** Beteiligte, wie sie im Protokoll vorkommen ("architekt" kommt aus den Bürodaten, ggf. mit Sachbearbeiter). */
export const PROTOKOLL_ROLLEN = [
  "architekt",
  "vermesser",
  "baugrundgutachter",
  "erdbauer",
  "kellerbauer",
  "gemeinde",
  "bauamt",
  "schornsteinfeger",
  "strom",
  "gas",
  "fernwaerme",
  "wasser",
  "abwasser",
  "sonstige",
] as const;
export type ProtokollRolle = (typeof PROTOKOLL_ROLLEN)[number];

export interface Kontakt {
  name: string | null;
  anschrift: string | null;
  tel: string | null;
  mobil: string | null;
  mail: string | null;
  fax: string | null;
}

export interface ProtokollDaten {
  projektNr: string | null;
  bauherr: { name: string | null; strasse: string | null; plzOrt: string | null; mobil: string | null; mail: string | null };
  bauort: { strasse: string | null; plzOrt: string | null; gemarkung: string | null; ortsteil: string | null; flurstueck: string | null; bundesland: string | null };
  beteiligte: Record<ProtokollRolle, Kontakt>;
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};
const join = (parts: (string | null | undefined)[], sep: string): string | null => clean(parts.map(clean).filter(Boolean).join(sep));

/**
 * Anschrift in einer Zeile aufteilen: "Größlestraße 7, 89077 Ulm" → Straße, PLZ, Ort. Nur bei eindeutiger Form
 * (fünfstellige PLZ vor dem Ort); sonst nichts raten.
 */
export function splitAnschrift(text: string | null | undefined): { strasse: string | null; plz: string | null; ort: string | null } {
  const t = clean(text);
  const m = t?.match(/^(?:(.*?)[,\s]+)?(\d{5})\s+(.+)$/);
  if (!m) return { strasse: null, plz: null, ort: null };
  return { strasse: clean(m[1]?.replace(/,\s*$/, "")), plz: m[2], ort: clean(m[3]) };
}

const EMAIL = /[^\s,;]+@[^\s,;]+\.[a-z]{2,}/i;
const PHONE = /\+?\d[\d\s/()-]{5,}\d/;
/** Aus der alten Kontaktzeile Telefon und E-Mail lesen (z. B. "0731 12345, info@firma.de"). */
export function splitKontaktzeile(text: string | null | undefined): { tel: string | null; mail: string | null } {
  const t = clean(text) ?? "";
  return { tel: clean(t.match(PHONE)?.[0]), mail: clean(t.match(EMAIL)?.[0]) };
}

/** Handynummer (deutsches Mobilnetz 015x, 016x, 017x)? */
export const istMobil = (tel: string | null | undefined): boolean => /^(\+49|0049|0)\s*1[5-7]/.test((tel ?? "").replace(/[\s/()-]/g, ""));

const leer: Kontakt = { name: null, anschrift: null, tel: null, mobil: null, mail: null, fax: null };

function kontaktAus(p: ProjectParty | undefined): Kontakt {
  if (!p) return { ...leer };
  const alt = splitKontaktzeile(p.contact);
  return {
    name: clean(p.name),
    anschrift: clean(p.address),
    tel: clean(p.phone) ?? alt.tel,
    mobil: clean(p.mobile),
    mail: clean(p.email) ?? alt.mail,
    fax: clean(p.fax),
  };
}

/** Architekt: Bürodaten; ein Sachbearbeiter im Projekt ergänzt den Namen und ersetzt Tel., Mobil und E-Mail, soweit er sie hat. */
export function architektKontakt(buero: BueroDaten | null, sachbearbeiter: ProjectParty | undefined): Kontakt {
  const sb = kontaktAus(sachbearbeiter);
  return {
    name: join([buero?.name, sb.name], ", "),
    anschrift: clean(buero?.anschrift),
    tel: sb.tel ?? clean(buero?.tel),
    mobil: sb.mobil ?? clean(buero?.mobil),
    mail: sb.mail ?? clean(buero?.email),
    fax: null,
  };
}

/** Name und Anschrift in einem Feld ("Name/Anschrift", große Namensfelder). */
export const nameAnschrift = (k: Kontakt): string | null => join([k.name, k.anschrift], ", ");

function bauherrTeil(contact: BauherrContact | null, label: string) {
  // Getrennte Felder gehen vor; nur wenn keines gesetzt ist, wird die alte Zeile aufgeteilt
  const getrennt = clean(contact?.street) || clean(contact?.postalCode) || clean(contact?.city);
  const alt = getrennt ? { strasse: null, plz: null, ort: null } : splitAnschrift(contact?.address);
  const phone = clean(contact?.phone);
  return {
    name: join([clean(contact?.name) ?? label, contact?.name2], " und "),
    strasse: clean(contact?.street) ?? alt.strasse,
    plzOrt: join([clean(contact?.postalCode) ?? alt.plz, clean(contact?.city) ?? alt.ort], " "),
    // Das Protokoll fragt nur "Mobil": ohne eigene Mobilnummer die Telefonnummer, wenn sie eine Handynummer ist
    mobil: clean(contact?.mobile) ?? (istMobil(phone) ? phone : null),
    mail: clean(contact?.email),
  };
}

function bauortTeil(contact: BauherrContact | null, project: { location: string | null; flur?: string | null; flurstueck?: string | null; gemarkung?: string | null }) {
  const getrennt = clean(contact?.siteStreet) || clean(contact?.sitePostalCode) || clean(contact?.siteCity);
  const alt = getrennt ? { strasse: null, plz: null, ort: null } : splitAnschrift(contact?.buildingAddress);
  const ort = clean(contact?.siteCity) ?? alt.ort ?? clean(project.location);
  const flur = clean(project.flur);
  const flst = clean(project.flurstueck);
  return {
    // Ohne aufteilbare Form steht die Bauadresse unverändert im Feld "Straße/Baugebiet"
    strasse: clean(contact?.siteStreet) ?? alt.strasse ?? (getrennt || alt.plz ? null : clean(contact?.buildingAddress)),
    plzOrt: join([clean(contact?.sitePostalCode) ?? alt.plz, ort], " "),
    gemarkung: clean(project.gemarkung),
    ortsteil: clean(contact?.siteDistrict),
    flurstueck: flur && flst ? `Flur ${flur.replace(/^flur\s*/i, "")}, Flst. ${flst.replace(/^(flst\.?|flurstück)\s*/i, "")}` : flur ? `Flur ${flur.replace(/^flur\s*/i, "")}` : flst,
    bundesland: clean(contact?.siteState),
  };
}

/** Alle Werte für Seite 1 eines Projekts. `data` ist der geladene Datenbestand (Admin oder Mitarbeiter). */
export function protokollDaten(data: Pick<Dataset, "projects" | "bauherren" | "parties" | "buero">, projectId: string): ProtokollDaten {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Projekt nicht gefunden");
  const contact = data.bauherren.find((b) => b.projectId === projectId) ?? null;
  const parties = data.parties.filter((p) => p.projectId === projectId);
  const party = (role: PartyRole) => parties.find((p) => p.role === role);
  const beteiligte = Object.fromEntries(PROTOKOLL_ROLLEN.map((r) => [r, r === "architekt" ? architektKontakt(data.buero, party("sachbearbeiter")) : kontaktAus(party(r))])) as Record<ProtokollRolle, Kontakt>;
  return {
    // Annahme: "Projekt-Nr." (FB-22) bzw. "Schwabenhaus BV-Nr." ist die Hausbau-Nr. (docs/offene-fragen.md)
    projektNr: clean(project.hausbauNr),
    bauherr: bauherrTeil(contact, project.bauherrLabel),
    bauort: bauortTeil(contact, project),
    beteiligte,
  };
}
