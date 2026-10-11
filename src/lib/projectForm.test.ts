import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { cleanMasterName, followupForMissingInfo, followupKey, FOLLOWUP_DUE_DAYS, infoStateOfNew, missingProjectInfo, validateNewProject, type ProjectInfoState } from "./projectForm";
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
  const full: ProjectInfoState = { kind: "neubau", companyId: "c-bz", salespersonId: "s-1", phone: "0731 1", email: null, buildingAddress: "Weg 1", vermesser: "Vermessung X" };
  const empty: ProjectInfoState = { kind: "neubau", companyId: null, salespersonId: null, phone: null, email: null, buildingAddress: null, vermesser: null };

  it("prüft Kontakt, Bauadresse, Hausbaufirma, Verkäufer, Vermesser (in dieser Reihenfolge)", () => {
    expect(missingProjectInfo(full)).toEqual([]);
    expect(missingProjectInfo(empty)).toEqual(["Telefon oder E-Mail des Bauherrn", "Bauadresse", "Hausbaufirma", "Verkäufer", "Vermesser"]);
  });

  it("Telefon ODER E-Mail genügt; Leerzeichen zählen nicht", () => {
    expect(missingProjectInfo({ ...full, phone: null, email: "a@example.com" })).toEqual([]);
    expect(missingProjectInfo({ ...full, phone: "  ", email: null })).toEqual(["Telefon oder E-Mail des Bauherrn"]);
  });

  it("ABM-Nr. und Eingangsmonat gehören nicht zur Regel", () => {
    // Ein Projekt ohne ABM-Nr., Bauort und Eingangsmonat, aber mit allen geprüften Angaben: nichts fehlt
    expect(missingProjectInfo(infoStateOfNew({ ...onlyName, companyId: "c-bz", salespersonId: "s-1", vermesser: "V", bauherr: { phone: "1", email: null, address: null, buildingAddress: "Weg 1" } }))).toEqual([]);
    // Umgekehrt: ABM-Nr. und Monat da, sonst nichts: es fehlt trotzdem alles Geprüfte außer der Firma
    expect(missingProjectInfo(infoStateOfNew(ok))).toEqual(["Telefon oder E-Mail des Bauherrn", "Bauadresse", "Verkäufer", "Vermesser"]);
  });

  it("Bauvoranfrage: Hausbaufirma und Verkäufer zählen nicht als fehlend", () => {
    expect(missingProjectInfo({ ...empty, kind: "bauvoranfrage" })).toEqual(["Telefon oder E-Mail des Bauherrn", "Bauadresse", "Vermesser"]);
  });

  it("eine Aufgabe mit allen fehlenden Feldern in einer Zeile, oder keine", () => {
    expect(followupForMissingInfo(full, "2026-10-11")).toBeNull();
    const f = followupForMissingInfo({ ...full, buildingAddress: null, vermesser: null }, "2026-10-11")!;
    expect(f.title).toBe("Fehlende Angaben nachfragen: Bauadresse, Vermesser");
    expect(FOLLOWUP_DUE_DAYS).toBe(7);
    expect(f.dueOn).toBe("2026-10-18");
    expect(followupKey("p-1")).toBe("angaben:p-1");
  });

  it("E-Mail des Bauherrn wird auf ihr Format geprüft, wenn eingetragen", () => {
    expect(validateNewProject({ ...ok, bauherr: { phone: null, email: "kein-at", address: null, buildingAddress: null } }, db.projects).email).toMatch(/E-Mail/);
    expect(validateNewProject({ ...ok, bauherr: { phone: null, email: " a@example.com ", address: null, buildingAddress: null } }, db.projects)).toEqual({});
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
