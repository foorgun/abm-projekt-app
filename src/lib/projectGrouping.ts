// Gruppierung der Projektliste (Knopf "Gruppierung"): nach Monat oder Jahr eines Termins, oder nach Fertighausfirma,
// Bundesland, Planer, Architekt, Verkäufer. Reine Funktionen (getestet); die Auswahl wird je Benutzer im Browser
// gespeichert wie die Spalten. Die Gruppen nehmen die Zeilen in der Reihenfolge, in der sie kommen (Sortierung bleibt).

import { bundeslandName } from "./bundesland";
import { formatMonth } from "./format";
import { browserStore, type KeyValueStore } from "./projectColumns";
import type { Company, Project, Salesperson, TeamMember } from "./types";

export type GroupMode = "keine" | "monat" | "jahr" | "firma" | "bundesland" | "planer" | "architekt" | "verkaeufer";
/** Datum für Monat/Jahr: einer der Excel-Termine (Schlüssel aus step_definitions) oder der Eingangsmonat ("anlage"). */
export type GroupDate = "plangespraech" | "baugesuch_uebergabe" | "vertrag_versendet" | "vertrag_zurueck" | "baugenehmigung" | "anlage";

export interface GroupSetting {
  mode: GroupMode;
  date: GroupDate;
}

export const GROUP_MODES: readonly { key: GroupMode; label: string }[] = [
  { key: "keine", label: "Keine" },
  { key: "monat", label: "Monat" },
  { key: "jahr", label: "Jahr" },
  { key: "firma", label: "Fertighausfirma" },
  { key: "bundesland", label: "Bundesland" },
  { key: "planer", label: "Planer" },
  { key: "architekt", label: "Architekt" },
  { key: "verkaeufer", label: "Verkäufer" },
];

export const GROUP_DATES: readonly { key: GroupDate; label: string }[] = [
  { key: "plangespraech", label: "Plan-Gespräch" },
  { key: "baugesuch_uebergabe", label: "Übergabe Baugesuch" },
  { key: "vertrag_versendet", label: "ABM-Vertrag versendet" },
  { key: "vertrag_zurueck", label: "ABM-Vertrag zurück" },
  { key: "baugenehmigung", label: "Baugenehmigung" },
  { key: "anlage", label: "Anlage des Projekts (Eingangsmonat)" },
];

/**
 * Standard für Monat/Jahr: Plan-Gespräch. In der Excel-Liste fällt das Plan-Gespräch fast immer in den Monat der
 * Monatsüberschrift (114 von 123 Projekten mit Datum), die anderen Termine liegen meist später.
 */
export const DEFAULT_GROUPING: GroupSetting = { mode: "keine", date: "plangespraech" };

export interface ProjectGroup {
  key: string;
  title: string;
  rows: Project[];
}

const NONE = "\u0000"; // Schlüssel der Restgruppe ("Ohne …"), sortiert immer ans Ende

export function groupDateOf(p: Project, date: GroupDate): string | null {
  return (date === "anlage" ? p.intakeMonth : p.steps[date]) ?? null;
}

const REST_TITLE: Record<Exclude<GroupMode, "keine">, string> = {
  monat: "Ohne Datum",
  jahr: "Ohne Datum",
  firma: "Ohne Fertighausfirma",
  bundesland: "Ohne Bundesland",
  planer: "Ohne Planer",
  architekt: "Ohne Architekt",
  verkaeufer: "Ohne Verkäufer",
};

/**
 * Teilt die (schon gefilterten und sortierten) Projekte in Gruppen. Monat/Jahr: neueste zuerst; sonst alphabetisch.
 * Die Restgruppe ("Ohne Datum", "Ohne Planer" …) steht am Ende. Ohne Gruppierung: null.
 */
export function groupProjects(
  projects: Project[],
  setting: GroupSetting,
  ctx: { companies: Company[]; team: TeamMember[]; salespeople: Salesperson[] },
): ProjectGroup[] | null {
  const mode = setting.mode;
  if (mode === "keine") return null;
  const name = <T extends { id: string; name: string }>(list: T[], id: string | null, label: (x: T) => string = (x) => x.name) => {
    const x = id ? list.find((y) => y.id === id) : undefined;
    return x ? label(x) : null;
  };
  const member = (m: TeamMember) => (m.code ? `${m.code} (${m.name})` : m.name);
  const keyOf = (p: Project): string | null => {
    switch (mode) {
      case "monat":
        return groupDateOf(p, setting.date)?.slice(0, 7) ?? null;
      case "jahr":
        return groupDateOf(p, setting.date)?.slice(0, 4) ?? null;
      case "firma":
        return name(ctx.companies, p.companyId);
      case "bundesland":
        return p.bundesland || null;
      case "planer":
        return name(ctx.team, p.planerId, member);
      case "architekt":
        return name(ctx.team, p.architectId, member);
      case "verkaeufer":
        return name(ctx.salespeople, p.salespersonId);
    }
  };
  const map = new Map<string, Project[]>();
  for (const p of projects) {
    const k = keyOf(p) ?? NONE;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  const byDate = mode === "monat" || mode === "jahr";
  const keys = [...map.keys()].sort((a, b) => {
    if (a === NONE || b === NONE) return a === NONE ? (b === NONE ? 0 : 1) : -1;
    return byDate ? b.localeCompare(a) : a.localeCompare(b, "de");
  });
  const title = (k: string) => {
    if (k === NONE) return REST_TITLE[mode];
    if (mode === "monat") return formatMonth(k);
    if (mode === "bundesland") return `${k} · ${bundeslandName(k) ?? k}`;
    return k;
  };
  return keys.map((k) => ({ key: k === NONE ? "ohne" : k, title: title(k), rows: map.get(k)! }));
}

/** Text des Knopfs: "Gruppierung" oder "Gruppierung: Monat (Plan-Gespräch)". */
export function groupingLabel(s: GroupSetting): string {
  if (s.mode === "keine") return "Gruppierung";
  const mode = GROUP_MODES.find((m) => m.key === s.mode)!.label;
  const date = s.mode === "monat" || s.mode === "jahr" ? ` (${GROUP_DATES.find((d) => d.key === s.date)!.label})` : "";
  return `Gruppierung: ${mode}${date}`;
}

export function normalizeGrouping(raw: unknown): GroupSetting {
  const r = (raw ?? {}) as { mode?: unknown; date?: unknown };
  const mode = GROUP_MODES.find((m) => m.key === r.mode)?.key ?? DEFAULT_GROUPING.mode;
  const date = GROUP_DATES.find((d) => d.key === r.date)?.key ?? DEFAULT_GROUPING.date;
  return { mode, date };
}

/** Speicherschlüssel je Benutzer (wie bei den Spalten). */
export function groupingStorageKey(user: { id?: string; role: string }): string {
  return `abm.projekte.gruppierung.v1.${user.id ?? `demo-${user.role}`}`;
}

export function loadGrouping(key: string, store: KeyValueStore | null = browserStore()): GroupSetting {
  try {
    const raw = store?.getItem(key);
    return raw ? normalizeGrouping(JSON.parse(raw)) : DEFAULT_GROUPING;
  } catch {
    return DEFAULT_GROUPING;
  }
}

/** Speichern; "Keine" setzt zurück (Eintrag entfernt, beim nächsten Mal gilt wieder das Standarddatum). */
export function saveGrouping(key: string, s: GroupSetting, store: KeyValueStore | null = browserStore()): void {
  try {
    if (s.mode === "keine") store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(s));
  } catch {
    // nur für diesen Besuch
  }
}
