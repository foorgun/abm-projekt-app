// @vitest-environment jsdom
// Darstellung hell/dunkel: speichern, anwenden, Start ohne Flackern (public/theme-init.js), Auswahl in den Einstellungen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DarstellungKarte } from "../pages/Einstellungen";
import { applyTheme, readThemePref, resolveTheme, saveThemePref, setThemePref, THEME_KEY } from "./theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const root = document.documentElement;

/** Betriebssystem auf hell oder dunkel stellen (jsdom hat kein matchMedia). */
function systemDark(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("dark") ? dark : !dark,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
  systemDark(true);
});

afterEach(() => vi.restoreAllMocks());

describe("Darstellung", () => {
  it("Standard ist System; unbekannte Werte gelten als System", () => {
    expect(readThemePref()).toBe("system");
    localStorage.setItem(THEME_KEY, "lila");
    expect(readThemePref()).toBe("system");
  });

  it("Auswahl wird gespeichert und sofort angewendet", () => {
    expect(setThemePref("hell")).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("hell");
    expect(root.dataset.theme).toBe("light");
    expect(setThemePref("dunkel")).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dunkel");
    expect(root.dataset.theme).toBe("dark");
  });

  it("System folgt dem Gerät", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    systemDark(false);
    expect(applyTheme("system")).toBe("light");
  });

  it("ohne Speicher (privates Fenster, gesperrt) kein Fehler", () => {
    const broken = {
      getItem: () => {
        throw new Error("gesperrt");
      },
      setItem: () => {
        throw new Error("gesperrt");
      },
    };
    expect(readThemePref(broken)).toBe("system");
    expect(() => saveThemePref("hell", broken)).not.toThrow();
  });

  it("public/theme-init.js setzt vor dem ersten Rendern dasselbe wie die App", () => {
    const src = readFileSync(join(__dirname, "../../public/theme-init.js"), "utf8");
    expect(src).toContain(`"${THEME_KEY}"`);
    for (const [pref, dark, expected] of [
      ["hell", true, "light"],
      ["dunkel", false, "dark"],
      ["system", false, "light"],
      ["system", true, "dark"],
      [null, true, "dark"],
    ] as const) {
      localStorage.clear();
      if (pref) localStorage.setItem(THEME_KEY, pref);
      systemDark(dark);
      new Function(src)();
      expect(root.dataset.theme, `${pref} / System ${dark ? "dunkel" : "hell"}`).toBe(expected);
      expect(applyTheme(readThemePref())).toBe(expected);
    }
  });
});

describe("Einstellungen: Auswahlfeld Darstellung", () => {
  it("zeigt die gespeicherte Auswahl, wendet eine neue sofort an und speichert sie", async () => {
    localStorage.setItem(THEME_KEY, "dunkel");
    const host = document.createElement("div");
    document.body.append(host);
    const r = createRoot(host);
    await act(async () => r.render(<DarstellungKarte />));
    const select = host.querySelector("select")!;
    expect(host.querySelector(`label[for="${select.id}"]`)?.textContent).toBe("Darstellung");
    expect(select.value).toBe("dunkel");
    expect([...select.options].map((o) => o.textContent)).toEqual(["System", "Hell", "Dunkel"]);

    await act(async () => {
      select.value = "hell";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(localStorage.getItem(THEME_KEY)).toBe("hell");
    expect(root.dataset.theme).toBe("light");
    act(() => r.unmount());
    host.remove();
  });
});
