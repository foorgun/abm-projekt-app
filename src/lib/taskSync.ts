// Aufgaben aus Warnungen: genau eine Aufgabe je Warnung (dedupliziert über source_key).
//
// Regeln (siehe docs/entscheidungen.md, Schritt 6):
//  * Schlüssel = Warnungs-ID + Dringlichkeit. Verschärft sich eine Warnung (Hinweis → Dringend), entsteht eine neue Aufgabe.
//  * Eine erledigte Aufgabe blendet ihre Warnung aus (Handlungsbedarf, Glocke, Banner, Warn-Icons).
//  * Ist die Ursache behoben (Warnung verschwindet), wird die offene Aufgabe automatisch erledigt.
// Im Supabase-Modus läuft dieselbe Logik serverseitig (geplant: Datenbankfunktion/Cron), hier im Demo-Modus nach dem Laden.

import { addDays } from "./format";
import type { Alert } from "./alerts";
import type { NewTask } from "./repo";
import type { Project, Task } from "./types";

export function alertTaskKey(a: Alert): string {
  return `${a.id}:${a.severity}`;
}

const DUE_IN: Record<Alert["severity"], number> = { dringend: 0, hinweis: 3, info: 7 };

function titleFor(a: Alert): string {
  switch (a.kind) {
    case "invoice_unsent":
      return `${a.title.replace("Rechnung nicht versendet: ", "Rechnung versenden: ")}`;
    case "contract_open":
      return "Vertrag bei der Bauherrschaft nachfassen";
    case "permit_waiting":
      return "Beim Amt den Stand der Genehmigung erfragen";
  }
}

export interface TaskSyncPlan {
  create: NewTask[];
  /** Offene Warnungsaufgaben, deren Ursache behoben ist */
  close: string[];
}

export function planAlertTaskSync(alerts: Alert[], tasks: Task[], projects: Project[], today: string): TaskSyncPlan {
  const byKey = new Map(tasks.filter((t) => t.sourceKey).map((t) => [t.sourceKey!, t]));
  const current = new Set(alerts.map(alertTaskKey));
  const create: NewTask[] = [];
  for (const a of alerts) {
    const key = alertTaskKey(a);
    if (byKey.has(key)) continue;
    const p = projects.find((x) => x.id === a.projectId);
    create.push({
      title: titleFor(a),
      projectId: a.projectId,
      dueOn: addDays(today, DUE_IN[a.severity]),
      assigneeId: p?.architectId ?? null,
      source: "warnung",
      sourceKey: key,
    });
  }
  const close = tasks.filter((t) => t.source === "warnung" && t.status === "offen" && t.sourceKey && !current.has(t.sourceKey)).map((t) => t.id);
  return { create, close };
}

/** Warnungen, deren Aufgabe erledigt ist, werden ausgeblendet. */
export function visibleAlerts(alerts: Alert[], tasks: Task[]): Alert[] {
  const done = new Set(tasks.filter((t) => t.status === "erledigt" && t.sourceKey).map((t) => t.sourceKey!));
  return alerts.filter((a) => !done.has(alertTaskKey(a)));
}
