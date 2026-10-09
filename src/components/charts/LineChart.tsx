import { useState } from "react";
import { ChartTable } from "./ChartTable";
import { compact, niceTicks } from "./scale";
import { useWidth } from "./useWidth";

export interface LinePoint {
  label: string;
  title?: string;
  value: number;
}

const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

/** Liniendiagramm (eine Serie) mit Flächen-Hauch, Fadenkreuz und Tooltip. */
export function LineChart({ data, caption, name, height = 240 }: { data: LinePoint[]; caption: string; name: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)));
  const max = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i: number) => PAD.left + i * step;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = data.length ? `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - rect.left) / (step || 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  const h = hover != null ? data[hover] : null;
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
            {compact(t)}
          </text>
        ))}
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
        {data.map((d, i) => (
          <text key={d.label + i} className="chart-cat" x={x(i)} y={height - 8} textAnchor="middle">
            {d.label}
          </text>
        ))}
        {hover != null && (
          <>
            <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} />
            <circle className="chart-dot" cx={x(hover)} cy={y(data[hover].value)} r={5} />
          </>
        )}
        <rect className="chart-hit" x={PAD.left} y={PAD.top} width={innerW} height={innerH} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {h && hover != null && (
        <div className="chart-tooltip" style={{ left: x(hover), top: y(h.value) }}>
          <div className="chart-tooltip-title">{h.title ?? h.label}</div>
          <div className="chart-tooltip-row">
            {name}
            <strong>{h.value.toLocaleString("de-DE")}</strong>
          </div>
        </div>
      )}
      <ChartTable caption={caption} head={[" ", name]} rows={data.map((d) => [d.title ?? d.label, d.value])} />
    </div>
  );
}
