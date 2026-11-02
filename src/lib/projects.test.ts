import { describe, expect, it } from "vitest";
import { allPhases, allStages, missingSteps, nextStep, phaseOf, progressOf, stageMoveTarget, stageOf, stepsFor } from "./projects";
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

describe("ohne Baubegleitung", () => {
  const ALL: StepDefinition[] = [
    { key: "a", label: "A", sortOrder: 10, stage: "Genehmigung" },
    { key: "b", label: "B", sortOrder: 20, stage: "Genehmigung" },
    { key: "c", label: "C", sortOrder: 30, stage: "Baubegleitung" },
    { key: "d", label: "D", sortOrder: 40, stage: "Baubegleitung" },
  ];
  const ohne = (steps: Project["steps"]): Project => ({ ...p(steps), baubegleitung: false });

  it("endet der Prozess vor der Stufe Baubegleitung", () => {
    expect(stepsFor(ohne({}), ALL).map((s) => s.key)).toEqual(["a", "b"]);
    const fertig = ohne({ a: "x", b: "x" });
    expect(progressOf(fertig, ALL)).toEqual({ done: 2, total: 2 });
    expect(nextStep(fertig, ALL)).toBeNull();
    expect(stageOf(fertig, ALL).name).toBe("Genehmigung");
    expect(stageMoveTarget(fertig, ALL)).toBeNull();
  });

  it("zählen erfasste Termine der Baubegleitung nicht, bleiben aber erhalten", () => {
    const proj = ohne({ a: "x", d: "x" });
    expect(phaseOf(proj, ALL).key).toBe("a");
    expect(missingSteps(proj, ALL)).toEqual([]);
    expect(nextStep(proj, ALL)?.key).toBe("b");
    expect(proj.steps.d).toBe("x");
  });

  it("ohne Angabe und mit ja gilt der ganze Prozess", () => {
    expect(stepsFor(p({}), ALL)).toHaveLength(4);
    expect(stepsFor({ baubegleitung: true }, ALL)).toHaveLength(4);
    expect(progressOf(p({ a: "x", b: "x" }), ALL)).toEqual({ done: 2, total: 4 });
    expect(stageMoveTarget(p({ a: "x" }), ALL)?.step.key).toBe("c");
    expect(stageMoveTarget(ohne({ a: "x" }), ALL)).toBeNull();
  });
});

describe("Anzeige Baubegleitung", () => {
  it("zeigt ja mit Leistungen oder nein", async () => {
    const { baubegleitungText } = await import("./projects");
    expect(baubegleitungText({ baubegleitung: false, baubetreuung: "3.1+3.2" })).toBe("Nein");
    expect(baubegleitungText({ baubetreuung: "3.1+3.2" })).toBe("Ja · 3.1+3.2");
    expect(baubegleitungText({ baubegleitung: true, baubetreuung: null })).toBe("Ja");
  });
});

describe("Projekttitel", () => {
  it("ohne ABM-Nr. nur der Name, nicht „Bauvoranfrage“", async () => {
    const { projectTitle } = await import("./projects");
    expect(projectTitle({ abmNr: null, bauherrLabel: "Hoffmann" })).toBe("Hoffmann");
    expect(projectTitle({ abmNr: "8161-101", bauherrLabel: "Meyer" })).toBe("8161-101 · Meyer");
    expect(projectTitle({ abmNr: "Bauvoranfrage", bauherrLabel: "Winter" })).toBe("Winter (Bauvoranfrage)");
  });
});
