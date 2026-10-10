/** "Schöne" Achsenwerte ab 0: 0, 2, 4 … oder 0, 5, 10 … Die Achse beginnt immer bei 0. */
export function niceTicks(maxValue: number, target = 4): number[] {
  if (!(maxValue > 0)) return [0, 1];
  const rough = maxValue / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const stepClean = step < 1 ? step : Math.max(1, Math.round(step));
  const ticks: number[] = [];
  for (let v = 0; v < maxValue + stepClean * 0.999; v += stepClean) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Kompakte Achsenbeschriftung: 1.200 → 1,2 Tsd. */
export function compact(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tsd.`;
  return v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Monotone kubische Interpolation (Fritsch-Carlson) als Bézier-Segmente.
 * Weiche Linie ohne Überschwingen: zwischen zwei Punkten bleibt die Kurve immer zwischen deren Werten.
 * Liefert je Segment die zwei Kontrollpunkte und den Endpunkt.
 */
export function monotoneSegments(pts: Pt[]): { c1: Pt; c2: Pt; to: Pt }[] {
  const n = pts.length;
  if (n < 2) return [];
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
  }
  // Tangenten: Mittel der Nachbarsteigungen, an Extremstellen 0
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  m.push(slope[n - 2]);
  // Fritsch-Carlson: Tangenten begrenzen, damit die Kurve monoton bleibt
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 * a * slope[i]) / h;
      m[i + 1] = (3 * b * slope[i]) / h;
    }
  }
  return pts.slice(0, -1).map((p, i) => ({
    c1: { x: p.x + dx[i] / 3, y: p.y + (m[i] * dx[i]) / 3 },
    c2: { x: pts[i + 1].x - dx[i] / 3, y: pts[i + 1].y - (m[i + 1] * dx[i]) / 3 },
    to: pts[i + 1],
  }));
}

export function monotonePath(pts: Pt[]): string {
  if (!pts.length) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  return `M${r(pts[0].x)},${r(pts[0].y)}` + monotoneSegments(pts).map((s) => `C${r(s.c1.x)},${r(s.c1.y)} ${r(s.c2.x)},${r(s.c2.y)} ${r(s.to.x)},${r(s.to.y)}`).join("");
}

/** Veränderung in Prozent gegenüber dem Vorwert; null, wenn der Vorwert 0 ist oder fehlt. */
export function trendPercent(previous: number | undefined, current: number | undefined): number | null {
  if (previous == null || current == null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
