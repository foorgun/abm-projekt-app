import { describe, expect, it } from "vitest";
import { demoTermine, demoTermineQuelle } from "../demo/termine";
import { arbeitswoche, montagVon, tagLabel, TERMINE_PRO_TAG, termineJeTag, type Termin } from "./termine";

const t = (patch: Partial<Termin>): Termin => ({ id: Math.random().toString(36), datum: "2026-10-12", von: "09:00", titel: "Termin", ort: null, typ: "intern", ...patch });

describe("Wochenberechnung", () => {
  it("liefert Montag bis Freitag der laufenden Woche, egal an welchem Tag", () => {
    const woche = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
    for (const heute of [...woche, "2026-10-17", "2026-10-18"]) expect(arbeitswoche(heute), heute).toEqual(woche);
    expect(arbeitswoche("2026-10-19")[0]).toBe("2026-10-19");
  });

  it("der Sonntag gehört zur Woche davor, der Montag beginnt die neue", () => {
    expect(montagVon("2026-10-18")).toBe("2026-10-12");
    expect(montagVon("2026-10-19")).toBe("2026-10-19");
    expect(montagVon("2026-10-12")).toBe("2026-10-12");
  });

  it("rechnet über Monats- und Jahreswechsel", () => {
    expect(arbeitswoche("2026-10-01")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    // Neujahr 2027 ist ein Freitag: die Woche beginnt am 28.12.2026
    expect(arbeitswoche("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(arbeitswoche("2026-12-31")).toEqual(arbeitswoche("2027-01-01"));
    // Schaltjahr
    expect(arbeitswoche("2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03"]);
  });

  it("beschriftet die Tage", () => {
    expect(arbeitswoche("2026-10-13").map(tagLabel)).toEqual(["Mo 12.10.", "Di 13.10.", "Mi 14.10.", "Do 15.10.", "Fr 16.10."]);
  });
});

describe("Gruppierung je Tag", () => {
  it("sortiert nach Uhrzeit und markiert heute", () => {
    const tage = termineJeTag([t({ von: "14:00", titel: "spät" }), t({ von: "08:30", titel: "früh" }), t({ datum: "2026-10-14", titel: "Mittwoch" })], "2026-10-12");
    expect(tage.map((d) => d.datum)).toEqual(arbeitswoche("2026-10-12"));
    expect(tage[0].termine.map((x) => x.titel)).toEqual(["früh", "spät"]);
    expect(tage.map((d) => d.heute)).toEqual([true, false, false, false, false]);
    expect(tage[2].termine.map((x) => x.titel)).toEqual(["Mittwoch"]);
    expect(tage[1]).toMatchObject({ termine: [], weitere: 0, gesamt: 0 });
  });

  it("lässt Termine am Wochenende und in anderen Wochen weg", () => {
    const tage = termineJeTag([t({ datum: "2026-10-17" }), t({ datum: "2026-10-19" }), t({ datum: "2026-10-09" })], "2026-10-12");
    expect(tage.every((d) => d.gesamt === 0)).toBe(true);
    expect(termineJeTag([], "2026-10-17").every((d) => !d.heute)).toBe(true);
  });

  it("zeigt höchstens vier Termine je Tag und den Rest als +N weitere", () => {
    expect(TERMINE_PRO_TAG).toBe(4);
    const viele = ["08:00", "09:00", "10:00", "11:00", "13:00", "15:00"].map((von) => t({ von }));
    const [montag] = termineJeTag(viele, "2026-10-12");
    expect(montag.termine.map((x) => x.von)).toEqual(["08:00", "09:00", "10:00", "11:00"]);
    expect(montag).toMatchObject({ weitere: 2, gesamt: 6 });
    expect(termineJeTag(viele.slice(0, 4), "2026-10-12")[0].weitere).toBe(0);
    expect(termineJeTag(viele, "2026-10-12", 5)[0].weitere).toBe(1);
  });
});

describe("Demo-Termine", () => {
  it("liegen immer in der laufenden Arbeitswoche, auch über den Jahreswechsel", async () => {
    for (const heute of ["2026-10-13", "2026-12-31", "2027-01-01", "2026-10-18"]) {
      const woche = arbeitswoche(heute);
      const termine = await demoTermineQuelle.getTermineDieseWoche(heute);
      expect(termine.length).toBeGreaterThan(10);
      expect(termine.every((x) => woche.includes(x.datum)), heute).toBe(true);
    }
  });

  it("haben einen Tag mit mehr als vier Terminen (für +N weitere) und alle vier Typen", () => {
    const tage = termineJeTag(demoTermine("2026-10-13"), "2026-10-13");
    expect(tage.some((d) => d.weitere === 2)).toBe(true);
    expect(new Set(demoTermine("2026-10-13").map((x) => x.typ))).toEqual(new Set(["baustelle", "besprechung", "behoerde", "intern"]));
    expect(demoTermineQuelle.hinweis).toBe("Demo – Outlook-Anbindung folgt");
  });
});
