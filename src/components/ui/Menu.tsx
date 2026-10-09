import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuEntry {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/**
 * Einfaches Dropdown-Menü. Schließt bei Klick außerhalb und mit Escape.
 * `trigger` bekommt die Props für den auslösenden Button.
 */
export function Menu({
  trigger,
  items,
  align = "right",
  side = "bottom",
  header,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  items: (MenuEntry | "sep")[];
  align?: "left" | "right";
  side?: "top" | "bottom";
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  }

  return (
    <span className="menu-wrap" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div className="menu" role="menu" data-align={align} data-side={side} onKeyDown={onMenuKey}>
          {header}
          {items.map((it, i) =>
            it === "sep" ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.icon}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </span>
  );
}
