import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROUPING,
  groupingLabel,
  groupingStorageKey,
  groupProjects,
  loadGrouping,
  normalizeGrouping,
  saveGrouping,
} from "./projectGrouping";
import type { Company, Project, Salesperson, TeamMember } from "./types";

const base: Project = {
  id: "",
  abmNr: null,
  kind: "neubau",
  status: "aktiv",
  companyId: null,
  salespersonId: null,
  bauherrLabel: "",
  location: null,
  architectId: null,
  planerId: null,
  baubetreuung: null,
  intakeMonth: null,
  notes: null,
  steps: {},
};
const p = (id: string, x: Partial<Project> = {}): Project => ({ ...base, id, bauherrLabel: id, ...x });

const companies: Company[] = [
  { id: "c-bz", name: "Bien-Zenker", numberPrefix: "8161" } as Company,
  { id: "c-sh", name: "Schwabenhaus", numberPrefix: "8185" } as Company,
];
const team: TeamMember[] = [{ id: "t-mc", name: "M. Muster", code: "Mc", role: "planer" } as TeamMember];
const salespeople: Salesperson[] = [{ id: "s1", name: "Verkauf Eins", companyId: "c-bz" } as Salesperson];
const ctx = { companies, team, salespeople };

// schon sortiert (ABM-Nr. numerisch): Reihenfolge innerhalb der Gruppen muss erhalten bleiben
const list = [
  p("a", { abmNr: "8161-633", steps: { plangespraech: "2026-10-02" }, intakeMonth: "2026-09-01", companyId: "c-bz", bundesland: "BW", planerId: "t-mc", salespersonId: "s1" }),
  p("b", { abmNr: "8161-1588", steps: { plangespraech: "2026-10-20", vertrag_versendet: "2026-11-03" }, intakeMonth: "2026-10-01", companyId: "c-bz", bundesland: "BY" }),
  p("c", { abmNr: "8185-12", steps: { plangespraech: "2026-08-14" }, intakeMonth: "2026-08-01", companyId: "c-sh", bundesland: "BW" }),
  p("d", { abmNr: "8185-40", intakeMonth: "2026-10-01" }),
];

describe("Gruppierung der Projektliste", () => {
  it("Keine (Standard): keine Gruppen", () => {
    expect(DEFAULT_GROUPING).toEqual({ mode: "keine", date: "plangespraech" });
    expect(groupProjects(list, DEFAULT_GROUPING, ctx)).toBeNull();
  });

  it("Monat nach Plan-Gespräch: neueste zuerst, Titel mit Monat, 'Ohne Datum' am Ende, Reihenfolge innen bleibt", () => {
    const g = groupProjects(list, { mode: "monat", date: "plangespraech" }, ctx)!;
    expect(g.map((x) => x.title)).toEqual(["Oktober 2026", "August 2026", "Ohne Datum"]);
    expect(g.map((x) => x.rows.length)).toEqual([2, 1, 1]);
    expect(g[0].rows.map((r) => r.abmNr)).toEqual(["8161-633", "8161-1588"]);
    expect(g.at(-1)!.rows.map((r) => r.id)).toEqual(["d"]);
  });

  it("Monat nach anderem Datum: ABM-Vertrag versendet bzw. Anlage (Eingangsmonat)", () => {
    const v = groupProjects(list, { mode: "monat", date: "vertrag_versendet" }, ctx)!;
    expect(v.map((x) => [x.title, x.rows.length])).toEqual([["November 2026", 1], ["Ohne Datum", 3]]);
    const a = groupProjects(list, { mode: "monat", date: "anlage" }, ctx)!;
    expect(a.map((x) => [x.title, x.rows.length])).toEqual([["Oktober 2026", 2], ["September 2026", 1], ["August 2026", 1]]);
  });

  it("Jahr, Fertighausfirma, Bundesland, Planer, Verkäufer mit Restgruppe am Ende", () => {
    expect(groupProjects(list, { mode: "jahr", date: "plangespraech" }, ctx)!.map((x) => [x.title, x.rows.length])).toEqual([["2026", 3], ["Ohne Datum", 1]]);
    expect(groupProjects(list, { mode: "firma", date: "plangespraech" }, ctx)!.map((x) => [x.title, x.rows.length])).toEqual([
      ["Bien-Zenker", 2],
      ["Schwabenhaus", 1],
      ["Ohne Fertighausfirma", 1],
    ]);
    expect(groupProjects(list, { mode: "bundesland", date: "plangespraech" }, ctx)!.map((x) => x.title)).toEqual(["BW · Baden-Württemberg", "BY · Bayern", "Ohne Bundesland"]);
    expect(groupProjects(list, { mode: "planer", date: "plangespraech" }, ctx)!.map((x) => [x.title, x.rows.length])).toEqual([["Mc (M. Muster)", 1], ["Ohne Planer", 3]]);
    expect(groupProjects(list, { mode: "verkaeufer", date: "plangespraech" }, ctx)!.map((x) => x.title)).toEqual(["Verkauf Eins", "Ohne Verkäufer"]);
    expect(groupProjects(list, { mode: "architekt", date: "plangespraech" }, ctx)!.map((x) => x.title)).toEqual(["Ohne Architekt"]);
  });

  it("zählt nur, was übergeben wird (gefiltert, z. B. Freiberufler nur zugewiesene Projekte)", () => {
    const g = groupProjects(list.slice(0, 1), { mode: "monat", date: "plangespraech" }, ctx)!;
    expect(g).toEqual([{ key: "2026-10", title: "Oktober 2026", rows: [list[0]] }]);
    expect(groupProjects([], { mode: "monat", date: "plangespraech" }, ctx)).toEqual([]);
  });

  it("Knopftext", () => {
    expect(groupingLabel(DEFAULT_GROUPING)).toBe("Gruppierung");
    expect(groupingLabel({ mode: "monat", date: "plangespraech" })).toBe("Gruppierung: Monat (Plan-Gespräch)");
    expect(groupingLabel({ mode: "firma", date: "plangespraech" })).toBe("Gruppierung: Fertighausfirma");
  });

  it("speichern je Benutzer, laden, 'Keine' setzt zurück; Unlesbares ergibt den Standard", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    const key = groupingStorageKey({ id: "u1", role: "mitarbeiter" });
    expect(key).toBe("abm.projekte.gruppierung.v1.u1");
    expect(groupingStorageKey({ role: "admin" })).toBe("abm.projekte.gruppierung.v1.demo-admin");
    saveGrouping(key, { mode: "monat", date: "baugenehmigung" }, store);
    expect(loadGrouping(key, store)).toEqual({ mode: "monat", date: "baugenehmigung" });
    expect(loadGrouping(groupingStorageKey({ id: "u2", role: "mitarbeiter" }), store)).toEqual(DEFAULT_GROUPING);
    saveGrouping(key, { mode: "keine", date: "baugenehmigung" }, store);
    expect(m.has(key)).toBe(false);
    expect(loadGrouping(key, store)).toEqual(DEFAULT_GROUPING);
    m.set(key, "{kaputt");
    expect(loadGrouping(key, store)).toEqual(DEFAULT_GROUPING);
    expect(normalizeGrouping({ mode: "status", date: "x" })).toEqual(DEFAULT_GROUPING);
    const broken = { getItem: () => { throw new Error("gesperrt"); }, setItem: () => { throw new Error("gesperrt"); }, removeItem: () => { throw new Error("gesperrt"); } };
    expect(() => saveGrouping(key, { mode: "jahr", date: "anlage" }, broken)).not.toThrow();
    expect(loadGrouping(key, broken)).toEqual(DEFAULT_GROUPING);
  });
});
