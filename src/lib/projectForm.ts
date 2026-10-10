// Prüfung des Formulars "Neues Projekt". Reine Funktion; dieselben Regeln prüft das Repo beim Speichern.

import type { NewProject } from "./repo";
import type { Project } from "./types";

export type ProjectFormErrors = Partial<Record<"bauherrLabel" | "abmNr" | "hausbauNr" | "location" | "companyId" | "intakeMonth", string>>;

const ABM_RE = /^\d{4}-\d{1,4}$/;
const HAUSBAU_RE = /^[A-Za-z]{1,4}-?\d{3,8}$/;

export function validateNewProject(input: NewProject, existing: Project[]): ProjectFormErrors {
  const e: ProjectFormErrors = {};
  const name = input.bauherrLabel.trim();
  if (!name) e.bauherrLabel = "Bitte den Nachnamen des Bauherrn eintragen.";
  else if (name.length < 2) e.bauherrLabel = "Der Name ist zu kurz.";
  else if (/\d/.test(name)) e.bauherrLabel = "Bitte nur den Nachnamen, ohne Zahlen.";

  if (input.kind === "neubau") {
    const abm = input.abmNr?.trim();
    if (abm) {
      if (!ABM_RE.test(abm)) e.abmNr = "Format: vier Ziffern, Bindestrich, Nummer, z. B. 8161-123.";
      else {
        const dup = existing.find((p) => p.abmNr === abm && p.status !== "storno");
        if (dup) e.abmNr = `Diese ABM-Nr. ist schon vergeben (${dup.bauherrLabel}).`;
      }
    }
    if (!input.companyId) e.companyId = "Bitte die Hausbaufirma wählen.";
  }
  const hb = input.hausbauNr?.trim();
  if (hb && !HAUSBAU_RE.test(hb)) e.hausbauNr = "Format: Buchstaben und Ziffern, z. B. HB-26118.";
  if (!input.location?.trim()) e.location = "Bitte den Bauort eintragen.";
  if (!input.intakeMonth || !/^\d{4}-\d{2}-01$/.test(input.intakeMonth)) e.intakeMonth = "Bitte den Eingangsmonat wählen.";
  return e;
}
