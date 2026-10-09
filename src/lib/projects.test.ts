import { describe, expect, it } from "vitest";
import { allPhases, allStages, missingSteps, nextStep, phaseOf, progressOf, stageMoveTarget, stageOf } from "./projects";
import type { StepDefinition } from "./steps";
import type { Project } from "./types";

const STEPS: StepDefinition[] = [
  { key: "a", label: "A", sortOrder: 10, stage: "S1" },
  { key: "b", label: "B", sortOrder: 20, stage: "S1" },
  { key: "c", label: "C", sortOrder: 30, stage: "S2" },
  { key: "d", label: "D", sortOrder: 40, stage: "S2" },
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
    expect(progressOf(proj, STEPS)).toEqual({ done: 2, total: 4 });
  });

  it("liest die Reihenfolge aus den Definitionen", () => {
    expect(allPhases(STEPS).map((x) => x.key)).toEqual(["eingang", "a", "b", "c", "d"]);
  });
});

describe("Stufen", () => {
  it("Stufen in Reihenfolge der Schritte", () => {
    expect(allStages(STEPS).map((s) => s.name)).toEqual(["S1", "S2"]);
  });

  it("Stufe = Stufe des nächsten Schritts nach der Phase", () => {
    expect(stageOf(p({}), STEPS).name).toBe("S1"); // Eingang: als Nächstes A
    expect(stageOf(p({ a: "x" }), STEPS).name).toBe("S1"); // als Nächstes B
    expect(stageOf(p({ a: "x", b: "x" }), STEPS).name).toBe("S2"); // S1 fertig: Arbeit in S2
    expect(stageOf(p({ a: "x", b: "x", c: "x", d: "x" }), STEPS).name).toBe("S2"); // alles fertig: letzte Stufe
  });

  it("Lücke zählt nicht zurück: nächster Schritt nach der Phase", () => {
    expect(stageOf(p({ a: "x", c: "x" }), STEPS).name).toBe("S2");
  });

  it("Verschieben in die nächste Stufe setzt deren ersten offenen Schritt und nennt die offenen davor", () => {
    const t = stageMoveTarget(p({ a: "x" }), STEPS)!;
    expect(t.stage.name).toBe("S2");
    expect(t.step.key).toBe("c");
    expect(t.skipped.map((s) => s.key)).toEqual(["b"]);
    expect(stageMoveTarget(p({ a: "x", b: "x", c: "x" }), STEPS)).toBeNull(); // schon in der letzten Stufe
  });
});
