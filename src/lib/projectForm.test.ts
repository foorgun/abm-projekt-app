import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { validateNewProject } from "./projectForm";
import type { NewProject } from "./repo";

const db = buildDemoDataset("2026-10-10");
const ok: NewProject = {
  bauherrLabel: "Hoffmann", abmNr: "8161-950", hausbauNr: "HB-26999", kind: "neubau", companyId: "c-bz", salespersonId: null,
  location: "Ulm", architectId: "t-be", planerId: null, intakeMonth: "2026-10-01", createFolders: true,
};

describe("Formular Neues Projekt", () => {
  it("gültige Eingabe ohne Fehler", () => {
    expect(validateNewProject(ok, db.projects)).toEqual({});
  });

  it("Pflichtfelder und Formate mit deutschen Meldungen", () => {
    const e = validateNewProject({ ...ok, bauherrLabel: " ", abmNr: "8161/9", hausbauNr: "26-xx", location: "", companyId: null, intakeMonth: null }, db.projects);
    expect(Object.keys(e).sort()).toEqual(["abmNr", "bauherrLabel", "companyId", "hausbauNr", "intakeMonth", "location"]);
    expect(e.bauherrLabel).toMatch(/Nachnamen/);
  });

  it("vergebene ABM-Nr. wird erkannt", () => {
    const taken = db.projects.find((p) => p.status === "aktiv" && p.abmNr?.startsWith("8161"))!;
    expect(validateNewProject({ ...ok, abmNr: taken.abmNr }, db.projects).abmNr).toContain(taken.bauherrLabel);
  });

  it("Bauvoranfrage braucht weder ABM-Nr. noch Firma", () => {
    expect(validateNewProject({ ...ok, kind: "bauvoranfrage", abmNr: null, companyId: null }, db.projects)).toEqual({});
  });
});
