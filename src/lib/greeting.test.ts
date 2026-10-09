import { describe, expect, it } from "vitest";
import { greeting } from "./greeting";
import { DEMO_USER, firstName } from "./session";

const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m);

describe("greeting", () => {
  it("wechselt um 11 und um 17 Uhr", () => {
    expect(greeting(at(6))).toBe("Guten Morgen");
    expect(greeting(at(10, 59))).toBe("Guten Morgen");
    expect(greeting(at(11))).toBe("Guten Tag");
    expect(greeting(at(16, 59))).toBe("Guten Tag");
    expect(greeting(at(17))).toBe("Guten Abend");
    expect(greeting(at(23))).toBe("Guten Abend");
  });

  it("nimmt den Vornamen aus dem Benutzer", () => {
    expect(firstName(DEMO_USER)).toBe("Mehmet");
    expect(firstName({ name: "Ada Lovelace", role: "mitarbeiter" })).toBe("Ada");
    expect(DEMO_USER.role).toBe("admin");
  });
});
