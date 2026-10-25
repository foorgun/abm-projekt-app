import { describe, expect, it } from "vitest";
import { addDays, formatDateTime, formatDue, formatMoney, formatRelative } from "./format";

const NOW = new Date(2026, 9, 9, 15, 30);

describe("formatRelative", () => {
  it("staffelt nach Abstand", () => {
    expect(formatRelative("2026-10-09T15:30:20", NOW)).toBe("gerade eben");
    expect(formatRelative("2026-10-09T15:18:00", NOW)).toBe("vor 12 Min.");
    expect(formatRelative("2026-10-09T08:02:00", NOW)).toBe("heute, 08:02");
    expect(formatRelative("2026-10-08T14:05:00", NOW)).toBe("gestern, 14:05");
    expect(formatRelative("2026-10-05T09:00:00", NOW)).toBe("vor 4 Tagen");
    expect(formatRelative("2026-09-01T09:00:00", NOW)).toBe("01.09.2026");
  });
});

describe("formatDateTime", () => {
  it("zeigt Datum und Uhrzeit, ein reines Datum ohne Uhrzeit", () => {
    expect(formatDateTime("2026-10-08T14:05:00")).toBe("08.10.2026, 14:05");
    expect(formatDateTime("2026-01-03T07:09:00")).toBe("03.01.2026, 07:09");
    expect(formatDateTime("2026-10-08")).toBe("08.10.2026");
  });
});

describe("Datum und Geld", () => {
  it("rechnet Tage über Monatsgrenzen", () => {
    expect(addDays("2026-10-09", -42)).toBe("2026-08-28");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("formatiert Euro ohne Cent, wenn glatt", () => {
    expect(formatMoney(1_000_000)).toBe("10.000\u00a0€");
    expect(formatMoney(123_456)).toBe("1.234,56\u00a0€");
  });
});

describe("formatDue", () => {
  it("heute, morgen, sonst TT.MM.", () => {
    expect(formatDue("2026-10-09", "2026-10-09")).toBe("heute");
    expect(formatDue("2026-10-10", "2026-10-09")).toBe("morgen");
    expect(formatDue("2026-10-03", "2026-10-09")).toBe("03.10.");
    expect(formatDue("2026-10-20", "2026-10-09")).toBe("20.10.");
  });

  it("anderes Jahr mit kurzer Jahreszahl", () => {
    expect(formatDue("2027-01-03", "2026-12-30")).toBe("03.01.27");
    expect(formatDue("2026-12-31", "2026-12-30")).toBe("morgen");
  });
});
