// Filter und Gruppen der Aufgaben-Seite. Reine Funktionen.

import { addDays } from "./format";
import type { Task } from "./types";

export type TaskFilter = "heute" | "woche" | "ueberfaellig" | "alle" | "erledigt";
export type TaskBucket = "ueberfaellig" | "heute" | "woche" | "spaeter" | "ohne";

export const BUCKET_LABEL: Record<TaskBucket, string> = {
  ueberfaellig: "Überfällig",
  heute: "Heute",
  woche: "Diese Woche",
  spaeter: "Später",
  ohne: "Ohne Termin",
};

/** Letzter Tag der laufenden Woche (Sonntag), ISO. */
export function endOfWeek(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sonntag
  return addDays(today, dow === 0 ? 0 : 7 - dow);
}

export function bucketOf(t: Task, today: string): TaskBucket {
  if (!t.dueOn) return "ohne";
  if (t.dueOn < today) return "ueberfaellig";
  if (t.dueOn === today) return "heute";
  if (t.dueOn <= endOfWeek(today)) return "woche";
  return "spaeter";
}

export function matchesFilter(t: Task, f: TaskFilter, today: string): boolean {
  if (f === "erledigt") return t.status === "erledigt";
  if (t.status !== "offen") return false;
  const b = bucketOf(t, today);
  if (f === "heute") return b === "heute";
  if (f === "ueberfaellig") return b === "ueberfaellig";
  // "Diese Woche" umfasst heute und die restlichen Tage bis Sonntag
  if (f === "woche") return b === "heute" || b === "woche";
  return true;
}

export function sortTasks(list: Task[], f: TaskFilter): Task[] {
  return [...list].sort((a, b) =>
    f === "erledigt" ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.title.localeCompare(b.title, "de"),
  );
}
