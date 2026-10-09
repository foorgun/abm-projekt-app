import { useEffect, useRef, useState, type ReactNode } from "react";

/** Aufklappbares Feld (z. B. Warnungen an der Glocke). Schließt bei Klick außerhalb und mit Escape. */
export function Popover({
  trigger,
  children,
  label,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" }) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="menu-wrap" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "dialog" })}
      {open && (
        <div className="popover" role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}
