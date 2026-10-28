// Spalten der Projektliste: Auswahl (sichtbar/unsichtbar) und Reihenfolge, je Benutzer im Browser gespeichert.
// Reine Funktionen (getestet). Pfeil links (Verlauf) und "Projekt öffnen" rechts gehören nicht dazu: sie stehen immer da.
// Gespeichert wird nur lokal: ein Nutzerprofil in der Datenbank gibt es nicht (Anzeigename steht bei der Rolle, 0005).
// Standard = die Spalten der Excel-Projektliste in Excel-Reihenfolge, dahinter die Fertighausfirma-Nr. (Hausbau-Nr.).

export type ColumnKey =
  | "nr"
  | "firma"
  | "abm"
  | "bauherr"
  | "bl_ort"
  | "verkaeufer"
  | "architekt"
  | "planer"
  | "plangespraech"
  | "baugesuch_uebergabe"
  | "vertrag_versendet"
  | "vertrag_zurueck"
  | "baugenehmigung"
  | "baubetreuung"
  | "hausbau_nr"
  | "bundesland"
  | "ort";

/**
 * Alle wählbaren Spalten in der Grundreihenfolge (= Excel), Beschriftung wie in der Excel, aber in normaler Schreibweise.
 * Die Termin-Spalten tragen den Schlüssel aus step_definitions. "Bundesland" und "Bauort" einzeln sind zum Sortieren da.
 */
export const COLUMN_DEFS: readonly { key: ColumnKey; label: string; byDefault: boolean }[] = [
  { key: "nr", label: "Anzahl Projekte", byDefault: true },
  { key: "firma", label: "Fertighausfirma", byDefault: true },
  { key: "abm", label: "ABM-Nr.", byDefault: true },
  { key: "bauherr", label: "Bauherrschaft", byDefault: true },
  { key: "bl_ort", label: "Bundesland - Bauort", byDefault: true },
  { key: "verkaeufer", label: "Verkäufer", byDefault: true },
  { key: "architekt", label: "Architekt", byDefault: true },
  { key: "planer", label: "Planer", byDefault: true },
  { key: "plangespraech", label: "Plan-Gespräch", byDefault: true },
  { key: "baugesuch_uebergabe", label: "Übergabe Baugesuch", byDefault: true },
  { key: "vertrag_versendet", label: "ABM-Vertrag – versendet", byDefault: true },
  { key: "vertrag_zurueck", label: "ABM-Vertrag – zurück", byDefault: true },
  { key: "baugenehmigung", label: "Baugenehmigung", byDefault: true },
  { key: "baubetreuung", label: "Baubetreuung", byDefault: true },
  { key: "hausbau_nr", label: "Fertighausfirma-Nr.", byDefault: true },
  { key: "bundesland", label: "Bundesland", byDefault: false },
  { key: "ort", label: "Bauort", byDefault: false },
];

export const DEFAULT_VISIBLE: readonly ColumnKey[] = COLUMN_DEFS.filter((c) => c.byDefault).map((c) => c.key);

export const COLUMN_LABEL = Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, c.label])) as Record<ColumnKey, string>;

export type ColumnState = { key: ColumnKey; visible: boolean }[];

const KNOWN = new Set<string>(COLUMN_DEFS.map((c) => c.key));

export function defaultColumns(): ColumnState {
  return COLUMN_DEFS.map((c) => ({ key: c.key, visible: DEFAULT_VISIBLE.includes(c.key) }));
}

/**
 * Gespeicherten Stand prüfen: Unbekanntes und Doppeltes fällt weg, neu hinzugekommene Spalten hängen ausgeblendet hinten an.
 * Ist nichts lesbar oder keine Spalte sichtbar, gelten die Standardspalten.
 */
export function normalizeColumns(raw: unknown): ColumnState {
  if (!Array.isArray(raw)) return defaultColumns();
  const seen = new Set<string>();
  const out: ColumnState = [];
  for (const item of raw) {
    const key = (item as { key?: unknown })?.key;
    if (typeof key !== "string" || !KNOWN.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key: key as ColumnKey, visible: (item as { visible?: unknown }).visible === true });
  }
  for (const c of COLUMN_DEFS) if (!seen.has(c.key)) out.push({ key: c.key, visible: false });
  return out.some((c) => c.visible) ? out : defaultColumns();
}

/** Ein- oder ausblenden. Die letzte sichtbare Spalte bleibt sichtbar. */
export function toggleColumn(state: ColumnState, key: ColumnKey): ColumnState {
  const cur = state.find((c) => c.key === key);
  if (!cur) return state;
  if (cur.visible && state.filter((c) => c.visible).length === 1) return state;
  return state.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c));
}

/** An eine Position verschieben (Drag-and-drop). */
export function moveColumnTo(state: ColumnState, key: ColumnKey, index: number): ColumnState {
  const from = state.findIndex((c) => c.key === key);
  if (from < 0) return state;
  const to = Math.max(0, Math.min(state.length - 1, index));
  if (from === to) return state;
  const next = [...state];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Um eine Stelle nach oben (-1) oder unten (+1) verschieben (Auf/Ab-Knöpfe, Tastatur, Handy). */
export function moveColumn(state: ColumnState, key: ColumnKey, delta: -1 | 1): ColumnState {
  return moveColumnTo(state, key, state.findIndex((c) => c.key === key) + delta);
}

export function visibleColumns(state: ColumnState): ColumnKey[] {
  return state.filter((c) => c.visible).map((c) => c.key);
}

/** Speicherschlüssel je Benutzer. Im Demo-Modus gibt es keine Benutzer-ID: dann je Rolle. v3: Spalten nach der Excel. */
export function columnsStorageKey(user: { id?: string; role: string }): string {
  return `abm.projekte.spalten.v3.${user.id ?? `demo-${user.role}`}`;
}

export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const browserStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadColumns(key: string, store: KeyValueStore | null = browserStore()): ColumnState {
  try {
    const raw = store?.getItem(key);
    return raw ? normalizeColumns(JSON.parse(raw)) : defaultColumns();
  } catch {
    return defaultColumns();
  }
}

/** Speichern; ohne Speicher (privates Fenster, gesperrt) gilt die Auswahl nur für diesen Besuch. */
export function saveColumns(key: string, state: ColumnState, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.setItem(key, JSON.stringify(state));
  } catch {
    // nur für diesen Besuch
  }
}

/** Zurücksetzen: gespeicherte Auswahl entfernen, Standardspalten gelten. */
export function resetColumns(key: string, store: KeyValueStore | null = browserStore()): ColumnState {
  try {
    store?.removeItem(key);
  } catch {
    // nichts gespeichert oder Speicher gesperrt
  }
  return defaultColumns();
}
