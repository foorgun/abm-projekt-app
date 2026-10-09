// Kennzahlen und Diagrammdaten fürs Dashboard. Reine Funktionen, getestet in dashboard.test.ts.

import { formatMonth, formatMonthShort } from "./format";
import { allPhases, phaseOf } from "./projects";
import type { StepDefinition } from "./steps";
import type { Project } from "./types";

export interface MonthCount {
  month: string; // YYYY-MM-01
  label: string; // "Okt"
  title: string; // "Oktober 2026"
  count: number;
}

/** Neue Projekte je Eingangsmonat der letzten `months` Monate (inkl. aktuellem). Storno zählt mit: es war ein Eingang. */
export function newProjectsPerMonth(projects: Project[], today: string, months = 12): MonthCount[] {
  const [y, m] = today.split("-").map(Number);
  const out: MonthCount[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const month = d.toISOString().slice(0, 10);
    out.push({ month, label: formatMonthShort(month), title: formatMonth(month), count: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.month, i]));
  for (const p of projects) {
    const i = p.intakeMonth ? idx.get(p.intakeMonth) : undefined;
    if (i !== undefined) out[i].count++;
  }
  return out;
}

/** Aktive Projekte je Phase, in Prozessreihenfolge; Phasen ohne Projekt entfallen. */
export function projectsByPhase(projects: Project[], steps: StepDefinition[]): { key: string; label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    if (p.status !== "aktiv") continue;
    const k = phaseOf(p, steps).key;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return allPhases(steps)
    .map((ph) => ({ key: ph.key, label: ph.label, value: counts.get(ph.key) ?? 0 }))
    .filter((x) => x.value > 0);
}
