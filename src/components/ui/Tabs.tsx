import { useEffect, useRef, useState, type ReactNode } from "react";

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
  // Waagerecht scrollbar: am Rand ausblenden, solange dort noch Reiter folgen (Hinweis auf mehr Inhalt)
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<"none" | "start" | "end" | "both">("none");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 2;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setFade(start && end ? "both" : start ? "start" : end ? "end" : "none");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [items.length]);

  function onKey(e: React.KeyboardEvent, idx: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].key);
    const buttons = (e.currentTarget.parentElement?.querySelectorAll("[role=tab]") ?? []) as NodeListOf<HTMLElement>;
    buttons[next]?.focus();
  }
  return (
    <div ref={ref} className={variant === "segmented" ? "segmented" : "tabs"} role="tablist" aria-label={label} data-fade={fade}>
      {items.map((t, i) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          className="tab"
          aria-selected={t.key === value}
          tabIndex={t.key === value ? 0 : -1}
          onClick={(e) => {
            onChange(t.key);
            // gewählten Reiter ganz ins Bild holen
            e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          }}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {t.count != null && <span className="badge">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
