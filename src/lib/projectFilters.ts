// Suche, Filter und Sortierung der Projektliste. Reine Funktionen (getestet), Zustand liegt in der URL.

import { parseAbm } from "./abmNr";
import { phaseOf, progressOf } from "./projects";
import type { StepDefinition } from "./steps";
import type { Company, Project, Task, TeamMember } from "./types";

export type ProjectTab = "alle" | "aktiv" | "abgeschlossen";
export type ProjectSort = "eingang" | "abm" | "bauherr" | "fortschritt";

export interface ProjectFilters {
  q: string;
  company: string; // "" = alle, "-" = ohne Firma
  architect: string;
  phase: string;
  sort: ProjectSort;
  storno: boolean;
  group: boolean;
}

export const DEFAULT_FILTERS: ProjectFilters = { q: "", company: "", architect: "", phase: "", sort: "eingang", storno: false, group: false };

/** Kleinbuchstaben, Umlaute vereinheitlicht, Leerzeichen/Bindestriche/Punkte entfernt (für Nummern). */
export function compactText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\s\-–._/]+/g, "");
}

/** Treffer, wenn jedes Suchwort in Bauherr, ABM-Nr., Hausbau-Nr., Ort oder Firma vorkommt. */
export function matchesQuery(p: Project, q: string, companyName?: string | null): boolean {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = compactText([p.bauherrLabel, p.abmNr, p.hausbauNr, p.location, companyName].filter(Boolean).join("|"));
  // Zusätzlich die ganze Eingabe kompakt prüfen: "8161 101" findet "8161-101"
  if (words.length > 1 && hay.includes(compactText(q))) return true;
  return words.every((w) => hay.includes(compactText(w)));
}

export function tabFilter(tab: ProjectTab, showStorno: boolean) {
  return (p: Project) =>
    tab === "aktiv" ? p.status === "aktiv" : tab === "abgeschlossen" ? p.status === "abgeschlossen" : p.status !== "storno" || showStorno;
}

export function filterProjects(
  projects: Project[],
  tab: ProjectTab,
  f: ProjectFilters,
  ctx: { steps: StepDefinition[]; companies: Company[] },
): Project[] {
  const companyName = new Map(ctx.companies.map((c) => [c.id, c.name]));
  return projects.filter(
    (p) =>
      tabFilter(tab, f.storno)(p) &&
      (!f.company || (f.company === "-" ? !p.companyId : p.companyId === f.company)) &&
      (!f.architect || p.architectId === f.architect) &&
      (!f.phase || phaseOf(p, ctx.steps).key === f.phase) &&
      matchesQuery(p, f.q, p.companyId ? companyName.get(p.companyId) : null),
  );
}

/** ABM-Nummern numerisch vergleichen: erst Nummernkreis, dann Nummer ("8185-633" vor "8185-1588"); Bauvoranfragen/leer ans Ende. */
export function compareAbm(a: string | null, b: string | null): number {
  const ka = parseAbm(a);
  const kb = parseAbm(b);
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  return Number(ka.prefix) - Number(kb.prefix) || ka.num - kb.num;
}

export function sortProjects(projects: Project[], sort: ProjectSort, steps: StepDefinition[]): Project[] {
  const list = [...projects];
  switch (sort) {
    case "abm":
      return list.sort((a, b) => compareAbm(a.abmNr, b.abmNr));
    case "bauherr":
      return list.sort((a, b) => a.bauherrLabel.localeCompare(b.bauherrLabel, "de"));
    case "fortschritt":
      return list.sort((a, b) => progressOf(b, steps).done - progressOf(a, steps).done || a.bauherrLabel.localeCompare(b.bauherrLabel, "de"));
    case "eingang":
    default:
      return list.sort((a, b) => (b.intakeMonth ?? "").localeCompare(a.intakeMonth ?? "") || compareAbm(b.abmNr, a.abmNr));
  }
}

/** Nächste offene Aufgabe eines Projekts (früheste Fälligkeit zuerst, ohne Fälligkeit zuletzt). */
export function nextTaskFor(projectId: string, tasks: Task[]): Task | null {
  return (
    tasks
      .filter((t) => t.projectId === projectId && t.status === "offen")
      .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"))[0] ?? null
  );
}

export function teamCode(id: string | null, team: TeamMember[]): string {
  const m = team.find((t) => t.id === id);
  return m ? (m.code ?? m.name) : "–";
}

/** Filter <-> URL-Suchparameter (damit Filter beim Tab-Wechsel bleiben und teilbar sind). */
export function filtersFromParams(sp: URLSearchParams): ProjectFilters {
  const sort = sp.get("sort");
  return {
    q: sp.get("q") ?? "",
    company: sp.get("firma") ?? "",
    architect: sp.get("architekt") ?? "",
    phase: sp.get("phase") ?? "",
    sort: sort === "abm" || sort === "bauherr" || sort === "fortschritt" ? sort : "eingang",
    storno: sp.get("storno") === "1",
    group: sp.get("gruppe") === "monat",
  };
}

export function filtersToParams(f: ProjectFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.company) sp.set("firma", f.company);
  if (f.architect) sp.set("architekt", f.architect);
  if (f.phase) sp.set("phase", f.phase);
  if (f.sort !== "eingang") sp.set("sort", f.sort);
  if (f.storno) sp.set("storno", "1");
  if (f.group) sp.set("gruppe", "monat");
  return sp;
}
