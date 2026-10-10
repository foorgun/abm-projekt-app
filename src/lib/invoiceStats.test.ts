import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { computeAlerts } from "./alerts";
import { ageBucketOf, agingBuckets, invoiceKpis, monthlyVolume, volumeTrend } from "./invoiceStats";
import type { Invoice } from "./types";

const TODAY = "2026-10-10";
const db = buildDemoDataset(TODAY);
const alerts = computeAlerts(db, TODAY);
const inv = (o: Partial<Invoice>): Invoice => ({ id: "x", projectId: "p", label: "R", amountCents: 100_000, triggerStep: null, status: "bezahlt", dueOn: null, sentOn: null, paidOn: null, ...o });

describe("Rechnungs-Kennzahlen", () => {
  it("nicht versendet = fällige Rechnungen mit Warnung (Summe und Anzahl)", () => {
    const k = invoiceKpis(db.invoices, alerts, TODAY);
    expect(k.unsentCount).toBe(5);
    expect(k.unsentCents).toBe((10000 + 3600 + 2400 + 4200 + 8500) * 100);
    expect(k.sentOpenCount).toBe(db.invoices.filter((i) => i.status === "versendet").length);
  });

  it("bezahlt in den letzten 30 Tagen: Grenze genau", () => {
    const k = invoiceKpis([inv({ id: "a", paidOn: "2026-09-11" }), inv({ id: "b", paidOn: "2026-09-10" }), inv({ id: "c", paidOn: TODAY })], [], TODAY);
    expect(k.paid30Count).toBe(2);
  });

  it("Durchschnitt Fälligkeit bis Versand: früher Versand zählt als 0", () => {
    const k = invoiceKpis([inv({ id: "a", dueOn: "2026-09-01", sentOn: "2026-09-07" }), inv({ id: "b", dueOn: "2026-09-10", sentOn: "2026-09-06" })], [], TODAY);
    expect(k.avgDelayDays).toBe(3);
    expect(invoiceKpis([], [], TODAY).avgDelayDays).toBeNull();
    const demo = invoiceKpis(db.invoices, alerts, TODAY);
    expect(demo.avgDelayDays!).toBeGreaterThan(0);
    expect(demo.avgDelayDays!).toBeLessThan(10);
  });
});

describe("Rechnungsvolumen pro Monat", () => {
  const v = monthlyVolume(db.invoices, TODAY);

  it("12 Monate bis heute, jeder mit Volumen", () => {
    expect(v).toHaveLength(12);
    expect(v[0].month).toBe("2025-11-01");
    expect(v[11]).toMatchObject({ month: "2026-10-01", label: "Okt" });
    for (const m of v.slice(0, 11)) expect(m.sent, m.title).toBeGreaterThan(5000);
  });

  it("ordnet nach Versand- und Zahlungsmonat", () => {
    const m = monthlyVolume([inv({ amountCents: 250_000, sentOn: "2026-08-31", paidOn: "2026-09-01" })], TODAY);
    expect(m.find((x) => x.label === "Aug")).toMatchObject({ sent: 2500, paid: 0 });
    expect(m.find((x) => x.label === "Sep")).toMatchObject({ sent: 0, paid: 2500 });
  });

  it("Trend vergleicht den letzten vollständigen Monat mit dem davor", () => {
    const t = volumeTrend(v);
    expect(t.month).toBe("September");
    expect(t.against).toBe("August");
    expect(t.percent).toBe(Math.round(((v[10].sent - v[9].sent) / v[9].sent) * 100));
  });
});

describe("Nicht versendet nach Alter", () => {
  it("Grenzen 7 und 30 Tage", () => {
    expect([0, 7, 8, 30, 31].map(ageBucketOf)).toEqual(["0-7", "0-7", "8-30", "8-30", "30+"]);
  });

  it("verteilt die Demo-Rechnungen auf alle drei Gruppen", () => {
    const b = agingBuckets(db.invoices, alerts);
    expect(b.map((x) => x.count)).toEqual([2, 2, 1]);
    expect(b[2].euros).toBe(10000);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(invoiceKpis(db.invoices, alerts, TODAY).unsentCount);
  });
});
