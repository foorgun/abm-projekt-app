import { AlertTriangle, ChevronRight, CircleAlert, Info } from "lucide-react";
import { Link } from "react-router-dom";
import type { Alert } from "../lib/alerts";
import { SEVERITY_LABEL, SEVERITY_TONE } from "../lib/alertUi";
import { projectTitle } from "../lib/projects";
import type { Project } from "../lib/types";
import { Button, Pill } from "./ui";

const ICON = { dringend: AlertTriangle, hinweis: CircleAlert, info: Info };

/** Warnungen als Liste. Jede Zeile führt zum Projekt; Rechnungswarnungen haben eine Direktaktion. */
export function AlertList({
  alerts,
  projects,
  onMarkSent,
  limit,
}: {
  alerts: Alert[];
  projects: Map<string, Project>;
  onMarkSent?: (alert: Alert) => void;
  limit?: number;
}) {
  const shown = limit ? alerts.slice(0, limit) : alerts;
  return (
    <ul className="list alert-list">
      {shown.map((a) => {
        const Icon = ICON[a.severity];
        const p = projects.get(a.projectId);
        return (
          <li key={a.id} className="alert-row" data-severity={a.severity}>
            <Link to={`/projekte/${a.projectId}`} className="list-item alert-link">
              <span className="alert-icon" data-tone={SEVERITY_TONE[a.severity]} aria-hidden>
                <Icon size={16} />
              </span>
              <span className="list-item-main">
                <span className="list-item-title">{a.title}</span>
                <span className="list-item-sub">
                  {p ? projectTitle(p) : "Projekt"} · {a.detail}
                </span>
              </span>
              <Pill tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Pill>
              <ChevronRight size={16} className="alert-chevron" aria-hidden />
            </Link>
            {onMarkSent && (
              <span className="alert-action-slot">
                {a.kind === "invoice_unsent" && (
                  <Button size="sm" onClick={() => onMarkSent(a)}>
                    Als versendet markieren
                  </Button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
