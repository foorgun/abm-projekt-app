// Kennzahlen und Diagrammdaten fürs Dashboard. Reine Funktionen, getestet in dashboard.test.ts.

import type { Alert } from "./alerts";
import { daysBetween, formatMonth, formatMonthShort } from "./format";
import { allPhases, phaseOf } from "./projects";
import type { StepDefinition } from "./steps";
import { alertTaskKey } from "./taskSync";
import type { Project, Task } from "./types";

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

// ---------------------------------------------------------------------------
// "Heute zu tun": Aufgaben und Warnungen in einer Liste, nach Dringlichkeit
// ---------------------------------------------------------------------------

export type TodoGroupKey = "ueberfaellig" | "heute" | "hinweise";

export type TodoItem = { type: "task"; id: string; task: Task } | { type: "alert"; id: string; alert: Alert };

export interface TodoGroup {
  key: TodoGroupKey;
  label: string;
  items: TodoItem[];
}

/** Zeilen insgesamt, bevor "Alle anzeigen" nötig wird. */
export const TODO_LIMIT = 5;

const TODO_LABEL: Record<TodoGroupKey, string> = { ueberfaellig: "Überfällig", heute: "Heute fällig", hinweise: "Hinweise" };

/**
 * Gruppen für "Heute zu tun", dringendste zuerst; leere Gruppen entfallen.
 *  * Überfällig: überfällige Aufgaben und dringende Warnungen, am längsten überfällig zuerst
 *  * Heute fällig: Aufgaben mit Fälligkeit heute
 *  * Hinweise: übrige Warnungen (Hinweis, Info)
 * `alerts` sind die sichtbaren Warnungen. Eine Aufgabe, die aus einer sichtbaren Warnung entstanden ist,
 * erscheint nicht noch einmal: die Warnung steht für beide und trägt die Direktaktion.
 */
export function todayGroups(input: { tasks: Task[]; alerts: Alert[]; today: string }): TodoGroup[] {
  const { tasks, alerts, today } = input;
  const covered = new Set(alerts.map(alertTaskKey));
  const open = tasks.filter((t) => t.status === "offen" && t.dueOn && t.dueOn <= today && !(t.sourceKey && covered.has(t.sourceKey)));
  const task = (t: Task): TodoItem => ({ type: "task", id: `task:${t.id}`, task: t });
  const alert = (a: Alert): TodoItem => ({ type: "alert", id: a.id, alert: a });
  const age = (it: TodoItem) => (it.type === "alert" ? it.alert.days : daysBetween(it.task.dueOn!, today));
  const title = (it: TodoItem) => (it.type === "alert" ? it.alert.title : it.task.title);

  const groups: Record<TodoGroupKey, TodoItem[]> = {
    ueberfaellig: [...open.filter((t) => t.dueOn! < today).map(task), ...alerts.filter((a) => a.severity === "dringend").map(alert)].sort(
      (a, b) => age(b) - age(a) || title(a).localeCompare(title(b), "de"),
    ),
    heute: open.filter((t) => t.dueOn === today).sort((a, b) => a.title.localeCompare(b.title, "de")).map(task),
    hinweise: alerts.filter((a) => a.severity !== "dringend").map(alert),
  };
  return (Object.keys(TODO_LABEL) as TodoGroupKey[]).map((key) => ({ key, label: TODO_LABEL[key], items: groups[key] })).filter((g) => g.items.length > 0);
}

/** Kürzt die Gruppen auf insgesamt `limit` Zeilen (von oben); Gruppen ohne Zeile entfallen. */
export function limitGroups(groups: TodoGroup[], limit: number): TodoGroup[] {
  let left = limit;
  return groups
    .map((g) => {
      const items = g.items.slice(0, Math.max(0, left));
      left -= items.length;
      return { ...g, items };
    })
    .filter((g) => g.items.length > 0);
}
