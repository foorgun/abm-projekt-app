// "Projektdaten bearbeiten": berechnet aus dem aktuellen Stand und einer Änderung, was gespeichert wird,
// was ins Protokoll kommt und wie die Aufgabe "Fehlende Angaben nachfragen" danach aussieht.
// Reine Funktion; Demo-Repo und Supabase-Repo führen das Ergebnis nur noch aus.

import { followupForMissingInfo, validateProjectFields, type ProjectFormErrors } from "./projectForm";
import type { BauherrInput, ProjectFields, ProjectPatch } from "./repo";
import type { Dataset, PartyRole, Project } from "./types";

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
};

export const BAUHERR_LABEL: Record<keyof BauherrInput, string> = {
  name: "Name des Bauherrn",
  phone: "Telefon",
  email: "E-Mail",
  address: "Anschrift",
  buildingAddress: "Bauadresse",
};

export const PARTY_LABEL: Record<PartyRole, string> = {
  vermesser: "Vermesser",
  erdbauer: "Erdbauer",
  strom: "Strom",
  wasser: "Wasser",
  elektriker_baustrom: "Elektriker Baustrom",
};

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim().replace(/\s+/g, " ");
  return t ? t : null;
};

export interface ProjectUpdatePlan {
  errors: ProjectFormErrors;
  /** Nur Felder, die sich wirklich ändern (bereinigt). */
  project: Partial<ProjectFields>;
  /** Kontaktdaten nach der Änderung, oder null, wenn sie gleich bleiben. */
  bauherr: Required<BauherrInput> | null;
  /** Nur Beteiligte, die sich ändern; null = austragen. */
  parties: Partial<Record<PartyRole, { name: string; contact: string | null } | null>>;
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
  };
  let after = before;
  let bauherr: Required<BauherrInput> | null = null;
  if (patch.bauherr) {
    after = {
      name: patch.bauherr.name === undefined ? before.name : clean(patch.bauherr.name),
      phone: clean(patch.bauherr.phone),
      email: clean(patch.bauherr.email),
      address: clean(patch.bauherr.address),
      buildingAddress: clean(patch.bauherr.buildingAddress),
    };
    const diff = (Object.keys(BAUHERR_LABEL) as (keyof BauherrInput)[]).filter((k) => after[k] !== before[k]);
    if (diff.length) {
      bauherr = after;
      changed.push(...diff.map((k) => BAUHERR_LABEL[k]));
    }
  }

  // --- Beteiligte
  const partyPatch: ProjectUpdatePlan["parties"] = {};
  const nextParty = new Map(parties.map((x) => [x.role, { name: x.name, contact: x.contact }]));
  for (const role of Object.keys(patch.parties ?? {}) as PartyRole[]) {
    const cur = nextParty.get(role) ?? null;
    const raw = patch.parties![role];
    const want = raw && clean(raw.name) ? { name: clean(raw.name)!, contact: clean(raw.contact) } : null;
    if ((cur?.name ?? null) === (want?.name ?? null) && (cur?.contact ?? null) === (want?.contact ?? null)) continue;
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
