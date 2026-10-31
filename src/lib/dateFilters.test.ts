import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import {
  dateFilterFromParam,
  dateFilterToParam,
  describeDateFilter,
  filterFromDraft,
  matchesDateFilter,
  parseGermanDate,
  presetRange,
  type DateFilter,
} from "./dateFilters";
import { clearFilters, DEFAULT_FILTERS, filterProjects, filtersFromParams, filtersToParams, hasActiveFilters, loadSavedFilters, saveFilters } from "./projectFilters";
import { groupProjects } from "./projectGrouping";
import type { KeyValueStore } from "./projectColumns";
import type { Project } from "./types";

const TODAY = "2026-10-31"; // Samstag
const db = buildDemoDataset("2026-10-09");
const ctx = { steps: db.stepDefinitions, companies: db.companies, today: TODAY };
const base = db.projects.find((p) => p.status === "aktiv")!;

/** Testprojekte mit festen Terminen; alle aktiv, damit nur der Datumsfilter wirkt. */
function proj(id: string, steps: Project["steps"], extra: Partial<Project> = {}): Project {
  return { ...base, id, bauherrLabel: id, status: "aktiv", steps, ...extra };
}
const P = [
  proj("sep30", { plangespraech: "2026-09-30" }),
  proj("okt01", { plangespraech: "2026-10-01", baugenehmigung: "2026-10-20" }),
  proj("okt05", { plangespraech: "2026-10-05" }),
  proj("okt10", { plangespraech: "2026-10-10", baugenehmigung: "2026-11-02" }),
  proj("okt11", { plangespraech: "2026-10-11" }),
  proj("okt31", { plangespraech: "2026-10-31", baugenehmigung: "2026-10-31" }),
  proj("nov01", { plangespraech: "2026-11-01" }),
  proj("leer", {}),
];
const ids = (dates: Record<string, DateFilter>, f = {}) =>
  filterProjects(P, "alle", { ...DEFAULT_FILTERS, ...f, dates }, ctx)
    .map((p) => p.id)
    .sort();

describe("Datumsfilter: Treffer", () => {
  it("genaues Datum", () => {
    expect(ids({ plangespraech: { mode: "genau", date: "2026-10-05" } })).toEqual(["okt05"]);
  });

  it("Zeitraum 1.–10. Oktober: beide Grenztage zählen mit", () => {
    expect(ids({ plangespraech: { mode: "zeitraum", from: "2026-10-01", to: "2026-10-10" } })).toEqual(["okt01", "okt05", "okt10"]);
  });

  it("Zeitraum 1.–31. Oktober: 30.09. und 01.11. nicht, 01.10. und 31.10. schon", () => {
    expect(ids({ plangespraech: { mode: "zeitraum", from: "2026-10-01", to: "2026-10-31" } })).toEqual(["okt01", "okt05", "okt10", "okt11", "okt31"]);
  });

  it("nur von / nur bis (einschließlich), Projekte ohne Datum fallen weg", () => {
    expect(ids({ plangespraech: { mode: "zeitraum", from: "2026-10-31", to: null } })).toEqual(["nov01", "okt31"]);
    expect(ids({ plangespraech: { mode: "zeitraum", from: null, to: "2026-10-01" } })).toEqual(["okt01", "sep30"]);
  });

  it("kein Datum / hat Datum", () => {
    expect(ids({ plangespraech: { mode: "leer" } })).toEqual(["leer"]);
    expect(ids({ plangespraech: { mode: "vorhanden" } })).not.toContain("leer");
    expect(ids({ plangespraech: { mode: "vorhanden" } })).toHaveLength(7);
    expect(ids({ baugenehmigung: { mode: "leer" } })).toEqual(["leer", "nov01", "okt05", "okt11", "sep30"]);
  });

  it("mehrere Datumsfilter verknüpfen sich mit UND, ebenso mit Suche und anderen Filtern", () => {
    const oktober: DateFilter = { mode: "zeitraum", from: "2026-10-01", to: "2026-10-31" };
    expect(ids({ plangespraech: oktober, baugenehmigung: oktober })).toEqual(["okt01", "okt31"]);
    expect(ids({ plangespraech: oktober, baugenehmigung: { mode: "vorhanden" } })).toEqual(["okt01", "okt10", "okt31"]);
    expect(ids({ plangespraech: oktober, baugenehmigung: oktober }, { q: "okt31" })).toEqual(["okt31"]);
    expect(ids({ plangespraech: oktober }, { company: "gibt-es-nicht" })).toEqual([]);
  });

  it("Tab-Filter wirkt weiter (abgeschlossene/stornierte bleiben getrennt)", () => {
    const list = [...P, proj("storno", { plangespraech: "2026-10-05" }, { status: "storno" })];
    const f = { ...DEFAULT_FILTERS, dates: { plangespraech: { mode: "genau", date: "2026-10-05" } as DateFilter } };
    expect(filterProjects(list, "alle", f, ctx).map((p) => p.id)).toEqual(["okt05"]);
    expect(filterProjects(list, "alle", { ...f, storno: true }, ctx).map((p) => p.id)).toEqual(["okt05", "storno"]);
  });

  it("vergleicht Kalendertage als Text, unabhängig von der Zeitzone (auch mit angehängter Uhrzeit)", () => {
    const f: DateFilter = { mode: "zeitraum", from: "2026-10-01", to: "2026-10-31" };
    expect(matchesDateFilter("2026-10-31", f, TODAY)).toBe(true);
    expect(matchesDateFilter("2026-10-31T23:30:00+02:00", f, TODAY)).toBe(true);
    expect(matchesDateFilter("2026-11-01T00:30:00+01:00", f, TODAY)).toBe(false);
    expect(matchesDateFilter("2026-10-01T00:00:00Z", f, TODAY)).toBe(true);
  });
});

describe("Datumsfilter: Schnellauswahl", () => {
  it("Woche Montag bis Sonntag, Monat, letzter Monat (auch über den Jahreswechsel), Jahr", () => {
    expect(presetRange("woche", TODAY)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(presetRange("woche", "2026-10-26")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(presetRange("woche", "2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(presetRange("monat", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("monat", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(presetRange("letzter_monat", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("letzter_monat", "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetRange("jahr", TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("wird mit dem heutigen Tag aufgelöst", () => {
    expect(ids({ plangespraech: { mode: "relativ", preset: "monat" } })).toEqual(["okt01", "okt05", "okt10", "okt11", "okt31"]);
    expect(ids({ plangespraech: { mode: "relativ", preset: "woche" } })).toEqual(["nov01", "okt31"]);
    expect(ids({ plangespraech: { mode: "relativ", preset: "letzter_monat" } })).toEqual(["sep30"]);
    expect(describeDateFilter({ mode: "relativ", preset: "monat" }, TODAY)).toBe("Dieser Monat (01.10.2026 bis 31.10.2026)");
  });
});

describe("Datumsfilter: Eingabe", () => {
  it("deutsches Format, auch kurz; ungültige Tage werden erkannt", () => {
    expect(parseGermanDate("01.10.2026")).toBe("2026-10-01");
    expect(parseGermanDate("1.10.2026")).toBe("2026-10-01");
    expect(parseGermanDate(" 1.10.26 ")).toBe("2026-10-01");
    expect(parseGermanDate("2026-10-01")).toBe("2026-10-01");
    expect(parseGermanDate("")).toBeNull();
    expect(parseGermanDate("31.02.2026")).toBe("invalid");
    expect(parseGermanDate("29.02.2026")).toBe("invalid");
    expect(parseGermanDate("29.02.2028")).toBe("2028-02-29");
    expect(parseGermanDate("10/01/2026")).toBe("invalid");
    expect(parseGermanDate("morgen")).toBe("invalid");
  });

  it("falsche Eingaben und von nach bis ergeben eine Meldung statt eines Filters", () => {
    const d = { date: "", from: "", to: "" };
    expect(filterFromDraft({ ...d, mode: "genau", date: "32.10.2026" })).toEqual({ error: expect.stringContaining("kein gültiges Datum") });
    expect(filterFromDraft({ ...d, mode: "genau" })).toEqual({ error: "Bitte ein Datum eingeben." });
    expect(filterFromDraft({ ...d, mode: "zeitraum" })).toEqual({ error: expect.stringContaining("„Von“, „Bis“") });
    expect(filterFromDraft({ ...d, mode: "zeitraum", from: "abc" })).toEqual({ error: expect.stringContaining("„Von“ ist kein gültiges Datum") });
    expect(filterFromDraft({ ...d, mode: "zeitraum", from: "10.10.2026", to: "01.10.2026" })).toEqual({
      error: "„Von“ (10.10.2026) liegt nach „Bis“ (01.10.2026).",
    });
    expect(filterFromDraft({ ...d, mode: "zeitraum", from: "01.10.2026", to: "01.10.2026" })).toEqual({ filter: { mode: "zeitraum", from: "2026-10-01", to: "2026-10-01" } });
    expect(filterFromDraft({ ...d, mode: "zeitraum", to: "10.10.2026" })).toEqual({ filter: { mode: "zeitraum", from: null, to: "2026-10-10" } });
    expect(filterFromDraft({ ...d, mode: "leer", date: "Unsinn" })).toEqual({ filter: { mode: "leer" } });
  });

  it("Beschriftung der Chips", () => {
    expect(describeDateFilter({ mode: "zeitraum", from: "2026-10-01", to: "2026-10-10" }, TODAY)).toBe("01.10.2026 bis 10.10.2026");
    expect(describeDateFilter({ mode: "zeitraum", from: "2026-10-01", to: null }, TODAY)).toBe("ab 01.10.2026");
    expect(describeDateFilter({ mode: "zeitraum", from: null, to: "2026-10-10" }, TODAY)).toBe("bis 10.10.2026");
    expect(describeDateFilter({ mode: "genau", date: "2026-10-05" }, TODAY)).toBe("05.10.2026");
    expect(describeDateFilter({ mode: "leer" }, TODAY)).toBe("kein Datum");
    expect(describeDateFilter({ mode: "vorhanden" }, TODAY)).toBe("hat Datum");
  });
});

describe("Datumsfilter: URL, Speichern, Zurücksetzen", () => {
  const all: DateFilter[] = [
    { mode: "genau", date: "2026-10-05" },
    { mode: "zeitraum", from: "2026-10-01", to: "2026-10-10" },
    { mode: "zeitraum", from: "2026-10-01", to: null },
    { mode: "zeitraum", from: null, to: "2026-10-10" },
    { mode: "leer" },
    { mode: "vorhanden" },
    { mode: "relativ", preset: "letzter_monat" },
  ];

  it("jeder Filter übersteht den Weg über die URL", () => {
    for (const f of all) expect(dateFilterFromParam(dateFilterToParam(f))).toEqual(f);
    const filters = { ...DEFAULT_FILTERS, q: "ulm", dates: { plangespraech: all[1], baugenehmigung: all[4] } };
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
    expect(filtersToParams(filters).get("d_plangespraech")).toBe("2026-10-01..2026-10-10");
  });

  it("Unlesbares in der URL fällt weg, statt eine leere Liste zu erzeugen", () => {
    for (const raw of ["", "..", "2026-02-31", "2026-10-10..2026-10-01", "gestern", "01.10.2026", "2026-10-01..x"]) expect(dateFilterFromParam(raw)).toBeNull();
    expect(filtersFromParams(new URLSearchParams("d_plangespraech=kaputt&d_unbekannt=leer")).dates).toEqual({});
  });

  it("Speichern und Laden je Benutzer, ohne Suche; Zurücksetzen entfernt den Eintrag; gesperrter Speicher wirft nicht", () => {
    const mem = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
    const f = { ...DEFAULT_FILTERS, q: "suche", phase: "baugenehmigung", dates: { plangespraech: all[1] } };
    saveFilters("k", f, store);
    const loaded = filtersFromParams(loadSavedFilters("k", store)!);
    expect(loaded).toEqual({ ...f, q: "" });
    expect(loadSavedFilters("anderer", store)).toBeNull();

    const reset = clearFilters(f);
    expect(hasActiveFilters(reset)).toBe(false);
    saveFilters("k", reset, store);
    expect(mem.has("k")).toBe(false);

    mem.set("k", "%%%kaputt");
    expect(loadSavedFilters("k", store)).toBeNull();
    const broken: KeyValueStore = {
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
    expect(loadSavedFilters("k", broken)).toBeNull();
    expect(() => saveFilters("k", f, broken)).not.toThrow();
  });

  it("Zurücksetzen behält Sortierung und Stornierte", () => {
    const f = { ...DEFAULT_FILTERS, q: "x", sort: "abm" as const, storno: true, dates: { plangespraech: all[0] } };
    expect(clearFilters(f)).toEqual({ ...DEFAULT_FILTERS, sort: "abm", storno: true });
  });
});

describe("Datumsfilter mit Gruppierung", () => {
  it("Gruppen enthalten nur gefilterte Projekte, leere Gruppen entstehen nicht", () => {
    const list = filterProjects(P, "alle", { ...DEFAULT_FILTERS, dates: { baugenehmigung: { mode: "zeitraum", from: "2026-10-01", to: "2026-10-31" } } }, ctx);
    const groups = groupProjects(list, { mode: "monat", date: "plangespraech" }, { companies: db.companies, team: db.team, salespeople: db.salespeople })!;
    expect(groups.map((g) => [g.key, g.rows.map((p) => p.id)])).toEqual([["2026-10", ["okt01", "okt31"]]]);
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
  });
});
