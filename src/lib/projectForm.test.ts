import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { cleanMasterName, followupForMissingInfo, FOLLOWUP_DUE_DAYS, missingProjectInfo, validateNewProject } from "./projectForm";
import type { NewProject } from "./repo";

const db = buildDemoDataset("2026-10-10");
const ok: NewProject = {
  bauherrLabel: "Hoffmann", abmNr: "8161-950", hausbauNr: "HB-26999", kind: "neubau", companyId: "c-bz", salespersonId: null,
  location: "Ulm", architectId: "t-be", planerId: null, intakeMonth: "2026-10-01", createFolders: true,
};
const onlyName: NewProject = { ...ok, abmNr: null, hausbauNr: null, companyId: null, location: null, intakeMonth: null, architectId: null };

describe("Formular Neues Projekt", () => {
  it("gültige Eingabe ohne Fehler", () => {
    expect(validateNewProject(ok, db.projects)).toEqual({});
  });

  it("Pflicht ist nur der Bauherr: alles andere darf fehlen", () => {
    expect(validateNewProject(onlyName, db.projects)).toEqual({});
    expect(validateNewProject({ ...onlyName, location: "  " }, db.projects)).toEqual({});
    const e = validateNewProject({ ...onlyName, bauherrLabel: " " }, db.projects);
    expect(Object.keys(e)).toEqual(["bauherrLabel"]);
    expect(e.bauherrLabel).toMatch(/Nachnamen/);
  });

  it("eingetragene Werte werden weiter auf ihr Format geprüft", () => {
    const e = validateNewProject({ ...ok, abmNr: "8161/9", hausbauNr: "26-xx", intakeMonth: "2026-10-15" }, db.projects);
    expect(Object.keys(e).sort()).toEqual(["abmNr", "hausbauNr", "intakeMonth"]);
  });

  it("vergebene ABM-Nr. wird erkannt, wenn eine eingetragen ist", () => {
    const taken = db.projects.find((p) => p.status === "aktiv" && p.abmNr?.startsWith("8161"))!;
    expect(validateNewProject({ ...ok, abmNr: taken.abmNr }, db.projects).abmNr).toContain(taken.bauherrLabel);
    expect(validateNewProject({ ...ok, abmNr: ` ${taken.abmNr} ` }, db.projects).abmNr).toContain(taken.bauherrLabel);
  });

  it("Bauvoranfrage braucht weder ABM-Nr. noch Firma", () => {
    expect(validateNewProject({ ...ok, kind: "bauvoranfrage", abmNr: null, companyId: null }, db.projects)).toEqual({});
  });
});

describe("Fehlende Angaben nachfragen", () => {
  it("nennt, was fehlt, in der Reihenfolge des Formulars", () => {
    expect(missingProjectInfo(ok)).toEqual([]);
    expect(missingProjectInfo(onlyName)).toEqual(["Hausbaufirma", "ABM-Nr.", "Bauort", "Eingangsmonat"]);
    expect(missingProjectInfo({ ...ok, abmNr: " " })).toEqual(["ABM-Nr."]);
  });

  it("Bauvoranfrage: Firma und ABM-Nr. zählen nicht als fehlend", () => {
    expect(missingProjectInfo({ ...onlyName, kind: "bauvoranfrage" })).toEqual(["Bauort", "Eingangsmonat"]);
  });

  it("Aufgabe mit Titel und Fälligkeit, oder keine", () => {
    expect(followupForMissingInfo(ok, "2026-10-11")).toBeNull();
    const f = followupForMissingInfo({ ...ok, abmNr: null, location: null }, "2026-10-11")!;
    expect(f.title).toBe("Fehlende Angaben nachfragen: ABM-Nr., Bauort");
    expect(FOLLOWUP_DUE_DAYS).toBe(7);
    expect(f.dueOn).toBe("2026-10-18");
  });
});

describe("Name für neue Stammdaten", () => {
  it("bereinigt Leerzeichen", () => {
    expect(cleanMasterName("  Finger   Haus ", [])).toEqual({ ok: true, name: "Finger Haus" });
  });
  it("lehnt leere, zu lange und doppelte Namen ab (Groß-/Kleinschreibung egal)", () => {
    expect(cleanMasterName(" ", []).ok).toBe(false);
    expect(cleanMasterName("x".repeat(81), []).ok).toBe(false);
    expect(cleanMasterName("bien-zenker", ["Bien-Zenker"])).toEqual({ ok: false, reason: "Diesen Eintrag gibt es schon." });
  });
});
