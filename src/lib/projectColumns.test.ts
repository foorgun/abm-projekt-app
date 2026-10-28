import { describe, expect, it } from "vitest";
import {
  COLUMN_DEFS,
  COLUMN_LABEL,
  columnsStorageKey,
  defaultColumns,
  loadColumns,
  moveColumn,
  moveColumnTo,
  normalizeColumns,
  resetColumns,
  saveColumns,
  toggleColumn,
  visibleColumns,
} from "./projectColumns";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}
const broken = {
  getItem: () => {
    throw new Error("gesperrt");
  },
  setItem: () => {
    throw new Error("gesperrt");
  },
  removeItem: () => {
    throw new Error("gesperrt");
  },
};

describe("Spalten der Projektliste", () => {
  const EXCEL = ["nr", "firma", "abm", "bauherr", "bl_ort", "verkaeufer", "architekt", "planer", "plangespraech", "baugesuch_uebergabe", "vertrag_versendet", "vertrag_zurueck", "baugenehmigung", "baubetreuung", "hausbau_nr"];

  it("Standard: die 14 Excel-Spalten in Excel-Reihenfolge, dahinter Fertighausfirma-Nr.", () => {
    expect(visibleColumns(defaultColumns())).toEqual(EXCEL);
    expect(visibleColumns(defaultColumns()).map((k) => COLUMN_LABEL[k])).toEqual([
      "Anzahl Projekte",
      "Fertighausfirma",
      "ABM-Nr.",
      "Bauherrschaft",
      "Bundesland - Bauort",
      "Verkäufer",
      "Architekt",
      "Planer",
      "Plan-Gespräch",
      "Übergabe Baugesuch",
      "ABM-Vertrag – versendet",
      "ABM-Vertrag – zurück",
      "Baugenehmigung",
      "Baubetreuung",
      "Fertighausfirma-Nr.",
    ]);
    // Normale Schreibweise, nicht wie in der Excel in Großbuchstaben
    for (const c of COLUMN_DEFS) expect(c.label).not.toBe(c.label.toUpperCase());
  });

  it("Bundesland und Bauort einzeln sind wählbar, aber standardmäßig aus", () => {
    const d = defaultColumns();
    expect(d.find((c) => c.key === "bundesland")).toEqual({ key: "bundesland", visible: false });
    expect(d.find((c) => c.key === "ort")).toEqual({ key: "ort", visible: false });
    expect(COLUMN_DEFS.map((c) => c.key)).toEqual([...EXCEL, "bundesland", "ort"]);
  });

  it("entfernte Spalten (Phase, Schritte, Status, Nächste Aufgabe, Warnung) gibt es nicht mehr", () => {
    const labels = COLUMN_DEFS.map((c) => c.label.toLowerCase());
    for (const l of ["status", "phase", "schritte", "schritte (balken)", "nächste aufgabe", "warnung"]) expect(labels).not.toContain(l);
    // auch nicht aus einem alten gespeicherten Stand
    const s = normalizeColumns([{ key: "status", visible: true }, { key: "warn", visible: true }, { key: "abm", visible: true }]);
    expect(visibleColumns(s)).toEqual(["abm"]);
    expect(s.map((c) => c.key)).not.toContain("status");
  });

  it("ein- und ausblenden; die letzte sichtbare Spalte bleibt", () => {
    let s = toggleColumn(defaultColumns(), "ort");
    expect(visibleColumns(s)).toEqual([...EXCEL, "ort"]);
    s = toggleColumn(s, "firma");
    expect(visibleColumns(s)).not.toContain("firma");
    for (const k of visibleColumns(s)) s = toggleColumn(s, k);
    expect(visibleColumns(s)).toEqual(["ort"]);
  });

  it("umsortieren mit Auf/Ab und per Ziehen; an den Rändern passiert nichts", () => {
    let s = moveColumn(defaultColumns(), "abm", -1);
    expect(visibleColumns(s).slice(0, 3)).toEqual(["nr", "abm", "firma"]);
    s = moveColumnTo(defaultColumns(), "planer", 0);
    expect(visibleColumns(s).slice(0, 3)).toEqual(["planer", "nr", "firma"]);
    expect(moveColumn(s, "planer", -1)).toBe(s);
    const last = s[s.length - 1].key;
    expect(moveColumn(s, last, 1)).toBe(s);
    s = moveColumnTo(s, "planer", 99);
    expect(s[s.length - 1].key).toBe("planer");
  });

  it("gespeicherten Stand prüfen: Unbekanntes und Doppeltes fällt weg, Neues hängt ausgeblendet an", () => {
    const s = normalizeColumns([
      { key: "ort", visible: true },
      { key: "gibtsnicht", visible: true },
      { key: "ort", visible: false },
      { key: "abm", visible: true },
    ]);
    expect(s.slice(0, 2)).toEqual([
      { key: "ort", visible: true },
      { key: "abm", visible: true },
    ]);
    expect(s).toHaveLength(COLUMN_DEFS.length);
    expect(visibleColumns(s)).toEqual(["ort", "abm"]);
    expect(normalizeColumns("kaputt")).toEqual(defaultColumns());
    expect(normalizeColumns([{ key: "abm", visible: false }])).toEqual(defaultColumns()); // nichts sichtbar
  });

  it("speichern und laden je Benutzer; zurücksetzen stellt den Standard her", () => {
    const store = memoryStore();
    const a = columnsStorageKey({ id: "user-a", role: "mitarbeiter" });
    const b = columnsStorageKey({ id: "user-b", role: "mitarbeiter" });
    expect(a).not.toBe(b);
    expect(columnsStorageKey({ role: "admin" })).toBe("abm.projekte.spalten.v3.demo-admin");

    const mine = moveColumnTo(toggleColumn(defaultColumns(), "baugenehmigung"), "baugenehmigung", 0);
    saveColumns(a, mine, store);
    expect(loadColumns(a, store)).toEqual(mine);
    expect(loadColumns(b, store)).toEqual(defaultColumns());

    expect(resetColumns(a, store)).toEqual(defaultColumns());
    expect(store.m.has(a)).toBe(false);
    expect(loadColumns(a, store)).toEqual(defaultColumns());
  });

  it("ohne nutzbaren Speicher: kein Absturz, Standardspalten", () => {
    const k = columnsStorageKey({ id: "x", role: "admin" });
    expect(() => saveColumns(k, defaultColumns(), broken)).not.toThrow();
    expect(loadColumns(k, broken)).toEqual(defaultColumns());
    expect(resetColumns(k, broken)).toEqual(defaultColumns());
    expect(loadColumns(k, null)).toEqual(defaultColumns());
    const store = memoryStore();
    store.setItem(k, "{kein json");
    expect(loadColumns(k, store)).toEqual(defaultColumns());
  });
});
