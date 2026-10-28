// Prüfung des Formulars "Neues Projekt" und Regel "Fehlende Angaben nachfragen".
// Reine Funktionen; dieselben Regeln nutzen das Demo-Repo und das Supabase-Repo.
// Pflicht ist nur der Bauherr. Alles andere darf fehlen und wird dann per Aufgabe nachgefragt.

import { ABM_RE, parseAbm } from "./abmNr";
import { addDays } from "./format";
import type { NewProject } from "./repo";
import type { Project } from "./types";

export type ProjectFormErrors = Partial<Record<"bauherrLabel" | "abmNr" | "hausbauNr" | "intakeMonth" | "email", string>>;

const HAUSBAU_RE = /^[A-Za-z]{1,4}-?\d{3,8}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Prüft die Angaben zu einem Projekt. `existing` ohne das Projekt selbst übergeben, wenn ein bestehendes bearbeitet wird. */
export function validateProjectFields(
  input: { bauherrLabel: string; kind: Project["kind"]; abmNr: string | null; hausbauNr: string | null; intakeMonth: string | null; email?: string | null },
  existing: Project[],
): ProjectFormErrors {
  const e: ProjectFormErrors = {};
  const name = input.bauherrLabel.trim();
  if (!name) e.bauherrLabel = "Bitte den Nachnamen des Bauherrn eintragen.";
  else if (name.length < 2) e.bauherrLabel = "Der Name ist zu kurz.";
  else if (/\d/.test(name)) e.bauherrLabel = "Bitte nur den Nachnamen, ohne Zahlen.";

  // Freiwillige Angaben: nur prüfen, wenn etwas eingetragen ist
  const abm = input.kind === "neubau" ? input.abmNr?.trim() : "";
  if (abm) {
    if (!ABM_RE.test(abm)) e.abmNr = "Format: vier Ziffern, Bindestrich, Nummer ohne führende Nullen, z. B. 8161-1588.";
    else if (/^\d{4}-0/.test(abm)) e.abmNr = `Ohne führende Nullen, also ${abm.slice(0, 5)}${Number(abm.slice(5))}.`;
    else {
      // eindeutig auch gegenüber stornierten Projekten (wie in der Datenbank, Migration 0017)
      const a = parseAbm(abm)!;
      const dup = existing.find((p) => {
        const b = parseAbm(p.abmNr);
        return b?.prefix === a.prefix && b.num === a.num;
      });
      if (dup) e.abmNr = `Diese ABM-Nr. ist schon vergeben (${dup.bauherrLabel}${dup.status === "storno" ? ", storniert" : ""}).`;
    }
  }
  const hb = input.hausbauNr?.trim();
  if (hb && !HAUSBAU_RE.test(hb)) e.hausbauNr = "Format: Buchstaben und Ziffern, z. B. HB-26118.";
  if (input.intakeMonth && !/^\d{4}-\d{2}-01$/.test(input.intakeMonth)) e.intakeMonth = "Bitte einen gültigen Monat wählen.";
  const mail = input.email?.trim();
  if (mail && !EMAIL_RE.test(mail)) e.email = "Bitte eine gültige E-Mail-Adresse eintragen.";
  return e;
}

export function validateNewProject(input: NewProject, existing: Project[]): ProjectFormErrors {
  return validateProjectFields({ ...input, email: input.bauherr?.email }, existing);
}

/** Was die Regel "Fehlende Angaben nachfragen" von einem Projekt wissen muss. */
export interface ProjectInfoState {
  kind: Project["kind"];
  companyId: string | null;
  salespersonId: string | null;
  phone: string | null;
  email: string | null;
  buildingAddress: string | null;
  vermesser: string | null;
}

const has = (v: string | null | undefined) => Boolean(v?.trim());

/**
 * Angaben, die noch fehlen und nachgefragt werden sollen: Kontakt des Bauherrn (Telefon oder E-Mail), Bauadresse,
 * Hausbaufirma, Verkäufer, Vermesser. ABM-Nr. und Eingangsmonat gehören bewusst nicht dazu (die Nummer ist am Anfang
 * oft unbekannt, den Monat setzt die App). Bei einer Bauvoranfrage entfallen Hausbaufirma und Verkäufer.
 */
export function missingProjectInfo(s: ProjectInfoState): string[] {
  const missing: string[] = [];
  if (!has(s.phone) && !has(s.email)) missing.push("Telefon oder E-Mail des Bauherrn");
  if (!has(s.buildingAddress)) missing.push("Bauadresse");
  if (s.kind === "neubau") {
    if (!s.companyId) missing.push("Hausbaufirma");
    if (!s.salespersonId) missing.push("Verkäufer");
  }
  if (!has(s.vermesser)) missing.push("Vermesser");
  return missing;
}

export function infoStateOfNew(input: NewProject): ProjectInfoState {
  return {
    kind: input.kind,
    companyId: input.companyId,
    salespersonId: input.salespersonId,
    phone: input.bauherr?.phone ?? null,
    email: input.bauherr?.email ?? null,
    buildingAddress: input.bauherr?.buildingAddress ?? null,
    vermesser: input.vermesser ?? null,
  };
}

/** Tage bis zur Fälligkeit der Aufgabe "fehlende Angaben nachfragen". Annahme, nicht bestätigt. */
export const FOLLOWUP_DUE_DAYS = 7;
export const FOLLOWUP_PREFIX = "Fehlende Angaben nachfragen: ";

/** Schlüssel der Aufgabe: genau eine je Projekt. */
export function followupKey(projectId: string): string {
  return `angaben:${projectId}`;
}

/** Aufgabe zum Nachfragen (alle fehlenden Felder in einer Zeile), oder null, wenn nichts fehlt. */
export function followupForMissingInfo(state: ProjectInfoState, today: string): { title: string; dueOn: string } | null {
  const missing = missingProjectInfo(state);
  if (!missing.length) return null;
  return { title: FOLLOWUP_PREFIX + missing.join(", "), dueOn: addDays(today, FOLLOWUP_DUE_DAYS) };
}

/** Name für einen neuen Stammdatensatz prüfen (Hausbaufirma, Verkäufer, Architekt, Vermesser). Liefert den bereinigten Namen. */
export function cleanMasterName(raw: string, existing: string[]): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, reason: "Bitte einen Namen eintragen." };
  if (name.length > 80) return { ok: false, reason: "Der Name ist zu lang." };
  const key = name.toLocaleLowerCase("de");
  if (existing.some((x) => x.trim().toLocaleLowerCase("de") === key)) return { ok: false, reason: "Diesen Eintrag gibt es schon." };
  return { ok: true, name };
}
