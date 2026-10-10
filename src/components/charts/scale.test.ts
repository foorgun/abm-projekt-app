import { describe, expect, it } from "vitest";
import { monotonePath, monotoneSegments, niceTicks, trendPercent } from "./scale";

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

describe("monotone Linie", () => {
  const values = [5, 0, 0, 12, 3, 3, 40, 39, 0, 8];
  const pts = values.map((y, x) => ({ x: x * 10, y }));

  it("schwingt nicht über: jedes Segment bleibt zwischen seinen Endpunkten", () => {
    const segs = monotoneSegments(pts);
    expect(segs).toHaveLength(pts.length - 1);
    segs.forEach((s, i) => {
      const lo = Math.min(pts[i].y, pts[i + 1].y) - 1e-9;
      const hi = Math.max(pts[i].y, pts[i + 1].y) + 1e-9;
      for (const c of [s.c1, s.c2]) {
        expect(c.y, `Segment ${i}`).toBeGreaterThanOrEqual(lo);
        expect(c.y, `Segment ${i}`).toBeLessThanOrEqual(hi);
      }
    });
  });

  it("geht nie unter 0, wenn alle Werte ≥ 0 sind", () => {
    for (const s of monotoneSegments(pts)) expect(Math.min(s.c1.y, s.c2.y)).toBeGreaterThanOrEqual(0);
  });

  it("läuft durch alle Punkte und kommt mit 0, 1 und 2 Punkten klar", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([{ x: 1, y: 2 }])).toBe("M1,2");
    expect(monotonePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toMatch(/^M0,0C.* 10,5$/);
    const path = monotonePath(pts);
    for (const p of pts.slice(1)) expect(path).toContain(` ${p.x},${p.y}`);
  });
});

describe("trendPercent", () => {
  it("rechnet gegenüber dem Vorwert", () => {
    expect(trendPercent(100, 112)).toBe(12);
    expect(trendPercent(50, 25)).toBe(-50);
    expect(trendPercent(0, 10)).toBeNull();
    expect(trendPercent(undefined, 10)).toBeNull();
  });
});
