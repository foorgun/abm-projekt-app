// "Projektdaten bearbeiten": berechnet aus dem aktuellen Stand und einer Änderung, was gespeichert wird,
// was ins Protokoll kommt und wie die Aufgabe "Fehlende Angaben nachfragen" danach aussieht.
// Reine Funktion; Demo-Repo und Supabase-Repo führen das Ergebnis nur noch aus.

import { splitAnschrift } from "./planungsprotokoll/daten";
import { followupForMissingInfo, validateProjectFields, type ProjectFormErrors } from "./projectForm";
import type { BauherrInput, PartyInput, ProjectFields, ProjectPatch } from "./repo";
import type { Dataset, PartyRole, Project, ProjectParty } from "./types";

export const FIELD_LABEL: Record<keyof ProjectFields, string> = {
  bauherrLabel: "Bauherr",
  abmNr: "ABM-Nr.",
  hausbauNr: "Hausbau-Nr.",
  companyId: "Hausbaufirma",
  salespersonId: "Verkäufer",
  location: "Bauort",
  architectId: "Architekt",
  planerId: "Planer",
  intakeMonth: "Eingangsmonat",
  baubetreuung: "Baubetreuung",
  flurstueck: "Flurstück",
  gemarkung: "Gemarkung",
  flur: "Flur",
};

export const BAUHERR_LABEL: Record<keyof BauherrInput, string> = {
  name: "Name des Bauherrn",
  phone: "Telefon",
  email: "E-Mail",
  address: "Anschrift",
  buildingAddress: "Bauadresse",
  name2: "Zweiter Bauherr",
  phone2: "Telefon (zweiter Bauherr)",
  email2: "E-Mail (zweiter Bauherr)",
  street: "Straße (Bauherr)",
  postalCode: "PLZ (Bauherr)",
  city: "Ort (Bauherr)",
  mobile: "Mobil (Bauherr)",
  siteStreet: "Bauort Straße/Baugebiet",
  sitePostalCode: "Bauort PLZ",
  siteCity: "Bauort Ort",
  siteDistrict: "Ortsteil",
  siteState: "Bundesland",
};

/** Felder des Bauherrn, die erst mit dem Planungsprotokoll kamen: nicht genannt = unverändert (wie der zweite Bauherr). */
const OPTIONAL_BAUHERR: (keyof BauherrInput)[] = ["name2", "phone2", "email2", "street", "postalCode", "city", "mobile", "siteStreet", "sitePostalCode", "siteCity", "siteDistrict", "siteState"];

export const PARTY_LABEL: Record<PartyRole, string> = {
  vermesser: "Vermesser",
  erdbauer: "Erdbauer",
  strom: "Strom",
  wasser: "Wasser",
  elektriker_baustrom: "Elektriker Baustrom",
  kellerbauer: "Kellerbauer/Bodenplatte",
  baugrundgutachter: "Baugrundgutachter",
  gemeinde: "Gemeinde",
  bauamt: "Bauamt/Bauaufsicht",
  schornsteinfeger: "Schornsteinfeger",
  gas: "Gas",
  fernwaerme: "Fernwärme",
  abwasser: "Abwasser",
  sonstige: "Sonstige",
  sachbearbeiter: "Sachbearbeiter (ABM)",
};

/** Ein Beteiligter vollständig (für den Vergleich und zum Speichern). */
export type PartyValue = Required<Omit<PartyInput, "name">> & { name: string };
const PARTY_FIELDS = ["contact", "address", "phone", "mobile", "email", "fax"] as const;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim().replace(/\s+/g, " ");
  return t ? t : null;
};

type Getrennt = Partial<Pick<BauherrInput, "address" | "buildingAddress" | "street" | "postalCode" | "city" | "siteStreet" | "sitePostalCode" | "siteCity">>;

/**
 * Getrennte Anschrift mitziehen, wenn sich die einzeilige ändert: Stimmen Straße/PLZ/Ort genau mit der aufgeteilten alten
 * Zeile überein (also abgeleitet, nicht von Hand abweichend), werden sie aus der neuen Zeile neu gebildet. Gleiches gilt
 * für Bauadresse und Bauort. Von Hand abweichende Werte bleiben stehen. Liefert nur die Felder, die sich ändern.
 */
export function folgeAnschrift(before: Getrennt, after: Getrennt): Partial<Getrennt> {
  const out: Partial<Getrennt> = {};
  const paare = [
    ["address", "street", "postalCode", "city"],
    ["buildingAddress", "siteStreet", "sitePostalCode", "siteCity"],
  ] as const;
  for (const [zeile, str, plz, ort] of paare) {
    if ((before[zeile] ?? null) === (after[zeile] ?? null)) continue;
    const alt = splitAnschrift(before[zeile]);
    const abgeleitet = (before[str] ?? null) === alt.strasse && (before[plz] ?? null) === alt.plz && (before[ort] ?? null) === alt.ort;
    const leer = !before[str] && !before[plz] && !before[ort];
    if (!abgeleitet || leer) continue;
    const neu = splitAnschrift(after[zeile]);
    Object.assign(out, { [str]: neu.strasse, [plz]: neu.plz, [ort]: neu.ort });
  }
  return out;
}

export interface ProjectUpdatePlan {
  errors: ProjectFormErrors;
  /** Nur Felder, die sich wirklich ändern (bereinigt). */
  project: Partial<ProjectFields>;
  /** Kontaktdaten nach der Änderung, oder null, wenn sie gleich bleiben. */
  bauherr: Required<BauherrInput> | null;
  /** Nur Beteiligte, die sich ändern, vollständig; null = austragen. */
  parties: Partial<Record<PartyRole, PartyValue | null>>;
  /** Namen der geänderten Felder, ohne Werte (Kontaktdaten sollen nicht im Protokoll stehen). */
  changed: string[];
  /** Text für das Protokoll, oder null, wenn sich nichts geändert hat. */
  activity: string | null;
  /** Aufgabe nach der Änderung: Titel und Fälligkeit, oder null, wenn nichts mehr fehlt. */
  followup: { title: string; dueOn: string } | null;
}

export function planProjectUpdate(
  data: Pick<Dataset, "projects" | "bauherren" | "parties" | "salespeople">,
  projectId: string,
  patch: ProjectPatch,
  today: string,
): ProjectUpdatePlan {
  const p = data.projects.find((x) => x.id === projectId);
  if (!p) throw new Error("Projekt nicht gefunden");
  const contact = data.bauherren.find((b) => b.projectId === projectId) ?? null;
  const parties = data.parties.filter((x) => x.projectId === projectId);
  const changed: string[] = [];

  // --- Projektfelder
  const project: Partial<ProjectFields> = {};
  const next: Project = { ...p };
  for (const key of Object.keys(patch.project ?? {}) as (keyof ProjectFields)[]) {
    const value = clean(patch.project![key]);
    if (value === (p[key] ?? null)) continue;
    (project as Record<string, string | null>)[key] = value;
    (next as unknown as Record<string, string | null>)[key] = value;
    changed.push(FIELD_LABEL[key]);
  }
  // Andere Hausbaufirma: ein Verkäufer der alten Firma passt nicht mehr
  if (next.salespersonId && data.salespeople.find((s) => s.id === next.salespersonId)?.companyId !== next.companyId) {
    project.salespersonId = null;
    next.salespersonId = null;
    if (!changed.includes(FIELD_LABEL.salespersonId)) changed.push(FIELD_LABEL.salespersonId);
  }
  if (project.bauherrLabel === null) project.bauherrLabel = ""; // Pflichtfeld: leer wird unten als Fehler gemeldet

  // --- Kontaktdaten
  const before: Required<BauherrInput> = {
    name: contact?.name ?? null,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    address: contact?.address ?? null,
    buildingAddress: contact?.buildingAddress ?? null,
    name2: contact?.name2 ?? null,
    phone2: contact?.phone2 ?? null,
    email2: contact?.email2 ?? null,
    street: contact?.street ?? null,
    postalCode: contact?.postalCode ?? null,
    city: contact?.city ?? null,
    mobile: contact?.mobile ?? null,
    siteStreet: contact?.siteStreet ?? null,
    sitePostalCode: contact?.sitePostalCode ?? null,
    siteCity: contact?.siteCity ?? null,
    siteDistrict: contact?.siteDistrict ?? null,
    siteState: contact?.siteState ?? null,
  };
  let after = before;
  let bauherr: Required<BauherrInput> | null = null;
  if (patch.bauherr) {
    const b = patch.bauherr;
    after = {
      ...before,
      name: b.name === undefined ? before.name : clean(b.name),
      phone: clean(b.phone),
      email: clean(b.email),
      address: clean(b.address),
      buildingAddress: clean(b.buildingAddress),
    };
    // zweiter Bauherr und getrennte Felder: nicht genannt = unverändert
    for (const k of OPTIONAL_BAUHERR) if (b[k] !== undefined) after[k] = clean(b[k]);
    // einzeilige Anschrift geändert, getrennte nicht genannt: abgeleitete Werte mitziehen
    const folge = folgeAnschrift(before, after);
    for (const k of Object.keys(folge) as (keyof typeof folge)[]) if (b[k] === undefined) after[k] = folge[k] ?? null;
    const diff = (Object.keys(BAUHERR_LABEL) as (keyof BauherrInput)[]).filter((k) => after[k] !== before[k]);
    if (diff.length) {
      bauherr = after;
      changed.push(...diff.map((k) => BAUHERR_LABEL[k]));
    }
  }

  // --- Beteiligte
  const partyPatch: ProjectUpdatePlan["parties"] = {};
  const value = (x: ProjectParty): PartyValue => ({ name: x.name, contact: x.contact ?? null, address: x.address ?? null, phone: x.phone ?? null, mobile: x.mobile ?? null, email: x.email ?? null, fax: x.fax ?? null });
  const nextParty = new Map(parties.map((x) => [x.role, value(x)]));
  for (const role of Object.keys(patch.parties ?? {}) as PartyRole[]) {
    const cur = nextParty.get(role) ?? null;
    const raw = patch.parties![role];
    let want: PartyValue | null = null;
    if (raw && clean(raw.name)) {
      want = { name: clean(raw.name)!, contact: null, address: null, phone: null, mobile: null, email: null, fax: null };
      for (const f of PARTY_FIELDS) want[f] = raw[f] === undefined ? (cur?.[f] ?? null) : clean(raw[f]);
    }
    if (JSON.stringify(cur) === JSON.stringify(want)) continue;
    partyPatch[role] = want;
    if (want) nextParty.set(role, want);
    else nextParty.delete(role);
    changed.push(PARTY_LABEL[role]);
  }

  const errors = validateProjectFields(
    { bauherrLabel: next.bauherrLabel ?? "", kind: next.kind, abmNr: next.abmNr, hausbauNr: next.hausbauNr ?? null, intakeMonth: next.intakeMonth, email: after.email },
    data.projects.filter((x) => x.id !== projectId),
  );

  const followup = followupForMissingInfo(
    {
      kind: next.kind,
      companyId: next.companyId,
      salespersonId: next.salespersonId,
      phone: after.phone,
      email: after.email,
      buildingAddress: after.buildingAddress,
      vermesser: nextParty.get("vermesser")?.name ?? null,
    },
    today,
  );

  return { errors, project, bauherr, parties: partyPatch, changed, activity: changed.length ? `Projektdaten geändert: ${changed.join(", ")}` : null, followup };
}
