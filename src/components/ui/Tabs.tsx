import type { ReactNode } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  count?: number;
}

/**
 * Tab-Leiste. `variant="segmented"` für Filter (Heute · Woche · …), `"line"` für Seitenbereiche.
 * Die Pfeiltasten wechseln den Tab (WAI-ARIA Tabs-Muster).
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  variant = "line",
  label,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  variant?: "line" | "segmented";
  label: string;
}) {
  function onKey(e: React.KeyboardEvent, idx: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].key);
    const buttons = (e.currentTarget.parentElement?.querySelectorAll("[role=tab]") ?? []) as NodeListOf<HTMLElement>;
    buttons[next]?.focus();
  }
  return (
    <div className={variant === "segmented" ? "segmented" : "tabs"} role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          className="tab"
          aria-selected={t.key === value}
          tabIndex={t.key === value ? 0 : -1}
          onClick={() => onChange(t.key)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {t.count != null && <span className="badge">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
