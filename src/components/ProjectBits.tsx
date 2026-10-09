// Kleine, wiederverwendbare Darstellungen rund um Projekte (Liste, Pipeline, Detail).

import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import type { Alert } from "../lib/alerts";
import { SEVERITY_LABEL, SEVERITY_TONE } from "../lib/alertUi";
import type { Phase } from "../lib/projects";
import type { ProjectStatus } from "../lib/types";
import { Pill, type Tone } from "./ui";

export const STATUS_LABEL: Record<ProjectStatus, string> = { aktiv: "Aktiv", abgeschlossen: "Abgeschlossen", storno: "Storno" };
const STATUS_TONE: Record<ProjectStatus, Tone> = { aktiv: "accent", abgeschlossen: "ok", storno: "neutral" };

export function StatusPill({ status }: { status: ProjectStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function PhasePill({ phase }: { phase: Phase }) {
  return (
    <Pill tone="outline" dot={false}>
      {phase.label}
    </Pill>
  );
}

/** Warn-Icon mit der dringendsten Warnung als Tooltip; Text für Screenreader, nicht nur Farbe. */
export function WarnIcon({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  const top = alerts[0];
  const Icon = top.severity === "dringend" ? AlertTriangle : top.severity === "hinweis" ? CircleAlert : Info;
  const text = alerts.map((a) => `${SEVERITY_LABEL[a.severity]}: ${a.title} (${a.detail})`).join(" · ");
  // Nativer Titel statt eigener Blase: Tabellen scrollen in einem Container, der eine Blase abschneiden würde
  return (
    <span className="warn-icon" data-tone={SEVERITY_TONE[top.severity]} role="img" aria-label={text} title={text}>
      <Icon size={16} aria-hidden />
    </span>
  );
}
