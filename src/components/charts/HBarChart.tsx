import { useState } from "react";
import { ChartTable } from "./ChartTable";
import { useWidth } from "./useWidth";

export interface HBarDatum {
  label: string;
  value: number;
}

const BAR = 14;

/**
 * Horizontales Balkendiagramm. Kategorien links, Wert direkt am Balkenende.
 * Die Labelspalte passt sich der Breite an (schmal auf Mobil).
 */
export function HBarChart({ data, caption, unit = "", rowHeight = 30 }: { data: HBarDatum[]; caption: string; unit?: string; rowHeight?: number }) {
  const ROW = rowHeight;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const labelW = Math.min(190, Math.max(132, width * 0.38));
  const valueW = 36;
  const innerW = Math.max(0, width - labelW - valueW);
  const max = Math.max(1, ...data.map((d) => d.value));
  const height = data.length * ROW + 4;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={caption}>
        <line className="chart-baseline" x1={labelW} x2={labelW} y1={0} y2={height - 4} />
        {data.map((d, i) => {
          const yMid = i * ROW + ROW / 2;
          const w = d.value > 0 ? Math.max(4, (d.value / max) * innerW) : 0;
          const r = Math.min(4, w / 2);
          const x = labelW;
          const y = yMid - BAR / 2;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {hover === i && <rect className="chart-hover-band" x={0} y={i * ROW + 1} width={width} height={ROW - 2} rx={6} />}
              <text className="chart-cat" x={labelW - 10} y={yMid} dy="0.32em" textAnchor="end">
                {truncate(d.label, labelW)}
              </text>
              {w > 0 && (
                <path
                  className="bar"
                  data-series={1}
                  d={`M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + BAR - r}Q${x + w},${y + BAR} ${x + w - r},${y + BAR}H${x}Z`}
                />
              )}
              <text className="chart-value" x={x + w + 8} y={yMid} dy="0.32em">
                {d.value.toLocaleString("de-DE")}
                {unit}
              </text>
              <title>{`${d.label}: ${d.value}${unit}`}</title>
            </g>
          );
        })}
      </svg>
      <ChartTable caption={caption} head={[" ", "Anzahl"]} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
}

function truncate(s: string, px: number) {
  const max = Math.floor((px - 14) / 6.6);
  return s.length > max ? `${s.slice(0, Math.max(3, max - 1))}…` : s;
}
