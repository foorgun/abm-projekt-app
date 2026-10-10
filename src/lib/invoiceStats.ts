// Kennzahlen und Diagrammdaten der Rechnungsseite. Reine Funktionen.
//
// Begriffe: "nicht versendet" = fällig und noch nicht versendet (es gibt dazu eine Warnung).
// Geplante Rechnungen, deren Auslöser noch nicht erreicht ist, zählen nicht dazu.

import { trendPercent } from "../components/charts/scale";
import type { Alert } from "./alerts";
import { addDays, daysBetween, formatMonth, formatMonthShort } from "./format";
import type { Invoice } from "./types";

export type AgeBucket = "0-7" | "8-30" | "30+";
export const AGE_BUCKETS: { key: AgeBucket; label: string }[] = [
  { key: "0-7", label: "0–7 Tage" },
  { key: "8-30", label: "8–30 Tage" },
  { key: "30+", label: "über 30 Tage" },
];

export function ageBucketOf(days: number): AgeBucket {
  return days <= 7 ? "0-7" : days <= 30 ? "8-30" : "30+";
}

/** Fällige, nicht versendete Rechnungen mit ihrem Alter in Tagen (aus den Warnungen). */
export function unsentAges(alerts: Alert[]): Map<string, number> {
  return new Map(alerts.filter((a) => a.kind === "invoice_unsent" && a.invoiceId).map((a) => [a.invoiceId!, a.days]));
}

export interface InvoiceKpis {
  unsentCents: number;
  unsentCount: number;
  sentOpenCents: number;
  sentOpenCount: number;
  paid30Cents: number;
  paid30Count: number;
  /** Durchschnitt Tage von Fälligkeit bis Versand (letzte 12 Monate); früher Versand zählt als 0. null ohne Daten. */
  avgDelayDays: number | null;
  delayCount: number;
}

export function invoiceKpis(invoices: Invoice[], alerts: Alert[], today: string): InvoiceKpis {
  const ages = unsentAges(alerts);
  const unsent = invoices.filter((i) => ages.has(i.id));
  const sentOpen = invoices.filter((i) => i.status === "versendet");
  const from30 = addDays(today, -30);
  const paid30 = invoices.filter((i) => i.paidOn && i.paidOn > from30 && i.paidOn <= today);
  const from365 = addDays(today, -365);
  const delays = invoices.filter((i) => i.sentOn && i.dueOn && i.sentOn > from365).map((i) => Math.max(0, daysBetween(i.dueOn!, i.sentOn!)));
  const sum = (list: Invoice[]) => list.reduce((s, i) => s + i.amountCents, 0);
  return {
    unsentCents: sum(unsent),
    unsentCount: unsent.length,
    sentOpenCents: sum(sentOpen),
    sentOpenCount: sentOpen.length,
    paid30Cents: sum(paid30),
    paid30Count: paid30.length,
    avgDelayDays: delays.length ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null,
    delayCount: delays.length,
  };
}

export interface MonthVolume {
  month: string;
  label: string;
  title: string;
  /** Euro, nach Versandmonat */
  sent: number;
  /** Euro, nach Zahlungsmonat */
  paid: number;
}

export function monthlyVolume(invoices: Invoice[], today: string, months = 12): MonthVolume[] {
  const [y, m] = today.split("-").map(Number);
  const out: MonthVolume[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 10);
    out.push({ month, label: formatMonthShort(month), title: formatMonth(month), sent: 0, paid: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.month.slice(0, 7), i]));
  for (const inv of invoices) {
    const s = inv.sentOn ? idx.get(inv.sentOn.slice(0, 7)) : undefined;
    if (s !== undefined) out[s].sent += inv.amountCents / 100;
    const p = inv.paidOn ? idx.get(inv.paidOn.slice(0, 7)) : undefined;
    if (p !== undefined) out[p].paid += inv.amountCents / 100;
  }
  return out;
}

/**
 * Trend des letzten vollständigen Monats gegenüber dem Monat davor.
 * Der laufende Monat ist unvollständig und würde fast immer einen Einbruch zeigen.
 */
export function volumeTrend(volume: MonthVolume[]): { percent: number | null; against: string; month: string } {
  const last = volume[volume.length - 2];
  const prev = volume[volume.length - 3];
  return { percent: trendPercent(prev?.sent, last?.sent), month: last?.title.split(" ")[0] ?? "", against: prev?.title.split(" ")[0] ?? "Vormonat" };
}

export function agingBuckets(invoices: Invoice[], alerts: Alert[]): { key: AgeBucket; label: string; count: number; euros: number }[] {
  const ages = unsentAges(alerts);
  return AGE_BUCKETS.map((b) => {
    const list = invoices.filter((i) => ages.has(i.id) && ageBucketOf(ages.get(i.id)!) === b.key);
    return { ...b, count: list.length, euros: list.reduce((s, i) => s + i.amountCents, 0) / 100 };
  });
}
