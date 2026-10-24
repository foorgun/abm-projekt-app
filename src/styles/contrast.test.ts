// Kontrast der Farb-Tokens in beiden Darstellungen (WCAG 2.1: Text 4,5:1, Bedienelemente und Grafik 3:1).
// Liest tokens.css direkt, damit eine geänderte Farbe hier sofort auffällt.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Block ${selector} fehlt in tokens.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const dark = block(":root");
const light = { ...dark, ...block(':root[data-theme="light"]') };
const THEMES = { dunkel: dark, hell: light };

type Rgba = [number, number, number, number];

function color(tokens: Record<string, string>, value: string): Rgba {
  const v = value.trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return color(tokens, tokens[ref[1]] ?? "");
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgba;
  const rgba = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((x) => x.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`Farbe nicht lesbar: ${value}`);
}

/** Farbe mit Deckkraft über einer deckenden Fläche. */
function over(top: Rgba, base: Rgba, alpha = top[3]): Rgba {
  return [0, 1, 2].map((i) => top[i] * alpha + base[i] * (1 - alpha)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [name, t] of Object.entries(THEMES)) {
  const c = (token: string) => color(t, `var(${token})`);
  const surface = c("--surface");
  /** Fläche: deckender Token oder durchscheinender Token über --surface (Pills, Hinweise, Hover). */
  const bg = (token: string) => over(c(token), surface);
  const check = (fg: string, back: string, min: number) => {
    const r = ratio(over(c(fg), bg(back)), bg(back));
    expect(r, `${name}: ${fg} auf ${back} = ${r.toFixed(2)}:1, mindestens ${min}:1`).toBeGreaterThanOrEqual(min);
  };

  describe(`Kontrast, Darstellung ${name}`, () => {
    it("Text und Tabellen auf allen Flächen", () => {
      for (const back of ["--bg", "--surface", "--surface-2", "--surface-3"]) {
        check("--text", back, 7);
        check("--text-2", back, 4.5);
        check("--muted", back, 4.5);
      }
      for (const back of ["--bg", "--surface", "--surface-2"]) check("--faint", back, 4.5);
      check("--text", "--accent-soft", 4.5);
    });

    it("Pills, Badges und Meldungen (Statusfarbe auf ihrer getönten Fläche)", () => {
      for (const tone of ["ok", "warn", "danger", "info"]) {
        check(`--${tone}`, `--${tone}-soft`, 4.5);
        check(`--${tone}`, "--surface", 4.5);
      }
      check("--text-2", "--neutral-soft", 4.5);
    });

    it("Buttons", () => {
      check("--on-primary", "--primary-bg", 4.5);
      check("--on-primary", "--primary-bg-hover", 4.5);
      check("--on-destructive", "--destructive", 4.5);
      check("--on-accent", "--accent", 4.5);
    });

    it("Fokus, aktive Zustände und Formularränder heben sich ab (3:1)", () => {
      check("--focus", "--surface", 3);
      check("--accent", "--surface", 3);
      check("--chart-1-muted", "--surface", 3);
    });

    it("Termine: Titel auf der getönten Kachel", () => {
      for (const art of ["baustelle", "besprechung", "behoerde", "intern"]) {
        const tile = over(c(`--termin-${art}`), surface, 0.18);
        const r = ratio(c(`--termin-${art}-text`), tile);
        expect(r, `${name}: Termin ${art} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}

describe("Darstellung hell", () => {
  it("überschreibt jede Farbe, die für dunkle Flächen gedacht ist", () => {
    const own = block(':root[data-theme="light"]');
    // weiße Tönungen sind auf hellem Grund unsichtbar: müssen im hellen Satz eigene Werte haben
    for (const [k, v] of Object.entries(dark)) {
      if (/rgba\(255,\s*255,\s*255/.test(v)) expect(own[k], `${k} fehlt im hellen Satz`).toBeDefined();
    }
  });
});
