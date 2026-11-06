import { describe, expect, it } from "vitest";
import { namenErgaenzen, namensFormKey, namenTeilen, namenVorbelegen, teileName, vollerName, weitereSichtbar } from "./weitereBauherren";

describe("weitereSichtbar", () => {
  it("zeigt so viele wie angefordert, höchstens drei weitere", () => {
    expect(weitereSichtbar(null, 0)).toBe(0);
    expect(weitereSichtbar({}, 2)).toBe(2);
    expect(weitereSichtbar({}, 9)).toBe(3);
  });
  it("zeigt immer bis zum letzten ausgefüllten, auch beim Fortsetzen eines Entwurfs", () => {
    expect(weitereSichtbar({ phone2: "0731 1" }, 0)).toBe(1);
    expect(weitereSichtbar({ email4: "d@example.com" }, 0)).toBe(3);
    expect(weitereSichtbar({ name3: "C" }, 3)).toBe(3);
  });
  it("leere Werte zählen nicht", () => {
    expect(weitereSichtbar({ name2: "", name3: null }, 0)).toBe(0);
  });
});

describe("Vorname und Nachname", () => {
  it("bildet den Namen aus beiden Teilen, bereinigt", () => {
    expect(vollerName(" Jonas ", "Hoffmann")).toBe("Jonas Hoffmann");
    expect(vollerName(null, "Hoffmann")).toBe("Hoffmann");
    expect(vollerName("", "  ")).toBeNull();
  });
  it("teilt mit bekanntem Nachnamen (Projektname): alles davor ist der Vorname", () => {
    expect(teileName("Jonas Hoffmann", "Hoffmann")).toEqual({ vorname: "Jonas", nachname: "Hoffmann" });
    expect(teileName("Jonas und Anna Hoffmann", "Hoffmann")).toEqual({ vorname: "Jonas und Anna", nachname: "Hoffmann" });
    expect(teileName("Anna von Berg", "von Berg")).toEqual({ vorname: "Anna", nachname: "von Berg" });
    expect(teileName("Familie Hoffmann", "Hoffmann")).toEqual({ vorname: null, nachname: "Hoffmann" });
    expect(teileName("Hoffmann", "Hoffmann")).toEqual({ vorname: null, nachname: "Hoffmann" });
  });
  it("teilt ohne Hinweis am letzten Leerzeichen oder als „Nachname, Vorname“", () => {
    expect(teileName("Anna Hoffmann")).toEqual({ vorname: "Anna", nachname: "Hoffmann" });
    expect(teileName("Hoffmann, Anna")).toEqual({ vorname: "Anna", nachname: "Hoffmann" });
    expect(teileName("Frau Anna Hoffmann")).toEqual({ vorname: "Anna", nachname: "Hoffmann" });
    expect(teileName("Kaya")).toEqual({ vorname: null, nachname: "Kaya" });
    expect(teileName(null, "Kaya")).toEqual({ vorname: null, nachname: "Kaya" });
    expect(teileName("  ")).toEqual({ vorname: null, nachname: null });
  });
  it("ergänzt den Namen nur bei Bauherren, deren Teile genannt sind", () => {
    expect(namenErgaenzen({ name: "alt", vorname: "Deniz", nachname: " Kaya ", name2: "Ela Kaya", name3: "X", vorname3: "", nachname3: null })).toEqual({
      name: "Deniz Kaya",
      vorname: "Deniz",
      nachname: "Kaya",
      name2: "Ela Kaya",
      name3: null,
      vorname3: null,
      nachname3: null,
    });
  });
  it("belegt das Formular vor: gespeicherte Teile, sonst aus dem Namen, Bauherr 1 ohne Namen mit dem Projektnamen", () => {
    const v = namenVorbelegen({ name: "Familie Hoffmann", name2: "Anna Hoffmann", vorname3: "Lena", nachname3: null, name3: "Lena Kaya" }, "Hoffmann");
    expect(v).toEqual({ vorname: "", nachname: "Hoffmann", vorname2: "Anna", nachname2: "Hoffmann", vorname3: "Lena", nachname3: "", vorname4: "", nachname4: "" });
    expect(namenVorbelegen(null, "Kaya").nachname).toBe("Kaya");
  });
  it("teilt fehlende Teile aus dem Namen, gesetzte bleiben", () => {
    expect(namenTeilen({ name: "Jonas Hoffmann", name2: "Anna Berg", vorname2: "Anna-Lena" }, "Hoffmann")).toEqual({
      name: "Jonas Hoffmann",
      vorname: "Jonas",
      nachname: "Hoffmann",
      name2: "Anna Berg",
      vorname2: "Anna-Lena",
    });
  });
  it("Vor- und Nachname zählen als Änderung am Namen des jeweiligen Bauherrn", () => {
    expect(["name", "vorname", "nachname", "vorname2", "nachname4", "phone2"].map(namensFormKey)).toEqual(["bauherrName", "bauherrName", "bauherrName", "name2", "name4", "phone2"]);
  });
});
