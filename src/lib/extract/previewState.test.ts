import { describe, expect, it } from "vitest";
import { JPEG_QUALITY, MAX_IMAGE_EDGE } from "./pageImage";
import { clampPage, clampZoom, fitSize, PAGE_CACHE, parsePage, pinchZoom, RecentCache, scrollAfterZoom, sourcePage, stepZoom, VIEW_EDGE, wheelZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS } from "./previewState";

describe("Vorschau: Blättern", () => {
  it("hält die Seite im Dokument", () => {
    expect(clampPage(0, 7)).toBe(1);
    expect(clampPage(8, 7)).toBe(7);
    expect(clampPage(3, 7)).toBe(3);
    expect(clampPage(Number.NaN, 7)).toBe(1);
    expect(clampPage(2, 0)).toBe(1);
  });

  it("nimmt im Seitenfeld nur gültige Seitenzahlen", () => {
    expect(parsePage("3", 7)).toBe(3);
    expect(parsePage(" 7 ", 7)).toBe(7);
    for (const bad of ["", "0", "8", "-1", "2.5", "drei", "3a"]) expect(parsePage(bad, 7), bad).toBeNull();
  });

  it("springt aus der Feldliste nur auf Seiten, die es gibt", () => {
    expect(sourcePage(2, 7)).toBe(2);
    expect(sourcePage(8, 7)).toBeNull();
    expect(sourcePage(null, 7)).toBeNull();
    expect(sourcePage(0, 7)).toBeNull();
  });
});

describe("Vorschau: Zoom", () => {
  it("reicht von 100 bis 400 %", () => {
    expect([ZOOM_MIN, ZOOM_MAX]).toEqual([1, 4]);
    expect(ZOOM_STEPS[0]).toBe(1);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(4);
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("geht mit + und − durch die Stufen, auch von Zwischenwerten aus", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, 1)).toBe(2);
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(1, -1)).toBe(1);
    expect(stepZoom(2, -1)).toBe(1.5);
    expect(stepZoom(1.7, 1)).toBe(2);
    expect(stepZoom(1.7, -1)).toBe(1.5);
    let z = 1;
    for (let i = 0; i < 10; i++) z = stepZoom(z, 1);
    expect(z).toBe(4);
  });

  it("zoomt mit dem Mausrad stufenlos in den Grenzen", () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(2, 100)).toBeLessThan(2);
    expect(wheelZoom(1, 100)).toBe(1);
    expect(wheelZoom(4, -100)).toBe(4);
    // ein riesiger Ausschlag (Trackpad) springt nicht sofort ans Ende
    expect(wheelZoom(1, -5000)).toBeLessThan(1.3);
  });

  it("folgt bei der Zwei-Finger-Geste dem Verhältnis der Fingerabstände", () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(2, 100, 50)).toBe(1);
    expect(pinchZoom(2, 100, 1000)).toBe(4);
    expect(pinchZoom(2, 0, 100)).toBe(2);
  });

  it("passt die Seite ganz in den Kasten ein (100 %)", () => {
    expect(fitSize({ width: 1000, height: 1414 }, { width: 500, height: 600 })).toEqual({ width: 424, height: 600 });
    expect(fitSize({ width: 1414, height: 1000 }, { width: 500, height: 600 })).toEqual({ width: 500, height: 353 });
    expect(fitSize({ width: 0, height: 10 }, { width: 500, height: 600 })).toEqual({ width: 0, height: 0 });
  });

  it("hält beim Zoomen den Punkt unter dem Anker fest", () => {
    // Bild 400 breit, Fenster 400, Anker in der Mitte: nach Verdoppeln liegt die Mitte wieder in der Mitte
    expect(scrollAfterZoom(0, 200, 400, 800)).toBe(200);
    expect(scrollAfterZoom(200, 200, 800, 400)).toBe(0);
    expect(scrollAfterZoom(0, 0, 400, 800)).toBe(0);
    expect(scrollAfterZoom(10, 5, 0, 800)).toBe(0);
  });
});

describe("Vorschau: nur angesehene Seiten bleiben im Speicher", () => {
  it("behält die zuletzt benutzten Seiten, höchstens das Limit", () => {
    const c = new RecentCache<string>(3);
    for (const n of [1, 2, 3]) c.set(n, `s${n}`);
    expect(c.get(1)).toBe("s1"); // 1 ist jetzt die jüngste
    c.set(4, "s4");
    expect(c.keys()).toEqual([3, 1, 4]);
    expect(c.get(2)).toBeUndefined();
    c.clear();
    expect(c.keys()).toEqual([]);
    expect(PAGE_CACHE).toBeLessThanOrEqual(5);
  });

  it("die Anzeigegröße ändert nichts an dem, was zur Auslesung gesendet wird", () => {
    expect(MAX_IMAGE_EDGE).toBe(1568);
    expect(JPEG_QUALITY).toBe(0.85);
    expect(VIEW_EDGE).toBeGreaterThan(MAX_IMAGE_EDGE);
  });
});
