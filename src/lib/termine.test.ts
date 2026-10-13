import { describe, expect, it } from "vitest";
import { demoTermine, demoTermineQuelle } from "../demo/termine";
import { arbeitswoche, istVergangen, montagVon, naechsterHeute, tagAnzeige, tagKopf, tagLabel, TERMINE_PRO_TAG, termineJeTag, wocheWechseln, wochenBereich, type Termin } from "./termine";

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

describe("Wochenwechsel", () => {
  it("verschiebt um ganze Wochen, vor und zurück", () => {
    expect(arbeitswoche("2026-10-13", 0)).toEqual(arbeitswoche("2026-10-13"));
    expect(arbeitswoche("2026-10-13", 1)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(arbeitswoche("2026-10-13", -1)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    // auch vom Wochenende aus: Bezug ist die Woche, in der heute liegt
    expect(arbeitswoche("2026-10-18", 1)[0]).toBe("2026-10-19");
  });

  it("rechnet über den Jahreswechsel", () => {
    expect(arbeitswoche("2026-12-22", 1)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(arbeitswoche("2026-12-22", 2)).toEqual(["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"]);
    expect(arbeitswoche("2027-01-05", -1)).toEqual(arbeitswoche("2026-12-31"));
    expect(arbeitswoche("2027-01-05", -2)[4]).toBe("2026-12-25");
  });

  it("zählt den Offset mit den Pfeilen, 'Heute' setzt zurück", () => {
    let offset = 0;
    offset = wocheWechseln(offset, "vor");
    offset = wocheWechseln(offset, "vor");
    expect(offset).toBe(2);
    offset = wocheWechseln(offset, "zurueck");
    expect(offset).toBe(1);
    expect(wocheWechseln(offset, "heute")).toBe(0);
    expect(wocheWechseln(-7, "heute")).toBe(0);
    expect(wocheWechseln(0, "zurueck")).toBe(-1);
    expect(wocheWechseln(0, "heute")).toBe(0);
  });

  it("beschriftet den Datumsbereich, auch über Monats- und Jahreswechsel", () => {
    expect(wochenBereich(arbeitswoche("2026-10-13"))).toBe("12.–16. Oktober 2026");
    expect(wochenBereich(arbeitswoche("2026-10-01"))).toBe("28. September – 2. Oktober 2026");
    expect(wochenBereich(arbeitswoche("2026-12-31"))).toBe("28. Dezember 2026 – 1. Januar 2027");
  });

  it("markiert 'heute' nur in der laufenden Woche", () => {
    expect(termineJeTag([], "2026-10-13", undefined, 0).map((d) => d.heute)).toEqual([false, true, false, false, false]);
    expect(termineJeTag([], "2026-10-13", undefined, 1).some((d) => d.heute)).toBe(false);
    expect(termineJeTag([], "2026-10-13", undefined, -1).some((d) => d.heute)).toBe(false);
    expect(termineJeTag([], "2026-10-13", undefined, 1).map((d) => d.datum)).toEqual(arbeitswoche("2026-10-13", 1));
  });

  it("die Demo-Quelle liefert für jede Woche Termine dieser Woche, mit anderen IDs und anderer Verteilung", async () => {
    for (const offset of [-1, 0, 1, 12, -60]) {
      const woche = arbeitswoche("2026-10-13", offset);
      const termine = await demoTermineQuelle.getTermineDieseWoche("2026-10-13", offset);
      expect(termine.every((x) => woche.includes(x.datum)), String(offset)).toBe(true);
      expect(new Set(termine.map((x) => x.id)).size).toBe(termine.length);
    }
    const diese = demoTermine("2026-10-13", 0);
    const naechste = demoTermine("2026-10-13", 1);
    expect(naechste.some((x) => diese.some((y) => y.id === x.id))).toBe(false);
    expect(termineJeTag(naechste, "2026-10-13", undefined, 1).map((d) => d.gesamt)).not.toEqual(termineJeTag(diese, "2026-10-13").map((d) => d.gesamt));
    // ohne Angabe: die laufende Woche, wie bisher
    expect(await demoTermineQuelle.getTermineDieseWoche("2026-10-13")).toEqual(diese);
  });
});

describe("Spaltenkopf", () => {
  it("trennt Wochentagskürzel und Tageszahl", () => {
    expect(arbeitswoche("2026-10-13").map(tagKopf)).toEqual([
      { kuerzel: "Mo", zahl: 12 },
      { kuerzel: "Di", zahl: 13 },
      { kuerzel: "Mi", zahl: 14 },
      { kuerzel: "Do", zahl: 15 },
      { kuerzel: "Fr", zahl: 16 },
    ]);
    expect(tagKopf("2027-01-01")).toEqual({ kuerzel: "Fr", zahl: 1 });
  });
});

describe("Vergangene Termine", () => {
  const heute = "2026-10-13";

  it("gelten nur am heutigen Tag als vergangen", () => {
    const frueh = { datum: heute, von: "09:00", bis: "10:00" };
    expect(istVergangen(frueh, heute, "10:01")).toBe(true);
    // gestern und morgen nie, auch wenn die Uhrzeit kleiner ist als jetzt
    expect(istVergangen({ ...frueh, datum: "2026-10-12" }, heute, "23:59")).toBe(false);
    expect(istVergangen({ ...frueh, datum: "2026-10-14" }, heute, "23:59")).toBe(false);
    // auch nicht in einer zurückliegenden Woche
    expect(istVergangen({ ...frueh, datum: "2026-10-06" }, heute, "23:59")).toBe(false);
  });

  it("maßgeblich ist das Ende, ohne Ende der Beginn", () => {
    const t = { datum: heute, von: "09:00", bis: "10:00" };
    expect(istVergangen(t, heute, "09:30")).toBe(false); // läuft gerade
    expect(istVergangen(t, heute, "10:00")).toBe(false);
    expect(istVergangen(t, heute, "08:59")).toBe(false);
    expect(istVergangen({ datum: heute, von: "09:00", bis: null }, heute, "09:01")).toBe(true);
    expect(istVergangen({ datum: heute, von: "09:00" }, heute, "09:00")).toBe(false);
  });

  it("der nächste anstehende Termin heute trägt die 'jetzt'-Markierung", () => {
    const termine = [t({ id: "a", datum: heute, von: "09:00", bis: "10:00" }), t({ id: "b", datum: heute, von: "11:00", bis: "12:00" }), t({ id: "c", datum: heute, von: "15:30", bis: "16:30" }), t({ id: "m", datum: "2026-10-14", von: "08:00" })];
    expect(naechsterHeute(termine, heute, "08:00")?.id).toBe("a");
    expect(naechsterHeute(termine, heute, "10:30")?.id).toBe("b");
    expect(naechsterHeute(termine, heute, "11:30")?.id).toBe("b"); // läuft gerade
    expect(naechsterHeute(termine, heute, "17:00")).toBeNull();
    // an einem Tag ohne Termine heute (z. B. in einer anderen Woche geblättert) gibt es keine Markierung
    expect(naechsterHeute(termine, "2026-10-17", "08:00")).toBeNull();
  });
});

describe("'+N weitere' aufklappen", () => {
  const viele = ["08:00", "09:00", "10:00", "11:00", "13:00", "15:00"].map((von) => t({ von }));
  const [montag] = termineJeTag(viele, "2026-10-12");

  it("zeigt eingeklappt vier Kacheln und den Rest als Zahl", () => {
    const zu = tagAnzeige(montag, false);
    expect(zu.termine.map((x) => x.von)).toEqual(["08:00", "09:00", "10:00", "11:00"]);
    expect(zu.weitere).toBe(2);
  });

  it("zeigt aufgeklappt alle Termine in zeitlicher Reihenfolge und keine Restzahl", () => {
    const auf = tagAnzeige(montag, true);
    expect(auf.termine.map((x) => x.von)).toEqual(["08:00", "09:00", "10:00", "11:00", "13:00", "15:00"]);
    expect(auf.weitere).toBe(0);
    expect(montag.alle).toHaveLength(6);
  });

  it("ändert nichts an Tagen mit höchstens vier Terminen", () => {
    const [wenig] = termineJeTag(viele.slice(0, 3), "2026-10-12");
    expect(tagAnzeige(wenig, true)).toEqual(tagAnzeige(wenig, false));
    expect(tagAnzeige(wenig, false).weitere).toBe(0);
  });
});
