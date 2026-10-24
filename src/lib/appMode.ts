// Pilot-Modus für die Testphase: Build-Variable VITE_APP_MODE. "pilot" zeigt nur Projektliste, Projekt anlegen
// (mit Dokument lesen), Projekt-Detail (Prozess, Übersicht, Dokumente, Planungsprotokoll, Verlauf), Einstellungen und Hilfe.
// Nicht gesetzt oder "voll": alles wie bisher. Ausgeblendete Bereiche bleiben im Code und in der Datenbank, sie sind
// nur nicht erreichbar. Zugriffsschutz bleibt Sache der Datenbank (RLS); das hier ist reine Oberfläche.

import type { AlertKind } from "./alerts";
import type { AppRole } from "./session";

export type AppMode = "pilot" | "voll";

type ModeEnv = { VITE_APP_MODE?: string };

/** Modus aus der Build-Variable. Alles außer "pilot" (Groß-/Kleinschreibung egal) heißt "voll". */
export function appMode(env: ModeEnv = import.meta.env as ModeEnv): AppMode {
  return env.VITE_APP_MODE?.trim().toLowerCase() === "pilot" ? "pilot" : "voll";
}

export function isPilot(env?: ModeEnv): boolean {
  return appMode(env) === "pilot";
}

/** Startseite: im Pilot die Projektliste statt des Dashboards. */
export function homePath(pilot = isPilot()): string {
  return pilot ? PILOT_HOME : "/";
}

export const PILOT_HOME = "/projekte";

/**
 * Im Pilot erlaubte Routen (ohne führenden Schrägstrich, ":id" = ein Pfadteil). Aktiv/Abgeschlossen sind die Reiter
 * der Projektliste (kein eigener Menüpunkt), der Brotkrumen-Link im Projekt zeigt auf "projekte/aktiv".
 */
export const PILOT_ROUTES: { path: string; roles?: AppRole[] }[] = [
  { path: "projekte" },
  { path: "projekte/aktiv" },
  { path: "projekte/abgeschlossen" },
  { path: "projekte/:id" },
  // für alle: die Darstellung (hell/dunkel) ist persönlich; Bürodaten pflegt trotzdem nur ein Admin (Seite und Datenbank)
  { path: "einstellungen" },
  { path: "hilfe" },
];

/** Menüpunkte der Seitenleiste im Pilot (Ziele aus nav.ts bzw. der unteren Leiste). */
export const PILOT_NAV: { to: string; roles?: AppRole[] }[] = [{ to: "/projekte" }, { to: "/einstellungen" }, { to: "/hilfe" }];

/** Reiter im Projekt-Detail, die im Pilot sichtbar bleiben (zusätzlich gelten die Rollenregeln der Seite). */
export const PILOT_PROJECT_TABS = ["uebersicht", "dokumente", "planungsprotokoll", "aktivitaet"] as const;

/** Warnungen, die im Pilot erscheinen: nur solche zum Prozess, keine zu Rechnungen. */
export const PILOT_ALERT_KINDS: AlertKind[] = ["contract_open", "permit_waiting"];

function matches(pattern: string, path: string): boolean {
  const a = pattern.split("/");
  const b = path.split("/");
  return a.length === b.length && a.every((seg, i) => (seg.startsWith(":") ? b[i] !== "" : seg === b[i]));
}

/** Ist der Pfad im Pilot für diese Rolle erreichbar? Pfad wie location.pathname (mit oder ohne Schrägstriche). */
export function allowedInPilot(pathname: string, role: AppRole): boolean {
  const path = pathname.replace(/^\/+|\/+$/g, "");
  return PILOT_ROUTES.some((r) => matches(r.path, path) && (!r.roles || r.roles.includes(role)));
}

/** Ziel der Umleitung, oder null, wenn die Seite angezeigt werden darf. Außerhalb des Pilots immer null. */
export function pilotRedirect(pathname: string, role: AppRole, pilot = isPilot()): string | null {
  if (!pilot) return null;
  return allowedInPilot(pathname, role) ? null : PILOT_HOME;
}

/** Menüeintrag im Pilot sichtbar? */
export function pilotNavAllows(to: string, role: AppRole): boolean {
  return PILOT_NAV.some((n) => n.to === to && (!n.roles || n.roles.includes(role)));
}
