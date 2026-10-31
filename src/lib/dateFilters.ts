// Datumsfilter der Projektliste (Teil von ProjectFilters, Zustand in der URL wie die übrigen Filter).
// Reine Funktionen (getestet). Datumswerte sind Kalendertage "JJJJ-MM-TT" und werden als Text verglichen,
// nie über Date-Objekte in lokaler Zeit: so gibt es keine Verschiebung um einen Tag durch Zeitzonen.

import { addDays, formatDate } from "./format";
import type { Project } from "./types";

/** Datumsspalten der Liste (Schlüssel aus step_definitions, wie die Termin-Spalten in projectColumns). */
export type DateColumnKey = "plangespraech" | "baugesuch_uebergabe" | "vertrag_versendet" | "vertrag_zurueck" | "baugenehmigung";

export const DATE_COLUMNS: readonly { key: DateColumnKey; label: string }[] = [
  { key: "plangespraech", label: "Plan-Gespräch" },
  { key: "baugesuch_uebergabe", label: "Übergabe Baugesuch" },
  { key: "vertrag_versendet", label: "ABM-Vertrag versendet" },
  { key: "vertrag_zurueck", label: "ABM-Vertrag zurück" },
  { key: "baugenehmigung", label: "Baugenehmigung" },
];

export const DATE_COLUMN_LABEL = Object.fromEntries(DATE_COLUMNS.map((c) => [c.key, c.label])) as Record<DateColumnKey, string>;

export function isDateColumn(key: string): key is DateColumnKey {
  return DATE_COLUMNS.some((c) => c.key === key);
}

export type DatePreset = "woche" | "monat" | "letzter_monat" | "jahr";

export const DATE_PRESETS: readonly { key: DatePreset; label: string }[] = [
  { key: "woche", label: "Diese Woche" },
  { key: "monat", label: "Dieser Monat" },
  { key: "letzter_monat", label: "Letzter Monat" },
  { key: "jahr", label: "Dieses Jahr" },
];

/**
 * genau: ein Tag. zeitraum: von/bis einschließlich, eine Grenze darf fehlen. leer/vorhanden: kein Datum bzw. hat Datum.
 * relativ: Schnellauswahl, wird erst beim Filtern mit dem heutigen Tag aufgelöst (bleibt nach dem Speichern aktuell).
 */
export type DateFilter =
  | { mode: "genau"; date: string }
  | { mode: "zeitraum"; from: string | null; to: string | null }
  | { mode: "leer" }
  | { mode: "vorhanden" }
  | { mode: "relativ"; preset: DatePreset };

export type DateFilters = Partial<Record<DateColumnKey, DateFilter>>;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Gültiger Kalendertag als "JJJJ-MM-TT" (31.02. ist ungültig). */
export function isIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/**
 * Deutsche Eingabe "TT.MM.JJJJ" (auch "1.10.2026" oder "01.10.26") nach "JJJJ-MM-TT". Leer: null.
 * Ungültig: "invalid". "JJJJ-MM-TT" wird ebenfalls angenommen (Datumsauswahl des Browsers).
 */
export function parseGermanDate(input: string): string | null | "invalid" {
  const s = input.trim();
  if (!s) return null;
  if (isIsoDate(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (!m) return "invalid";
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : "invalid";
}

/** Zeitraum einer Schnellauswahl. Woche: Montag bis Sonntag. */
export function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const lastDay = (yy: number, mm: number) => String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, "0");
  const ym = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  switch (preset) {
    case "woche": {
      const [yy, mm, dd] = today.split("-").map(Number);
      const weekday = (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7; // Montag = 0
      const from = addDays(today, -weekday);
      return { from, to: addDays(from, 6) };
    }
    case "monat":
      return { from: `${ym(y, m)}-01`, to: `${ym(y, m)}-${lastDay(y, m)}` };
    case "letzter_monat": {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { from: `${ym(py, pm)}-01`, to: `${ym(py, pm)}-${lastDay(py, pm)}` };
    }
    case "jahr":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

/** Trifft der (Datums-)Wert den Filter? Nur der Tagesanteil zählt, falls doch einmal eine Uhrzeit mitkommt. */
export function matchesDateFilter(value: string | null | undefined, f: DateFilter, today: string): boolean {
  const day = value ? value.slice(0, 10) : null;
  switch (f.mode) {
    case "leer":
      return !day;
    case "vorhanden":
      return Boolean(day);
    case "genau":
      return day === f.date;
    case "zeitraum":
      return Boolean(day) && (!f.from || day! >= f.from) && (!f.to || day! <= f.to);
    case "relativ": {
      const r = presetRange(f.preset, today);
      return Boolean(day) && day! >= r.from && day! <= r.to;
    }
  }
}

/** Alle Datumsfilter mit UND. */
export function matchesDateFilters(p: Project, filters: DateFilters, today: string): boolean {
  return (Object.entries(filters) as [DateColumnKey, DateFilter][]).every(([key, f]) => matchesDateFilter(p.steps[key], f, today));
}

export function activeDateFilters(filters: DateFilters): [DateColumnKey, DateFilter][] {
  return DATE_COLUMNS.filter((c) => filters[c.key]).map((c) => [c.key, filters[c.key]!]);
}

/** Text des Filters, z. B. "01.10.2026 bis 10.10.2026", "ab 01.10.2026", "kein Datum". */
export function describeDateFilter(f: DateFilter, today: string): string {
  switch (f.mode) {
    case "leer":
      return "kein Datum";
    case "vorhanden":
      return "hat Datum";
    case "genau":
      return formatDate(f.date);
    case "zeitraum":
      if (f.from && f.to) return `${formatDate(f.from)} bis ${formatDate(f.to)}`;
      return f.from ? `ab ${formatDate(f.from)}` : `bis ${formatDate(f.to)}`;
    case "relativ": {
      const r = presetRange(f.preset, today);
      return `${DATE_PRESETS.find((p) => p.key === f.preset)!.label} (${formatDate(r.from)} bis ${formatDate(r.to)})`;
    }
  }
}

// URL: d_plangespraech=2026-10-05 | 2026-10-01..2026-10-10 | 2026-10-01.. | ..2026-10-10 | leer | hat | monat …
const PARAM_PREFIX = "d_";

export function dateFilterToParam(f: DateFilter): string {
  switch (f.mode) {
    case "leer":
      return "leer";
    case "vorhanden":
      return "hat";
    case "genau":
      return f.date;
    case "zeitraum":
      return `${f.from ?? ""}..${f.to ?? ""}`;
    case "relativ":
      return f.preset;
  }
}

/** Unlesbares (Tippfehler in der URL, "von" nach "bis") ergibt null: der Filter fällt weg, die Liste bleibt sichtbar. */
export function dateFilterFromParam(raw: string): DateFilter | null {
  if (raw === "leer") return { mode: "leer" };
  if (raw === "hat") return { mode: "vorhanden" };
  const preset = DATE_PRESETS.find((p) => p.key === raw);
  if (preset) return { mode: "relativ", preset: preset.key };
  if (isIsoDate(raw)) return { mode: "genau", date: raw };
  const m = /^([^.]*)\.\.([^.]*)$/.exec(raw);
  if (!m) return null;
  const from = m[1] || null;
  const to = m[2] || null;
  if ((!from && !to) || (from && !isIsoDate(from)) || (to && !isIsoDate(to)) || (from && to && from > to)) return null;
  return { mode: "zeitraum", from, to };
}

export function dateFiltersFromParams(sp: URLSearchParams): DateFilters {
  const out: DateFilters = {};
  for (const c of DATE_COLUMNS) {
    const raw = sp.get(PARAM_PREFIX + c.key);
    const f = raw ? dateFilterFromParam(raw) : null;
    if (f) out[c.key] = f;
  }
  return out;
}

export function dateFiltersToParams(filters: DateFilters, sp: URLSearchParams): void {
  for (const [key, f] of activeDateFilters(filters)) sp.set(PARAM_PREFIX + key, dateFilterToParam(f));
}

/** Eingabe im Auswahlfeld (Texte wie getippt) prüfen und in einen Filter umwandeln, sonst eine verständliche Meldung. */
export type DateFilterDraft = { mode: "genau" | "zeitraum" | "leer" | "vorhanden"; date: string; from: string; to: string };

export function draftFromFilter(f: DateFilter | undefined): DateFilterDraft {
  const empty = { date: "", from: "", to: "" };
  if (!f) return { mode: "zeitraum", ...empty };
  switch (f.mode) {
    case "genau":
      return { mode: "genau", ...empty, date: formatDate(f.date) };
    case "zeitraum":
      return { mode: "zeitraum", ...empty, from: f.from ? formatDate(f.from) : "", to: f.to ? formatDate(f.to) : "" };
    case "relativ":
      return { mode: "zeitraum", ...empty };
    default:
      return { mode: f.mode, ...empty };
  }
}

const FORMAT_HINT = "bitte als TT.MM.JJJJ eingeben, z. B. 01.10.2026";

export function filterFromDraft(d: DateFilterDraft): { filter: DateFilter } | { error: string } {
  if (d.mode === "leer" || d.mode === "vorhanden") return { filter: { mode: d.mode } };
  if (d.mode === "genau") {
    const date = parseGermanDate(d.date);
    if (date === null) return { error: "Bitte ein Datum eingeben." };
    if (date === "invalid") return { error: `„${d.date.trim()}“ ist kein gültiges Datum – ${FORMAT_HINT}.` };
    return { filter: { mode: "genau", date } };
  }
  const from = parseGermanDate(d.from);
  const to = parseGermanDate(d.to);
  if (from === "invalid") return { error: `„Von“ ist kein gültiges Datum – ${FORMAT_HINT}.` };
  if (to === "invalid") return { error: `„Bis“ ist kein gültiges Datum – ${FORMAT_HINT}.` };
  if (!from && !to) return { error: "Bitte „Von“, „Bis“ oder beides angeben." };
  if (from && to && from > to) return { error: `„Von“ (${formatDate(from)}) liegt nach „Bis“ (${formatDate(to)}).` };
  return { filter: { mode: "zeitraum", from, to } };
}
