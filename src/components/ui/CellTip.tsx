import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip für Tabellenzellen. Wird per Portal am Fenster positioniert, damit der scrollende Tabellencontainer
 * ihn nicht abschneidet. Erscheint bei Hover und Tastaturfokus; Escape schließt.
 */
export function CellTip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 90; // oben am Rand: unterhalb anzeigen
    setPos({ left: Math.min(Math.max(r.left, 12), window.innerWidth - 372), top: below ? r.bottom + 8 : r.top - 8, below });
  }

  return (
    <span
      ref={ref}
      className={["cell-tip", className].filter(Boolean).join(" ")}
      tabIndex={0}
      aria-describedby={pos ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
      onKeyDown={(e) => e.key === "Escape" && setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <span role="tooltip" id={id} className="cell-tip-bubble" data-below={pos.below} style={{ left: pos.left, top: pos.top }}>
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
