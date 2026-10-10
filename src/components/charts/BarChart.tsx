import { useState } from "react";
import { ChartTable } from "./ChartTable";
import { compact, niceTicks } from "./scale";
import { useWidth } from "./useWidth";

export interface BarSeries {
  name: string;
}

export interface BarDatum {
  label: string;
  /** Langer Name für Tooltip und Tabelle (z. B. "März 2026" statt "Mär"). */
  title?: string;
  /** Ein Wert je Serie; mehrere Serien werden gestapelt. */
  values: number[];
}

const PAD = { top: 22, right: 8, bottom: 28, left: 40 };
const MAX_BAR = 16;
const GAP = 2; // Flächenfuge zwischen gestapelten Segmenten

/** Pfad für ein Rechteck mit 4 px gerundetem Datenende oben, eckig an der Basis. */
function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Säulendiagramm, eine Skala ab 0, Gitter nur horizontal, Werte per Tooltip. */
export function BarChart({
  data,
  series,
  height = 240,
  caption,
  unit = "",
  highlight,
  showValues = false,
  format = (v) => v.toLocaleString("de-DE"),
  axisFormat = compact,
  selected,
  onSelect,
}: {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  caption: string;
  unit?: string;
  /** Index der hervorgehobenen Kategorie (z. B. aktueller Monat). Alle anderen Säulen werden gedämpft. */
  highlight?: number;
  /** Summe über jeder Säule anzeigen (nur sinnvoll bei wenigen Kategorien). */
  showValues?: boolean;
  /** Werte über den Säulen, im Tooltip (Achse: axisFormat) */
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  /** Gewählte Kategorie (z. B. als Filter für eine Tabelle); alle anderen werden gedämpft. */
  selected?: number | null;
  /** Macht die Säulen anklickbar (Maus und Tastatur). Erneuter Klick auf die gewählte Säule hebt die Auswahl auf. */
  onSelect?: (index: number | null) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const max = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = data.length ? innerW / data.length : innerW;
  const barW = Math.min(MAX_BAR, band * 0.42);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  // Bei schmalen Diagrammen nur jede zweite Kategorie beschriften, gezählt vom Ende (jüngste Periode immer beschriftet)
  const labelEvery = band < 30 ? 2 : 1;

  const h = hover != null ? data[hover] : null;
  // Hervorgehoben ist die gewählte Säule, sonst die per Prop markierte (z. B. aktueller Monat)
  const emphasis = selected ?? highlight;
  const toggle = (i: number) => onSelect?.(selected === i ? null : i);

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={caption}>
        <g className="chart-grid">
          {ticks.map((t) => (
            <line key={t} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        {ticks.map((t) => (
          <text key={t} className="chart-tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
            {axisFormat(t)}
          </text>
        ))}
        {hover != null && (
          <rect className="chart-hover-band" x={PAD.left + band * hover + 2} y={PAD.top} width={band - 4} height={innerH} rx={6} />
        )}
        {data.map((d, i) => {
          const x = PAD.left + band * i + (band - barW) / 2;
          let acc = 0;
          const last = d.values.reduce((li, v, si) => (v > 0 ? si : li), -1);
          return (
            <g key={d.label + i}>
              {d.values.map((v, si) => {
                if (v <= 0) return null;
                const y0 = y(acc);
                acc += v;
                const top = y(acc);
                // Fuge: jedes Segment über dem ersten endet GAP über dem darunterliegenden
                const bottom = si === 0 ? y0 : y0 - GAP;
                const hh = Math.max(1, bottom - top);
                const muted = emphasis != null && emphasis !== i && hover !== i;
                return si === last ? (
                  <path key={si} className="bar" data-series={si + 1} data-muted={muted} d={topRounded(x, top, barW, hh)} />
                ) : (
                  <rect key={si} className="bar" data-series={si + 1} data-muted={muted} x={x} y={top} width={barW} height={hh} />
                );
              })}
              {showValues && totals[i] > 0 && (
                <text className="chart-value" data-current={emphasis === i} x={x + barW / 2} y={y(totals[i]) - 6} textAnchor="middle">
                  {format(totals[i])}
                </text>
              )}
              {(data.length - 1 - i) % labelEvery === 0 && (
                <text className="chart-cat" data-current={emphasis === i} x={x + barW / 2} y={height - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
              <rect
                className="chart-hit"
                data-clickable={Boolean(onSelect)}
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={innerH + PAD.bottom}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                {...(onSelect
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-pressed": selected === i,
                      "aria-label": `${d.title ?? d.label}: ${format(totals[i])}${selected === i ? ", Filter aktiv" : ", als Filter wählen"}`,
                      onClick: () => toggle(i),
                      onFocus: () => setHover(i),
                      onBlur: () => setHover(null),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(i);
                        }
                      },
                    }
                  : {})}
              />
            </g>
          );
        })}
        <line className="chart-baseline" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
      </svg>
      {h && hover != null && (
        <div className="chart-tooltip" style={{ left: PAD.left + band * hover + band / 2, top: y(totals[hover]) }}>
          <div className="chart-tooltip-title">{h.title ?? h.label}</div>
          {series.map((s, si) => (
            <div className="chart-tooltip-row" key={s.name}>
              {series.length > 1 && <span className="swatch" data-series={si + 1} />}
              {s.name}
              <strong>
                {format(h.values[si])}
                {unit}
              </strong>
            </div>
          ))}
          {series.length > 1 && (
            <div className="chart-tooltip-row">
              Summe
              <strong>{format(totals[hover])}</strong>
            </div>
          )}
        </div>
      )}
      <ChartTable
        caption={caption}
        head={[" ", ...series.map((s) => s.name)]}
        rows={data.map((d) => [d.title ?? d.label, ...d.values])}
      />
    </div>
  );
}

export function Legend({ series }: { series: BarSeries[] }) {
  return (
    <div className="legend">
      {series.map((s, i) => (
        <span className="legend-item" key={s.name}>
          <span className="swatch" data-series={i + 1} />
          {s.name}
        </span>
      ))}
    </div>
  );
}
