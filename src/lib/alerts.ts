import { daysBetween, formatMoney } from "./format";
import { stepLabel } from "./steps";
import type { Snapshot } from "./types";

/**
 * Schwellenwerte für die Warnungen. Das sind Annahmen für den Prototyp und müssen
 * mit dem Büro abgestimmt werden (siehe docs/offene-fragen.md).
 */
export const ALERT_RULES = {
  /** Tage nach Fälligkeit, ab denen eine nicht versendete Rechnung "dringend" ist. */
  invoiceGraceDays: 7,
  /** Vertrag versendet, aber nicht zurück: Hinweis ab ... */
  contractReturnDays: 21,
  /** ... dringend ab */
  contractReturnUrgentDays: 42,
  /** Baugesuch übergeben, Genehmigung fehlt: Info ab ... */
  permitWaitDays: 120,
} as const;

export type AlertKind = "invoice_unsent" | "contract_open" | "permit_waiting";
export type Severity = "dringend" | "hinweis" | "info";

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  projectId: string;
  invoiceId?: string;
  title: string;
  detail: string;
  days: number;
}

const RANK: Record<Severity, number> = { dringend: 0, hinweis: 1, info: 2 };

export function computeAlerts(snapshot: Snapshot, today: string): Alert[] {
  const projects = new Map(snapshot.projects.map((p) => [p.id, p]));
  const alerts: Alert[] = [];

  // 1) Rechnungen, die fällig sind, aber nicht versendet wurden
  for (const inv of snapshot.invoices) {
    if (inv.status !== "geplant" && inv.status !== "faellig") continue;
    const project = projects.get(inv.projectId);
    if (!project || project.status !== "aktiv") continue;

    const triggerDate = inv.triggerStep ? project.steps[inv.triggerStep] ?? null : null;
    let reference: string | null;
    if (inv.status === "faellig") {
      reference = inv.dueOn ?? triggerDate ?? today;
    } else {
      if (!triggerDate) continue; // geplant und Auslöser noch nicht erreicht: noch nichts zu tun
      reference = inv.dueOn ?? triggerDate;
    }
    const days = daysBetween(reference, today);
    if (days < 0) continue; // noch nicht fällig

    const since = inv.dueOn || inv.status === "faellig" ? "seit Fälligkeit" : `seit ${stepLabel(inv.triggerStep!)}`;
    alerts.push({
      id: `invoice_unsent:${inv.id}`,
      kind: "invoice_unsent",
      severity: days > ALERT_RULES.invoiceGraceDays ? "dringend" : "hinweis",
      projectId: project.id,
      invoiceId: inv.id,
      title: `Rechnung nicht versendet: ${inv.label}`,
      detail: `${formatMoney(inv.amountCents)} · ${days} ${days === 1 ? "Tag" : "Tage"} ${since}`,
      days,
    });
  }

  for (const p of snapshot.projects) {
    if (p.status !== "aktiv") continue;

    // 2) Vertrag verschickt, keine Antwort
    const sent = p.steps.vertrag_versendet;
    if (sent && !p.steps.vertrag_zurueck) {
      const days = daysBetween(sent, today);
      if (days >= ALERT_RULES.contractReturnDays) {
        alerts.push({
          id: `contract_open:${p.id}`,
          kind: "contract_open",
          severity: days >= ALERT_RULES.contractReturnUrgentDays ? "dringend" : "hinweis",
          projectId: p.id,
          title: "Vertrag noch nicht zurück",
          detail: `${days} Tage seit Versand`,
          days,
        });
      }
    }

    // 3) Baugesuch übergeben, Genehmigung steht aus
    const handedOver = p.steps.baugesuch_uebergabe;
    if (handedOver && !p.steps.baugenehmigung) {
      const days = daysBetween(handedOver, today);
      if (days >= ALERT_RULES.permitWaitDays) {
        alerts.push({
          id: `permit_waiting:${p.id}`,
          kind: "permit_waiting",
          severity: "info",
          projectId: p.id,
          title: "Baugenehmigung steht aus",
          detail: `${days} Tage seit Übergabe des Baugesuchs`,
          days,
        });
      }
    }
  }

  return alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.days - a.days);
}

/** Summe der Rechnungen, die zum Versand anstehen (fällig, nicht versendet). */
export function unsentInvoiceTotal(alerts: Alert[], snapshot: Snapshot): number {
  const ids = new Set(alerts.filter((a) => a.kind === "invoice_unsent").map((a) => a.invoiceId));
  return snapshot.invoices.filter((i) => ids.has(i.id)).reduce((sum, i) => sum + i.amountCents, 0);
}
