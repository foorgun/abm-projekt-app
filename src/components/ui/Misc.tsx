export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "sm" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className={size === "sm" ? "avatar avatar-sm" : "avatar"} aria-hidden>
      {initials}
    </span>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="progress" title={`${done} von ${total} Schritten`}>
      <span className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Fortschritt">
        <span className="progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular">
        {done}/{total}
      </span>
    </span>
  );
}
