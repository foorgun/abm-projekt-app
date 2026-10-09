import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { newProjectsPerMonth, projectsByPhase } from "./dashboard";

const TODAY = "2026-10-09";
const db = buildDemoDataset(TODAY);

describe("Dashboard-Daten", () => {
  it("liefert 12 Monate bis einschließlich heute", () => {
    const m = newProjectsPerMonth(db.projects, TODAY);
    expect(m).toHaveLength(12);
    expect(m[0].month).toBe("2025-11-01");
    expect(m[11]).toMatchObject({ month: "2026-10-01", label: "Okt", title: "Oktober 2026" });
  });

  it("zählt über den Jahreswechsel richtig", () => {
    const m = newProjectsPerMonth([{ ...db.projects[0], intakeMonth: "2026-01-01" }], "2026-02-15", 3);
    expect(m.map((x) => [x.month, x.count])).toEqual([["2025-12-01", 0], ["2026-01-01", 1], ["2026-02-01", 0]]);
  });

  it("verteilt alle aktiven Projekte auf Phasen", () => {
    const phases = projectsByPhase(db.projects, db.stepDefinitions);
    const total = phases.reduce((a, b) => a + b.value, 0);
    expect(total).toBe(db.projects.filter((p) => p.status === "aktiv").length);
    expect(phases.every((p) => p.value > 0)).toBe(true);
  });
});
