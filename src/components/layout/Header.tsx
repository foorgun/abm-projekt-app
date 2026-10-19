import { Bell, Menu as MenuIcon, Plus } from "lucide-react";
import { HeaderSearch } from "./HeaderSearch";
import { Link } from "react-router-dom";
import type { Alert } from "../../lib/alerts";
import { isPilot } from "../../lib/appMode";
import { SEVERITY_TONE } from "../../lib/alertUi";
import { projectTitle } from "../../lib/projects";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import { NARROW, useMediaQuery } from "../../lib/useMedia";
import { Button, IconButton, Popover } from "../ui";

export function Header({
  onOpenDrawer,
  alerts,
  onNewProject,
}: {
  onOpenDrawer: () => void;
  alerts: Alert[];
  onNewProject: () => void;
}) {
  const narrow = useMediaQuery(NARROW);
  const { data } = useData();
  // Projekte und Aufgaben legen nur Admin und Mitarbeiter an
  const staff = useSession().user.role !== "freiberufler";
  const alertCount = alerts.length;

  return (
    <header className="header">
      <IconButton className="header-menu" label="Navigation öffnen" onClick={onOpenDrawer}>
        <MenuIcon size={18} />
      </IconButton>

      <HeaderSearch placeholder={narrow ? "Suchen" : "Projekte, Bauherren, ABM-Nr. durchsuchen"} onNewProject={onNewProject} />

      <div className="header-spacer" />

      <div className="header-actions">
        {/* Im Pilot ohne Glocke: die Warnungen stehen im Projekt selbst */}
        {!isPilot() && (
          <Popover
            label="Warnungen"
            trigger={(p) => (
              <IconButton {...p} label={alertCount ? `Warnungen: ${alertCount}` : "Keine Warnungen"} variant="ghost" className="bell">
                <Bell size={18} />
                {alertCount > 0 && (
                  <span className="bell-count" aria-hidden>
                    {alertCount > 9 ? "9+" : alertCount}
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
        )}
        {/* Ein einziger Hauptbutton; "Neue Aufgabe" gibt es auf der Aufgabenseite und per Strg+K */}
        {staff && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={onNewProject} aria-label="Neues Projekt">
            <span className="header-new-label">Neues Projekt</span>
          </Button>
        )}
      </div>
    </header>
  );
}
