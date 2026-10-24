// Darstellung hell/dunkel. Auswahl pro Browser in localStorage (es gibt kein Profil pro Benutzer in der Datenbank;
// der Anzeigename steht bei der Rolle). Gesetzt wird data-theme am <html>-Element, die Farben kommen aus tokens.css.
// Damit beim Start nichts flackert, setzt public/theme-init.js dasselbe Attribut schon vor dem ersten Rendern
// (eigene Datei statt Inline-Skript, weil die Content-Security-Policy nur Skripte von der eigenen Seite erlaubt).
// Schlüssel und Werte dort müssen zu THEME_KEY und ThemePref passen (Test in theme.test.ts).

export type ThemePref = "hell" | "dunkel" | "system";
export type Theme = "light" | "dark";

export const THEME_KEY = "abm.darstellung";
export const DEFAULT_THEME_PREF: ThemePref = "system";
export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "hell", label: "Hell" },
  { value: "dunkel", label: "Dunkel" },
];

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isPref(v: unknown): v is ThemePref {
  return v === "hell" || v === "dunkel" || v === "system";
}

/** Gespeicherte Auswahl; ohne Speicher (privates Fenster, gesperrt) oder bei unbekanntem Wert der Standard. */
export function readThemePref(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): ThemePref {
  try {
    const v = storage?.getItem(THEME_KEY);
    return isPref(v) ? v : DEFAULT_THEME_PREF;
  } catch {
    return DEFAULT_THEME_PREF;
  }
}

/** Auswahl speichern. Ohne Speicher gilt sie nur bis zum Neuladen; das ist kein Fehler. */
export function saveThemePref(pref: ThemePref, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(THEME_KEY, pref);
  } catch {
    // ohne Speicher gilt die Auswahl nur für diesen Besuch
  }
}

/** Welche Farben gelten: "System" folgt der Einstellung des Betriebssystems. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "hell") return "light";
  if (pref === "dunkel") return "dark";
  return systemDark ? "dark" : "light";
}

function systemPrefersDark(): boolean {
  // ohne matchMedia (alte Browser, Tests): Dunkel, wie bisher
  return typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(DARK_QUERY).matches;
}

/** Farben am Dokument setzen. Liefert das angewendete Theme. */
export function applyTheme(pref: ThemePref, root: HTMLElement = document.documentElement): Theme {
  const theme = resolveTheme(pref, systemPrefersDark());
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  return theme;
}

/** Auswahl übernehmen: sofort anwenden und speichern. */
export function setThemePref(pref: ThemePref): Theme {
  saveThemePref(pref);
  return applyTheme(pref);
}

/**
 * Bei "System" einem Wechsel des Betriebssystems folgen (z. B. abends automatisch dunkel).
 * Liefert eine Funktion zum Abmelden.
 */
export function followSystemTheme(getPref: () => ThemePref = () => readThemePref()): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (getPref() === "system") applyTheme("system");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
