import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, FilePlus2, ListTodo, Menu as MenuIcon, Plus, Search } from "lucide-react";
import { Badge, Button, IconButton, Menu } from "../ui";

export function Header({
  onOpenDrawer,
  alertCount,
  onNewProject,
  onNewTask,
}: {
  onOpenDrawer: () => void;
  alertCount: number;
  onNewProject: () => void;
  onNewTask: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrow();

  // Strg+K / Cmd+K fokussiert die Suche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="header">
      <IconButton className="header-menu" label="Navigation öffnen" onClick={onOpenDrawer}>
        <MenuIcon size={18} />
      </IconButton>

      <div className="header-search" role="search">
        <Search size={16} aria-hidden />
        <input
          ref={searchRef}
          type="search"
          placeholder={narrow ? "Suchen" : "Projekte, Bauherren, ABM-Nr. durchsuchen"}
          aria-label="Projekte, Bauherren, ABM-Nr. durchsuchen"
        />
        <kbd aria-hidden>Strg K</kbd>
      </div>

      <div className="header-spacer" />

      <div className="header-actions">
        <IconButton label={alertCount ? `Warnungen: ${alertCount}` : "Keine Warnungen"} variant="default">
          <Bell size={17} />
          {alertCount > 0 && (
            <span className="icon-dot">
              <Badge tone="danger">{alertCount}</Badge>
            </span>
          )}
        </IconButton>
        <div className="btn-split">
          <Button variant="primary" icon={<Plus size={16} />} onClick={onNewProject} aria-label="Neues Projekt">
            <span className="header-new-label">Neues Projekt</span>
          </Button>
          <Menu
            items={[
              { label: "Neues Projekt", icon: <FilePlus2 size={14} />, onSelect: onNewProject },
              { label: "Neue Aufgabe", icon: <ListTodo size={14} />, onSelect: onNewTask },
            ]}
            trigger={(p) => (
              <Button variant="primary" {...p} aria-label="Weitere Aktionen">
                <ChevronDown size={16} />
              </Button>
            )}
          />
        </div>
      </div>
    </header>
  );
}

/** true unter 640 px Breite (kürzerer Platzhalter in der Suche). */
function useNarrow() {
  const query = "(max-width: 640px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}
