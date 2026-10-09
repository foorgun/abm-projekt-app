import { describe, expect, it } from "vitest";
import { niceTicks } from "./scale";

describe("niceTicks", () => {
  it("beginnt bei 0 und deckt das Maximum ab", () => {
    const t = niceTicks(17);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(17);
    expect(t).toEqual([0, 5, 10, 15, 20]);
  });

  it("liefert ganzzahlige Schritte für kleine Zählwerte", () => {
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
  });

  it("kommt mit 0 und negativen Eingaben klar", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(-5)).toEqual([0, 1]);
  });
});
