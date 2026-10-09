import { describe, expect, it } from "vitest";
import { bucketOf, endOfWeek, matchesFilter } from "./tasks";
import type { Task } from "./types";

const TODAY = "2026-10-09"; // Freitag
const t = (dueOn: string | null, status: Task["status"] = "offen"): Task => ({
  id: dueOn ?? "x", projectId: null, title: "T", dueOn, assigneeId: null, status, source: "manuell", sourceKey: null, createdAt: "", doneAt: null,
});

describe("Aufgaben-Filter", () => {
  it("Woche endet am Sonntag, auch über Monatsgrenzen", () => {
    expect(endOfWeek("2026-10-09")).toBe("2026-10-11");
    expect(endOfWeek("2026-10-11")).toBe("2026-10-11");
    expect(endOfWeek("2026-09-28")).toBe("2026-10-04");
  });

  it("ordnet Fälligkeiten zu", () => {
    expect(bucketOf(t("2026-10-08"), TODAY)).toBe("ueberfaellig");
    expect(bucketOf(t(TODAY), TODAY)).toBe("heute");
    expect(bucketOf(t("2026-10-11"), TODAY)).toBe("woche");
    expect(bucketOf(t("2026-10-12"), TODAY)).toBe("spaeter");
    expect(bucketOf(t(null), TODAY)).toBe("ohne");
  });

  it("Diese Woche schließt heute ein, Erledigte nur im Filter Erledigt", () => {
    expect(matchesFilter(t(TODAY), "woche", TODAY)).toBe(true);
    expect(matchesFilter(t("2026-10-08"), "woche", TODAY)).toBe(false);
    expect(matchesFilter(t(TODAY, "erledigt"), "heute", TODAY)).toBe(false);
    expect(matchesFilter(t(TODAY, "erledigt"), "erledigt", TODAY)).toBe(true);
    expect(matchesFilter(t(null), "alle", TODAY)).toBe(true);
  });
});
