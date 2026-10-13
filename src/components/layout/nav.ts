import type { LucideIcon } from "lucide-react";
import {
  BookUser,
  Bot,
  CalendarOff,
  ClipboardCheck,
  Columns3,
  Files,
  FolderCheck,
  FolderOpen,
  Folders,
  LayoutDashboard,
  ListTodo,
  Mail,
  Receipt,
} from "lucide-react";
import type { AppRole } from "../../lib/session";

export type CountKey = "tasks" | "review";

/** Erklärung der Zahl am Navigationseintrag (Tooltip und Screenreader). */
export const COUNT_HINT: Record<CountKey, string> = {
  tasks: "heute fällig und überfällig",
  review: "offene Prüfungen",
};

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: CountKey;
  /** Rollen, die den Eintrag NICHT sehen. */
  hiddenFor?: AppRole[];
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavEntry[];
}

export const NAV: NavGroup[] = [
  { label: "Übersicht", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  {
    label: "Projekte",
    items: [
      { to: "/projekte", label: "Alle Projekte", icon: Folders, end: true },
      { to: "/projekte/aktiv", label: "Aktive Projekte", icon: FolderOpen },
      { to: "/projekte/abgeschlossen", label: "Abgeschlossene Projekte", icon: FolderCheck },
      { to: "/pipeline", label: "Pipeline", icon: Columns3 },
    ],
  },
  {
    label: "Arbeit",
    items: [
      { to: "/aufgaben", label: "Aufgaben", icon: ListTodo, count: "tasks", hiddenFor: ["freiberufler"] },
      // Dokumente sehen auch Freiberufler (nur die ihrer zugewiesenen Projekte)
      { to: "/dokumente", label: "Dokumente", icon: Files },
      { to: "/rechnungen", label: "Rechnungen", icon: Receipt, hiddenFor: ["freiberufler"] },
      // Urlaub und Krankheit: nur Admin und Mitarbeiter (auch Route und Datenbank weisen Freiberufler ab)
      { to: "/abwesenheit", label: "Abwesenheit", icon: CalendarOff, hiddenFor: ["freiberufler"] },
    ],
  },
  {
    label: "Posteingang-Agent",
    items: [
      { to: "/agent", label: "Agent-Dashboard", icon: Bot, end: true, hiddenFor: ["freiberufler"] },
      { to: "/agent/pruefung", label: "Prüfliste", icon: ClipboardCheck, count: "review", hiddenFor: ["freiberufler"] },
      { to: "/agent/postfaecher", label: "Postfächer", icon: Mail, hiddenFor: ["freiberufler"] },
    ],
  },
  { label: "Adressbuch", items: [{ to: "/kontakte", label: "Kontakte", icon: BookUser, soon: true }] },
];
