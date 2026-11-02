// Phasen und Fortschritt. Liest ausschließlich die Schrittdefinitionen aus den Daten (keine feste Liste).

import { BAUBEGLEITUNG_STAGE, type StepDefinition } from "./steps";
import type { Project } from "./types";

export const INTAKE_PHASE = { key: "eingang", label: "Eingang" } as const;

export interface Phase {
  key: string;
  label: string;
  /** Index in den Schrittdefinitionen, -1 für "Eingang". */
  index: number;
}

/**
 * Schritte, die ein Projekt durchläuft: ohne Baubegleitung ohne deren Stufe. Bereits erfasste Termine bleiben gespeichert,
 * zählen aber nicht, solange die Baubegleitung abgewählt ist.
 */
export function stepsFor(project: Pick<Project, "baubegleitung">, steps: StepDefinition[]): StepDefinition[] {
  return project.baubegleitung === false ? steps.filter((s) => s.stage !== BAUBEGLEITUNG_STAGE) : steps;
}

/** Phase = letzter erledigter Schritt in Reihenfolge; ohne erledigten Schritt "Eingang". */
export function phaseOf(project: Project, steps: StepDefinition[]): Phase {
  const own = stepsFor(project, steps);
  for (let i = own.length - 1; i >= 0; i--) {
    if (project.steps[own[i].key]) return { key: own[i].key, label: own[i].label, index: i };
  }
  return { ...INTAKE_PHASE, index: -1 };
}

/** Alle Phasen in Board-Reihenfolge: Eingang, dann jeder Schritt. */
export function allPhases(steps: StepDefinition[]): Phase[] {
  return [{ ...INTAKE_PHASE, index: -1 }, ...steps.map((s, i) => ({ key: s.key, label: s.label, index: i }))];
}

export function progressOf(project: Project, steps: StepDefinition[]): { done: number; total: number } {
  const own = stepsFor(project, steps);
  return { done: own.filter((s) => project.steps[s.key]).length, total: own.length };
}

/** Erster offener Schritt (auch wenn spätere schon erledigt sind). */
export function nextStep(project: Project, steps: StepDefinition[]): StepDefinition | null {
  return stepsFor(project, steps).find((s) => !project.steps[s.key]) ?? null;
}

/** Offene Schritte vor dem letzten erledigten ("fehlt noch"). */
export function missingSteps(project: Project, steps: StepDefinition[]): StepDefinition[] {
  const last = phaseOf(project, steps).index;
  return stepsFor(project, steps).slice(0, Math.max(0, last)).filter((s) => !project.steps[s.key]);
}

// ---------------------------------------------------------------------------
// Stufen (Pipeline): fassen mehrere Schritte zusammen (step_definitions.stage)
// ---------------------------------------------------------------------------

export interface Stage {
  name: string;
  index: number;
  steps: StepDefinition[];
}

/** Stufen in Reihenfolge ihres ersten Schritts. */
export function allStages(steps: StepDefinition[]): Stage[] {
  const out: Stage[] = [];
  for (const s of steps) {
    let st = out.find((x) => x.name === s.stage);
    if (!st) {
      st = { name: s.stage, index: out.length, steps: [] };
      out.push(st);
    }
    st.steps.push(s);
  }
  return out;
}

/**
 * Stufe eines Projekts = Stufe des Schritts, der nach der aktuellen Phase ansteht (dort wird gerade gearbeitet).
 * Ohne erledigten Schritt die erste Stufe, mit allen Schritten erledigt die letzte des Projekts.
 */
export function stageOf(project: Project, steps: StepDefinition[]): Stage {
  const own = stepsFor(project, steps);
  const stages = allStages(own);
  const upcoming = own[phaseOf(project, own).index + 1];
  return upcoming ? stages.find((s) => s.name === upcoming.stage)! : stages[stages.length - 1];
}

/**
 * Ziel beim Verschieben in die nächste Stufe: erster offener Schritt der nächsten Stufe.
 * `skipped` nennt offene Schritte davor, die danach als "fehlt" erscheinen.
 */
export function stageMoveTarget(project: Project, steps: StepDefinition[]): { stage: Stage; step: StepDefinition; skipped: StepDefinition[] } | null {
  const own = stepsFor(project, steps);
  const stages = allStages(own);
  const current = stageOf(project, own);
  const next = stages[current.index + 1];
  if (!next) return null;
  const step = next.steps.find((s) => !project.steps[s.key]);
  if (!step) return null;
  const idx = own.indexOf(step);
  const skipped = own.slice(0, idx).filter((s) => !project.steps[s.key]);
  return { stage: next, step, skipped };
}

/** Anzeige "Baubegleitung": Ja/Nein, bei ja mit den Leistungen aus der Excel-Spalte (projects.baubetreuung), z. B. "Ja · 3.1+3.2". */
export function baubegleitungText(p: Pick<Project, "baubegleitung" | "baubetreuung">): string {
  if (p.baubegleitung === false) return "Nein";
  return p.baubetreuung ? `Ja · ${p.baubetreuung}` : "Ja";
}

export function projectTitle(p: Pick<Project, "abmNr" | "bauherrLabel">): string {
  // Ohne ABM-Nr. (beim Anlegen oft noch unbekannt) steht nur der Name; "Bauvoranfrage" nur, wenn es wirklich eine ist
  if (p.abmNr === "Bauvoranfrage") return `${p.bauherrLabel} (Bauvoranfrage)`;
  return p.abmNr ? `${p.abmNr} · ${p.bauherrLabel}` : p.bauherrLabel;
}
