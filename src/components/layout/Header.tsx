import { useEffect, useState } from "react";
import { Bell, ChevronDown, FilePlus2, ListTodo, Menu as MenuIcon, Plus } from "lucide-react";
import { HeaderSearch } from "./HeaderSearch";
import { Link } from "react-router-dom";
import type { Alert } from "../../lib/alerts";
import { SEVERITY_TONE } from "../../lib/alertUi";
import { projectTitle } from "../../lib/projects";
import { useData } from "../../lib/store";
import { Badge, Button, IconButton, Menu, Popover } from "../ui";

export function Header({
  onOpenDrawer,
  alerts,
  onNewProject,
  onNewTask,
}: {
  onOpenDrawer: () => void;
  alerts: Alert[];
  onNewProject: () => void;
  onNewTask: () => void;
}) {
  const narrow = useNarrow();
  const { data } = useData();
  const alertCount = alerts.length;

  return (
    <header className="header">
      <IconButton className="header-menu" label="Navigation öffnen" onClick={onOpenDrawer}>
        <MenuIcon size={18} />
      </IconButton>

      <HeaderSearch placeholder={narrow ? "Suchen" : "Projekte, Bauherren, ABM-Nr. durchsuchen"} />

      <div className="header-spacer" />

      <div className="header-actions">
        <Popover
          label="Warnungen"
          trigger={(p) => (
            <IconButton {...p} label={alertCount ? `Warnungen: ${alertCount}` : "Keine Warnungen"} variant="default">
              <Bell size={17} />
              {alertCount > 0 && (
                <span className="icon-dot">
                  <Badge tone="danger">{alertCount}</Badge>
                </span>
              )}
            </IconButton>
          )}
        >
          {(close) => (
            <>
              <div className="popover-head">Warnungen</div>
              {alertCount === 0 ? (
                <p className="popover-empty">Keine offenen Warnungen.</p>
              ) : (
                <ul className="popover-list">
                  {alerts.slice(0, 5).map((a) => {
                    const p = data?.projects.find((x) => x.id === a.projectId);
                    return (
                      <li key={a.id}>
                        <Link to={`/projekte/${a.projectId}`} className="popover-item" onClick={close}>
                          <span className="popover-dot" data-tone={SEVERITY_TONE[a.severity]} aria-hidden />
                          <span className="list-item-main">
                            <span className="list-item-title">{a.title}</span>
                            <span className="list-item-sub">
                              {p ? projectTitle(p) : ""} · {a.detail}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link to="/" className="popover-foot" onClick={close}>
                Alle im Dashboard ansehen
              </Link>
            </>
          )}
        </Popover>
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
