import { describe, expect, it } from "vitest";
import { computeAlerts, unsentInvoiceTotal } from "./alerts";
import type { Invoice, Project, Snapshot } from "./types";

const TODAY = "2026-10-09";

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1", abmNr: "8161-1", kind: "neubau", status: "aktiv", companyId: null, salespersonId: null,
    bauherrLabel: "Test", location: null, architectId: null, planerId: null, baubetreuung: null,
    intakeMonth: null, notes: null, steps: {}, ...over,
  };
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1", projectId: "p1", label: "Abschlag", amountCents: 1_000_000, triggerStep: "baugenehmigung",
    status: "faellig", dueOn: "2026-08-28", sentOn: null, paidOn: null, ...over,
  };
}

function snap(projects: Project[], invoices: Invoice[] = []): Snapshot {
  return { companies: [], salespeople: [], team: [], projects, invoices };
}

describe("Rechnungen", () => {
  it("warnt dringend bei fälliger, nicht versendeter Rechnung (der 10.000-€-Fall)", () => {
    const alerts = computeAlerts(snap([project()], [invoice()]), TODAY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "invoice_unsent", severity: "dringend", days: 42 });
    expect(alerts[0].detail).toContain("10.000");
  });

  it("warnt nicht, wenn die Rechnung versendet oder bezahlt ist", () => {
    const sent = invoice({ status: "versendet", sentOn: "2026-09-01" });
    const paid = invoice({ id: "i2", status: "bezahlt", sentOn: "2026-09-01", paidOn: "2026-09-10" });
    expect(computeAlerts(snap([project()], [sent, paid]), TODAY)).toHaveLength(0);
  });

  it("warnt bei geplanter Rechnung erst, wenn der Auslöser erreicht ist", () => {
    const planned = invoice({ status: "geplant", dueOn: null });
    expect(computeAlerts(snap([project()], [planned]), TODAY)).toHaveLength(0);

    const reached = project({ steps: { baugenehmigung: "2026-10-06" } });
    const alerts = computeAlerts(snap([reached], [planned]), TODAY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "hinweis", days: 3 });
    expect(alerts[0].detail).toContain("seit Genehmigung");
  });

  it("warnt nicht vor dem Fälligkeitsdatum", () => {
    const future = invoice({ dueOn: "2026-11-01" });
    expect(computeAlerts(snap([project()], [future]), TODAY)).toHaveLength(0);
  });

  it("ignoriert stornierte Projekte", () => {
    expect(computeAlerts(snap([project({ status: "storno" })], [invoice()]), TODAY)).toHaveLength(0);
  });

  it("summiert die ausstehenden Beträge", () => {
    const inv = [invoice(), invoice({ id: "i2", amountCents: 250_000 })];
    const s = snap([project()], inv);
    expect(unsentInvoiceTotal(computeAlerts(s, TODAY), s)).toBe(1_250_000);
  });
});

describe("Verträge und Genehmigungen", () => {
  it("meldet Vertrag ohne Rücklauf nach 21 Tagen als Hinweis, nach 42 als dringend", () => {
    const at25 = project({ steps: { vertrag_versendet: "2026-09-14" } });
    const at50 = project({ id: "p2", steps: { vertrag_versendet: "2026-08-20" } });
    const at10 = project({ id: "p3", steps: { vertrag_versendet: "2026-09-29" } });
    const alerts = computeAlerts(snap([at25, at50, at10]), TODAY);
    expect(alerts.map((a) => [a.projectId, a.severity])).toEqual([["p2", "dringend"], ["p1", "hinweis"]]);
  });

  it("meldet keinen Vertrag, der zurück ist", () => {
    const p = project({ steps: { vertrag_versendet: "2026-07-01", vertrag_zurueck: "2026-07-10" } });
    expect(computeAlerts(snap([p]), TODAY)).toHaveLength(0);
  });

  it("meldet lange Genehmigungswartezeit nur als Info", () => {
    const p = project({ steps: { baugesuch_uebergabe: "2026-04-01" } });
    const alerts = computeAlerts(snap([p]), TODAY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "permit_waiting", severity: "info" });
  });
});

describe("Sortierung", () => {
  it("sortiert nach Dringlichkeit, dann nach Alter", () => {
    const a = project({ id: "a", steps: { vertrag_versendet: "2026-09-10" } }); // 29 Tage: Hinweis
    const b = project({ id: "b", steps: { baugesuch_uebergabe: "2026-01-01" } }); // Info
    const c = project({ id: "c" });
    const alerts = computeAlerts(snap([a, b, c], [invoice({ projectId: "c" })]), TODAY);
    expect(alerts.map((x) => x.severity)).toEqual(["dringend", "hinweis", "info"]);
  });
});
