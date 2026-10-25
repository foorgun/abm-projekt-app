import { describe, expect, it } from "vitest";
import {
  COLUMN_DEFS,
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
  it("Standard: ABM-Nr., Bauherr, Hausbaufirma, Bauort, Planer, Status; alle anderen wählbar", () => {
    expect(visibleColumns(defaultColumns())).toEqual(["abm", "bauherr", "firma", "ort", "planer", "status"]);
    const labels = COLUMN_DEFS.map((c) => c.label);
    for (const l of ["Verkäufer", "Architekt", "Plan-Gespräch", "Übergabe Baugesuch", "ABM-Vertrag versendet", "ABM-Vertrag zurück", "Baugenehmigung", "Baubetreuung"]) {
      expect(labels).toContain(l);
    }
  });

  it("ein- und ausblenden; die letzte sichtbare Spalte bleibt", () => {
    let s = toggleColumn(defaultColumns(), "verkaeufer");
    expect(visibleColumns(s)).toEqual(["abm", "bauherr", "firma", "ort", "verkaeufer", "planer", "status"]);
    s = toggleColumn(s, "firma");
    expect(visibleColumns(s)).not.toContain("firma");
    for (const k of visibleColumns(s)) s = toggleColumn(s, k);
    expect(visibleColumns(s)).toEqual(["status"]);
  });

  it("umsortieren mit Auf/Ab und per Ziehen; an den Rändern passiert nichts", () => {
    let s = moveColumn(defaultColumns(), "status", -1);
    s = moveColumn(s, "status", -1);
    expect(visibleColumns(s)).toEqual(["abm", "bauherr", "firma", "ort", "planer", "status"]); // nur über unsichtbare hinweg
    s = moveColumnTo(defaultColumns(), "planer", 0);
    expect(visibleColumns(s)).toEqual(["planer", "abm", "bauherr", "firma", "ort", "status"]);
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
    expect(columnsStorageKey({ role: "admin" })).toBe("abm.projekte.spalten.v2.demo-admin");

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
