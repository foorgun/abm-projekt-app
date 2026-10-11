// Prüfung des Formulars "Neues Projekt". Reine Funktionen; dieselben Regeln prüft das Repo beim Speichern.
// Pflicht ist nur der Bauherr. Alles andere darf fehlen und wird dann per Aufgabe nachgefragt.

import { addDays } from "./format";
import type { NewProject } from "./repo";
import type { Project } from "./types";

export type ProjectFormErrors = Partial<Record<"bauherrLabel" | "abmNr" | "hausbauNr" | "intakeMonth", string>>;

const ABM_RE = /^\d{4}-\d{1,4}$/;
const HAUSBAU_RE = /^[A-Za-z]{1,4}-?\d{3,8}$/;

export function validateNewProject(input: NewProject, existing: Project[]): ProjectFormErrors {
  const e: ProjectFormErrors = {};
  const name = input.bauherrLabel.trim();
  if (!name) e.bauherrLabel = "Bitte den Nachnamen des Bauherrn eintragen.";
  else if (name.length < 2) e.bauherrLabel = "Der Name ist zu kurz.";
  else if (/\d/.test(name)) e.bauherrLabel = "Bitte nur den Nachnamen, ohne Zahlen.";

  // Freiwillige Angaben: nur prüfen, wenn etwas eingetragen ist
  const abm = input.kind === "neubau" ? input.abmNr?.trim() : "";
  if (abm) {
    if (!ABM_RE.test(abm)) e.abmNr = "Format: vier Ziffern, Bindestrich, Nummer, z. B. 8161-123.";
    else {
      const dup = existing.find((p) => p.abmNr === abm && p.status !== "storno");
      if (dup) e.abmNr = `Diese ABM-Nr. ist schon vergeben (${dup.bauherrLabel}).`;
    }
  }
  const hb = input.hausbauNr?.trim();
  if (hb && !HAUSBAU_RE.test(hb)) e.hausbauNr = "Format: Buchstaben und Ziffern, z. B. HB-26118.";
  if (input.intakeMonth && !/^\d{4}-\d{2}-01$/.test(input.intakeMonth)) e.intakeMonth = "Bitte einen gültigen Monat wählen.";
  return e;
}

/** Angaben, die beim Anlegen noch fehlen und nachgefragt werden sollen (in der Reihenfolge des Formulars). */
export function missingProjectInfo(input: NewProject): string[] {
  const missing: string[] = [];
  if (input.kind === "neubau") {
    if (!input.companyId) missing.push("Hausbaufirma");
    if (!input.abmNr?.trim()) missing.push("ABM-Nr.");
  }
  if (!input.location?.trim()) missing.push("Bauort");
  if (!input.intakeMonth) missing.push("Eingangsmonat");
  return missing;
}

/** Tage bis zur Fälligkeit der Aufgabe "fehlende Angaben nachfragen". Annahme, nicht bestätigt. */
export const FOLLOWUP_DUE_DAYS = 7;

/** Aufgabe zum Nachfragen, oder null, wenn nichts fehlt. */
export function followupForMissingInfo(input: NewProject, today: string): { title: string; dueOn: string } | null {
  const missing = missingProjectInfo(input);
  if (!missing.length) return null;
  return { title: `Fehlende Angaben nachfragen: ${missing.join(", ")}`, dueOn: addDays(today, FOLLOWUP_DUE_DAYS) };
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
