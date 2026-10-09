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
