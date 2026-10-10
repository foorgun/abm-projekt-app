import { useId, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { ChartTable } from "./ChartTable";
import { compact, monotoneSegments, niceTicks, type Pt } from "./scale";
import { useWidth } from "./useWidth";

export interface AreaSeries {
  name: string;
  values: number[];
  /** "teal" = Hauptserie, "neutral" = helle Vergleichsserie */
  tone?: "teal" | "neutral";
}

export interface AreaLabel {
  label: string;
  /** Langer Name für Tooltip und Tabelle */
  title?: string;
}

const PAD = { top: 14, right: 14, bottom: 28, left: 44 };

/**
 * Flächendiagramm für Verläufe über die Zeit (Design v2, docs/design-v2.md):
 * weiche Linie ohne Überschwingen (monotone Interpolation), Verlauf unter der Linie, dezentes Leuchten,
 * Punkte mit Ring, sehr leise horizontale Gitterlinien, Achse ab 0, Tooltip beim Hover, Tabellenansicht.
 * Animation nur ohne prefers-reduced-motion (per CSS). Für Zählwerte weiter Säulen verwenden.
 */
export function AreaChart({
  labels,
  series,
  caption,
  height = 240,
  format = (v) => v.toLocaleString("de-DE"),
  axisFormat = compact,
  partialLast = false,
  partialNote = "laufend, unvollständig",
}: {
  labels: AreaLabel[];
  series: AreaSeries[];
  caption: string;
  height?: number;
  /** Werte im Tooltip und in der Tabelle */
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  /**
   * Die letzte Periode läuft noch (z. B. der aktuelle Monat): Ihr Abschnitt wird gestrichelt gezeichnet, der Punkt hohl,
   * und die gefüllte Fläche endet bei der letzten vollständigen Periode. So wirkt ein halber Monat nicht wie ein Einbruch.
   */
  partialLast?: boolean;
  /** Zusatz im Tooltip und in der Tabelle für die unvollständige Periode */
  partialNote?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  const n = labels.length;
  const ticks = niceTicks(Math.max(0, ...series.flatMap((s) => s.values)));
  const max = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const x = (i: number) => PAD.left + i * step;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const base = y(0);
  // Bei schmalen Diagrammen nur jede zweite Beschriftung, gezählt vom Ende (jüngste Periode immer beschriftet)
  const labelEvery = step < 34 ? 2 : 1;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round((e.clientX - rect.left) / (step || 1)))));
  }

  const rnd = (v: number) => Math.round(v * 100) / 100;
  const partial = partialLast && n > 2;
  // Index des letzten vollständigen Punkts
  const solidEnd = partial ? n - 2 : n - 1;
  const paths = series.map((s) => {
    const pts: Pt[] = s.values.map((v, i) => ({ x: x(i), y: y(v) }));
    // Tangenten über ALLE Punkte berechnen (monoton, kein Überschwingen), erst danach in "fest" und "gestrichelt" teilen
    const segs = monotoneSegments(pts);
    const seg = (g: (typeof segs)[number]) => `C${rnd(g.c1.x)},${rnd(g.c1.y)} ${rnd(g.c2.x)},${rnd(g.c2.y)} ${rnd(g.to.x)},${rnd(g.to.y)}`;
    const start = pts.length ? `M${rnd(pts[0].x)},${rnd(pts[0].y)}` : "";
    const line = start + segs.slice(0, solidEnd).map(seg).join("");
    const dashed = partial ? `M${rnd(pts[solidEnd].x)},${rnd(pts[solidEnd].y)}${seg(segs[solidEnd])}` : "";
    return { s, pts, line, dashed, area: pts.length ? `${line}L${x(solidEnd)},${base}L${x(0)},${base}Z` : "" };
  });
  const noteFor = (i: number) => (partial && i === n - 1 ? ` (${partialNote})` : "");

  return (
    <div className="chart area-chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={caption}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`${uid}-g${si}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="area-stop-top" data-tone={s.tone ?? "teal"} />
              <stop offset="100%" className="area-stop-bottom" data-tone={s.tone ?? "teal"} />
            </linearGradient>
          ))}
        </defs>
        <g className="chart-grid area-grid">
          {ticks.map((t) => (
            <line key={t} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        {ticks.map((t) => (
          <text key={t} className="chart-tick" x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end">
            {axisFormat(t)}
          </text>
        ))}
        {/* neutrale Serie zuerst, Hauptserie (Teal) liegt oben */}
        {[...paths].reverse().map(({ s, line, dashed, area }, ri) => {
          const si = series.length - 1 - ri;
          return (
            <g key={s.name} data-tone={s.tone ?? "teal"} className="area-series">
              <path className="area-fill" d={area} fill={`url(#${uid}-g${si})`} />
              <path className="area-line" d={line} pathLength={1} />
              {dashed && <path className="area-line-partial" d={dashed} />}
            </g>
          );
        })}
        {paths.map(({ s, pts }) =>
          pts.map((p, i) => (
            <circle
              key={`${s.name}-${i}`}
              className="area-dot"
              data-tone={s.tone ?? "teal"}
              data-active={hover === i}
              data-partial={partial && i === n - 1}
              cx={p.x}
              cy={p.y}
              r={hover === i ? 4.5 : 3.5}
            />
          )),
        )}
        {labels.map((l, i) =>
          (n - 1 - i) % labelEvery === 0 ? (
            <text key={l.label + i} className="chart-cat" data-current={!partial && i === n - 1} data-partial={partial && i === n - 1} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
              {l.label}
            </text>
          ) : null,
        )}
        {hover != null && <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} />}
        <rect className="chart-hit" x={PAD.left - step / 2} y={PAD.top} width={innerW + step} height={innerH} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div className="chart-tooltip" style={{ left: Math.min(Math.max(x(hover), 90), width - 90), top: Math.min(...series.map((s) => y(s.values[hover] ?? 0))) }}>
          <div className="chart-tooltip-title">
            {labels[hover].title ?? labels[hover].label}
            {noteFor(hover)}
          </div>
          {series.map((s) => (
            <div className="chart-tooltip-row" key={s.name}>
              <span className="swatch" data-tone={s.tone ?? "teal"} />
              {s.name}
              <strong>{format(s.values[hover] ?? 0)}</strong>
            </div>
          ))}
        </div>
      )}
      <ChartTable caption={caption} head={[" ", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [`${l.title ?? l.label}${noteFor(i)}`, ...series.map((s) => format(s.values[i] ?? 0))])} />
    </div>
  );
}

/** Legende für das Flächendiagramm (ab zwei Serien immer zeigen). */
export function AreaLegend({ series }: { series: AreaSeries[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span className="legend-item" key={s.name}>
          <span className="swatch swatch-line" data-tone={s.tone ?? "teal"} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/**
 * Trend-Pill für den Kartenkopf: Pfeil und Prozent gegenüber der Vorperiode.
 * Neutral gehalten (keine Wertung über Farbe); der Text sagt, womit verglichen wird.
 */
export function TrendPill({ percent, against = "Vormonat", label }: { percent: number | null; against?: string; /** sichtbarer Zusatz, z. B. "Sep ggü. Aug" */ label?: string }) {
  if (percent == null) return null;
  const up = percent >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="trend-pill" title={`${up ? "+" : "−"}${Math.abs(percent)} % gegenüber ${against}`}>
      <Icon size={14} aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(percent)} %
      {label ? <span className="trend-pill-label">{label}</span> : <span className="sr-only"> gegenüber {against}</span>}
    </span>
  );
}
