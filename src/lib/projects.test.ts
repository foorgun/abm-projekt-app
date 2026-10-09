import { describe, expect, it } from "vitest";
import { allPhases, missingSteps, nextStep, phaseOf, progressOf } from "./projects";
import type { StepDefinition } from "./steps";
import type { Project } from "./types";

const STEPS: StepDefinition[] = [
  { key: "a", label: "A", sortOrder: 10 },
  { key: "b", label: "B", sortOrder: 20 },
  { key: "c", label: "C", sortOrder: 30 },
];

const p = (steps: Project["steps"]): Project => ({
  id: "p", abmNr: "1", kind: "neubau", status: "aktiv", companyId: null, salespersonId: null, bauherrLabel: "X",
  location: null, architectId: null, planerId: null, baubetreuung: null, intakeMonth: null, notes: null, steps,
});

describe("Phasen", () => {
  it("ohne Schritt ist die Phase Eingang", () => {
    expect(phaseOf(p({}), STEPS)).toMatchObject({ key: "eingang", index: -1 });
  });

  it("Phase ist der letzte erledigte Schritt, auch mit Lücke", () => {
    const proj = p({ a: "2026-01-01", c: "2026-02-01" });
    expect(phaseOf(proj, STEPS).key).toBe("c");
    expect(missingSteps(proj, STEPS).map((s) => s.key)).toEqual(["b"]);
    expect(nextStep(proj, STEPS)?.key).toBe("b");
    expect(progressOf(proj, STEPS)).toEqual({ done: 2, total: 3 });
  });

  it("liest die Reihenfolge aus den Definitionen", () => {
    expect(allPhases(STEPS).map((x) => x.key)).toEqual(["eingang", "a", "b", "c"]);
  });
});
