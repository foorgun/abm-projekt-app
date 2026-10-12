// Kennzahlen und Diagrammdaten fürs Dashboard. Reine Funktionen, getestet in dashboard.test.ts.

import type { Alert } from "./alerts";
import { formatMonth, formatMonthShort } from "./format";
import { allPhases, phaseOf } from "./projects";
import type { StepDefinition } from "./steps";
import { alertTaskKey } from "./taskSync";
import type { InboxAttachment, Project, Task } from "./types";

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
// "Heute zu tun": Aufgaben, Warnungen und Prüfungen des Agenten in einer Liste
// ---------------------------------------------------------------------------

export type TodoGroupKey = "ueberfaellig" | "heute" | "rechnungen" | "fristen" | "pruefung";

export type TodoItem =
  | { type: "task"; id: string; task: Task }
  | { type: "alert"; id: string; alert: Alert }
  | { type: "review"; id: string; attachment: InboxAttachment };

export interface TodoGroup {
  key: TodoGroupKey;
  label: string;
  items: TodoItem[];
}

/** Zeilen je Gruppe, bevor "Alle anzeigen" nötig wird. */
export const TODO_GROUP_LIMIT = 3;

const TODO_LABEL: Record<TodoGroupKey, string> = {
  ueberfaellig: "Überfällig",
  heute: "Heute fällig",
  rechnungen: "Rechnungen versenden",
  fristen: "Verträge und Genehmigungen",
  pruefung: "Zur Prüfung",
};

/**
 * Gruppen für "Heute zu tun" in fester Reihenfolge, leere Gruppen entfallen (höchstens fünf).
 * `alerts` sind die sichtbaren Warnungen. Eine Aufgabe, die aus einer sichtbaren Warnung entstanden ist,
 * erscheint nicht noch einmal: die Warnung steht für beide und trägt die Direktaktion.
 */
export function todayGroups(input: { tasks: Task[]; alerts: Alert[]; attachments: InboxAttachment[]; today: string }): TodoGroup[] {
  const { tasks, alerts, attachments, today } = input;
  const covered = new Set(alerts.map(alertTaskKey));
  const open = tasks
    .filter((t) => t.status === "offen" && t.dueOn && t.dueOn <= today && !(t.sourceKey && covered.has(t.sourceKey)))
    .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!) || a.title.localeCompare(b.title, "de"));
  const task = (t: Task): TodoItem => ({ type: "task", id: `task:${t.id}`, task: t });
  const alert = (a: Alert): TodoItem => ({ type: "alert", id: a.id, alert: a });

  const groups: Record<TodoGroupKey, TodoItem[]> = {
    ueberfaellig: open.filter((t) => t.dueOn! < today).map(task),
    heute: open.filter((t) => t.dueOn === today).map(task),
    rechnungen: alerts.filter((a) => a.kind === "invoice_unsent").map(alert),
    fristen: alerts.filter((a) => a.kind !== "invoice_unsent").map(alert),
    pruefung: attachments.filter((a) => a.status === "pruefen").map((a) => ({ type: "review", id: `review:${a.id}`, attachment: a })),
  };
  return (Object.keys(TODO_LABEL) as TodoGroupKey[]).map((key) => ({ key, label: TODO_LABEL[key], items: groups[key] })).filter((g) => g.items.length > 0);
}
