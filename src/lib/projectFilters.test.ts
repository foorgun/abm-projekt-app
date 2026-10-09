import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import {
  compareAbm,
  DEFAULT_FILTERS,
  filterProjects,
  filtersFromParams,
  filtersToParams,
  matchesQuery,
  nextTaskFor,
  sortProjects,
} from "./projectFilters";

const db = buildDemoDataset("2026-10-09");
const ctx = { steps: db.stepDefinitions, companies: db.companies };
const reinhardt = db.projects.find((p) => p.bauherrLabel === "Reinhardt")!;

describe("Suche", () => {
  it("findet ABM-Nr. auch mit Leerzeichen oder ohne Bindestrich", () => {
    expect(matchesQuery(reinhardt, "8161-101")).toBe(true);
    expect(matchesQuery(reinhardt, "8161 101")).toBe(true);
    expect(matchesQuery(reinhardt, "8161101")).toBe(true);
    expect(matchesQuery(reinhardt, "8161-102")).toBe(false);
  });

  it("findet Bauherr, Ort und Firma, Groß/Klein egal, mehrere Wörter UND-verknüpft", () => {
    expect(matchesQuery(reinhardt, "reinh")).toBe(true);
    expect(matchesQuery(reinhardt, "Reinhardt Ulm")).toBe(true);
    expect(matchesQuery(reinhardt, "Reinhardt Senden")).toBe(false);
    expect(matchesQuery(reinhardt, "zenker", "Bien-Zenker")).toBe(true);
  });

  it("vereinheitlicht Umlaute", () => {
    const p = { ...reinhardt, bauherrLabel: "Müller" };
    expect(matchesQuery(p, "mueller")).toBe(true);
    expect(matchesQuery(p, "Müll")).toBe(true);
  });
});

describe("Filter", () => {
  it("Tabs trennen Aktiv und Abgeschlossen, Storno nur auf Wunsch", () => {
    const alle = filterProjects(db.projects, "alle", DEFAULT_FILTERS, ctx);
    const aktiv = filterProjects(db.projects, "aktiv", DEFAULT_FILTERS, ctx);
    const fertig = filterProjects(db.projects, "abgeschlossen", DEFAULT_FILTERS, ctx);
    expect(alle.some((p) => p.status === "storno")).toBe(false);
    expect(aktiv.every((p) => p.status === "aktiv")).toBe(true);
    expect(fertig.every((p) => p.status === "abgeschlossen")).toBe(true);
    expect(alle.length).toBe(aktiv.length + fertig.length);
    expect(filterProjects(db.projects, "alle", { ...DEFAULT_FILTERS, storno: true }, ctx).length).toBe(db.projects.length);
  });

  it("Filter sind kombinierbar", () => {
    const f = { ...DEFAULT_FILTERS, company: "c-bz", architect: reinhardt.architectId!, phase: "baugenehmigung" };
    const res = filterProjects(db.projects, "aktiv", f, ctx);
    expect(res).toContainEqual(reinhardt);
    expect(res.every((p) => p.companyId === "c-bz" && p.architectId === reinhardt.architectId)).toBe(true);
  });

  it("Filter ohne Firma", () => {
    const res = filterProjects(db.projects, "alle", { ...DEFAULT_FILTERS, company: "-" }, ctx);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((p) => p.companyId === null)).toBe(true);
  });

  it("Filter überleben den Weg über die URL", () => {
    const f = { ...DEFAULT_FILTERS, q: "ulm", company: "c-lh", sort: "abm" as const, storno: true, group: true };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe("");
  });
});

describe("Sortierung", () => {
  it("vergleicht ABM-Nummern numerisch, Bauvoranfragen ans Ende", () => {
    expect(["8161-101", "8161-99", "Bauvoranfrage", "8185-1"].sort(compareAbm)).toEqual(["8161-99", "8161-101", "8185-1", "Bauvoranfrage"]);
  });

  it("Eingang: neueste zuerst", () => {
    const s = sortProjects(db.projects, "eingang", db.stepDefinitions);
    for (let i = 1; i < s.length; i++) expect((s[i - 1].intakeMonth ?? "") >= (s[i].intakeMonth ?? "")).toBe(true);
  });
});

describe("Nächste Aufgabe", () => {
  it("nimmt die früheste offene", () => {
    const tasks = [
      { ...db.tasks[0], id: "a", projectId: "x", status: "offen" as const, dueOn: "2026-10-20" },
      { ...db.tasks[0], id: "b", projectId: "x", status: "offen" as const, dueOn: "2026-10-10" },
      { ...db.tasks[0], id: "c", projectId: "x", status: "erledigt" as const, dueOn: "2026-10-01" },
    ];
    expect(nextTaskFor("x", tasks)?.id).toBe("b");
    expect(nextTaskFor("y", tasks)).toBeNull();
  });
});
