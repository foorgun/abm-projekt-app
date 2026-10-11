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
 * Ohne erledigten Schritt die erste Stufe, mit allen Schritten erledigt die letzte.
 */
export function stageOf(project: Project, steps: StepDefinition[]): Stage {
  const stages = allStages(steps);
  const upcoming = steps[phaseOf(project, steps).index + 1];
  return upcoming ? stages.find((s) => s.name === upcoming.stage)! : stages[stages.length - 1];
}

/**
 * Ziel beim Verschieben in die nächste Stufe: erster offener Schritt der nächsten Stufe.
 * `skipped` nennt offene Schritte davor, die danach als "fehlt" erscheinen.
 */
export function stageMoveTarget(project: Project, steps: StepDefinition[]): { stage: Stage; step: StepDefinition; skipped: StepDefinition[] } | null {
  const stages = allStages(steps);
  const current = stageOf(project, steps);
  const next = stages[current.index + 1];
  if (!next) return null;
  const step = next.steps.find((s) => !project.steps[s.key]);
  if (!step) return null;
  const idx = steps.indexOf(step);
  const skipped = steps.slice(0, idx).filter((s) => !project.steps[s.key]);
  return { stage: next, step, skipped };
}

export function projectTitle(p: Pick<Project, "abmNr" | "bauherrLabel">): string {
  // Ohne ABM-Nr. (beim Anlegen oft noch unbekannt) steht nur der Name; "Bauvoranfrage" nur, wenn es wirklich eine ist
  if (p.abmNr === "Bauvoranfrage") return `${p.bauherrLabel} (Bauvoranfrage)`;
  return p.abmNr ? `${p.abmNr} · ${p.bauherrLabel}` : p.bauherrLabel;
}
