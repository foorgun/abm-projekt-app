// Phasen und Fortschritt. Liest ausschließlich die Schrittdefinitionen aus den Daten (keine feste Liste).

import type { StepDefinition } from "./steps";
import type { Project } from "./types";

export const INTAKE_PHASE = { key: "eingang", label: "Eingang" } as const;

export interface Phase {
  key: string;
  label: string;
  /** Index in den Schrittdefinitionen, -1 für "Eingang". */
  index: number;
}

/** Phase = letzter erledigter Schritt in Reihenfolge; ohne erledigten Schritt "Eingang". */
export function phaseOf(project: Project, steps: StepDefinition[]): Phase {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (project.steps[steps[i].key]) return { key: steps[i].key, label: steps[i].label, index: i };
  }
  return { ...INTAKE_PHASE, index: -1 };
}

/** Alle Phasen in Board-Reihenfolge: Eingang, dann jeder Schritt. */
export function allPhases(steps: StepDefinition[]): Phase[] {
  return [{ ...INTAKE_PHASE, index: -1 }, ...steps.map((s, i) => ({ key: s.key, label: s.label, index: i }))];
}

export function progressOf(project: Project, steps: StepDefinition[]): { done: number; total: number } {
  return { done: steps.filter((s) => project.steps[s.key]).length, total: steps.length };
}

/** Erster offener Schritt (auch wenn spätere schon erledigt sind). */
export function nextStep(project: Project, steps: StepDefinition[]): StepDefinition | null {
  return steps.find((s) => !project.steps[s.key]) ?? null;
}

/** Offene Schritte vor dem letzten erledigten ("fehlt noch"). */
export function missingSteps(project: Project, steps: StepDefinition[]): StepDefinition[] {
  const last = phaseOf(project, steps).index;
  return steps.slice(0, Math.max(0, last)).filter((s) => !project.steps[s.key]);
}

export function projectTitle(p: Project): string {
  return p.abmNr && p.abmNr !== "Bauvoranfrage" ? `${p.abmNr} · ${p.bauherrLabel}` : `${p.bauherrLabel} (Bauvoranfrage)`;
}
