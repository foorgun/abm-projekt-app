import type { CSSProperties } from "react";

/** Platzhalter während des Ladens. Maße sind Layout, keine Farben, deshalb inline. */
export function Skeleton({ w = "100%", h = 12, round }: { w?: number | string; h?: number | string; round?: boolean }) {
  const style: CSSProperties = { width: w, height: h };
  if (round) style.borderRadius = "var(--r-ctl)";
  return <span className="skeleton" style={style} aria-hidden />;
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Wird geladen">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}>
                <Skeleton w={60} h={10} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  <Skeleton w={c === 0 ? 110 : 70 + ((r * 17 + c * 23) % 50)} h={12} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
