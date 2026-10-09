// Kennzahlen des Agent-Dashboards. Reine Funktionen.

import { addDays, formatMonthShort } from "../lib/format";
import type { Dataset, InboxAttachment } from "../lib/types";

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Automatisch abgelegt = Sicherheit ab Auto-Schwelle und (noch) abgelegt oder später als falsch gemeldet. */
export function isAutoFiled(a: InboxAttachment, autoThreshold: number): boolean {
  return (a.confidence ?? 0) >= autoThreshold && (a.status === "abgelegt" || a.corrected);
}

export interface AgentStats {
  todayProcessed: number;
  todayAuto: number;
  openReview: number;
  openErrors: number;
  /** Anteil automatisch abgelegter Anhänge (7 Tage) ohne spätere Korrektur, 0–1; null ohne Daten */
  hitRate: number | null;
  autoCount7: number;
  perDay: { date: string; label: string; title: string; auto: number; review: number }[];
}

export function agentStats(db: Dataset, today: string): AgentStats {
  const t = db.agentSettings.autoFileThreshold;
  const itemDate = new Map(db.inboxItems.map((i) => [i.id, i.receivedAt.slice(0, 10)]));
  const from7 = addDays(today, -6);
  const atts = db.inboxAttachments.map((a) => ({ a, date: itemDate.get(a.itemId) ?? "" }));
  const in7 = atts.filter((x) => x.date >= from7 && x.date <= today);
  const auto7 = in7.filter((x) => isAutoFiled(x.a, t));
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const day = in7.filter((x) => x.date === date);
    const [y, m, d] = date.split("-").map(Number);
    const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return {
      date,
      label: dow,
      title: `${dow}, ${d}. ${formatMonthShort(date)}`,
      auto: day.filter((x) => isAutoFiled(x.a, t)).length,
      review: day.filter((x) => !isAutoFiled(x.a, t) && (x.a.status === "pruefen" || x.a.status === "abgelegt")).length,
    };
  });
  return {
    todayProcessed: db.inboxItems.filter((i) => i.receivedAt.slice(0, 10) === today).length,
    todayAuto: atts.filter((x) => x.date === today && isAutoFiled(x.a, t)).length,
    openReview: db.inboxAttachments.filter((a) => a.status === "pruefen").length,
    openErrors: db.inboxAttachments.filter((a) => a.status === "fehler").length,
    hitRate: auto7.length ? auto7.filter((x) => !x.a.corrected).length / auto7.length : null,
    autoCount7: auto7.length,
    perDay,
  };
}
