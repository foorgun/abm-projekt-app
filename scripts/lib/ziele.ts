// Die zwei Umgebungen der App. Die Refs sind nicht geheim (sie stehen in jeder Projekt-URL) und sichern ab,
// dass eine Datei wirklich zu ihrem Ziel gehört. Werte stehen nur in den lokalen Dateien, siehe docs/umgebungen.md.
import { isProduction, PRODUCTION_REF } from "../../src/lib/umgebung";

export type Ziel = "development" | "production";

export const ZIELE: Record<Ziel, { ref: string; datei: string; konten: string }> = {
  development: { ref: "xyiiewwoorxhglgddrcb", datei: ".env.ziel.development", konten: "konten.development.local.json" },
  production: { ref: PRODUCTION_REF, datei: ".env.ziel.production", konten: "konten.production.local.json" },
};

/** Muss bei production eingetippt werden. */
export const BESTAETIGUNG_PRODUCTION = "abm-prod";

/** Liest --ziel development|production (auch --ziel=…). Einen Standard gibt es absichtlich nicht. */
export function parseZiel(argv: string[]): Ziel | null {
  const i = argv.indexOf("--ziel");
  const wert = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith("--ziel="))?.slice("--ziel=".length);
  return wert === "development" || wert === "production" ? wert : null;
}

export type Feld = "oeffentlich" | "secret" | "token" | "anthropic";

/** Prüft die Form der Werte, ohne sie je auszugeben. Leere Liste = in Ordnung. */
export function pruefeWerte(ziel: Ziel, env: Record<string, string | undefined>, felder: Feld[]): string[] {
  const { ref, datei } = ZIELE[ziel];
  const out: string[] = [];
  const prod = ziel === "production";
  if (felder.includes("oeffentlich")) {
    if (env.SUPABASE_PROJECT_REF !== ref) out.push(`SUPABASE_PROJECT_REF gehört nicht zu ${ziel}`);
    if (env.VITE_SUPABASE_URL?.replace(/\/$/, "") !== `https://${ref}.supabase.co`) out.push(`VITE_SUPABASE_URL gehört nicht zu ${ziel}`);
    const key = env.VITE_SUPABASE_ANON_KEY ?? "";
    if (!key.startsWith("sb_publishable_") && (prod || !key.startsWith("eyJ"))) out.push("VITE_SUPABASE_ANON_KEY ist kein Publishable key (sb_publishable_…)");
  }
  if (felder.includes("secret")) {
    const key = env.SUPABASE_SECRET_KEY ?? "";
    if (!key.startsWith("sb_secret_") && (prod || !key.startsWith("eyJ"))) out.push("SUPABASE_SECRET_KEY ist kein Secret key (sb_secret_…)");
  }
  if (felder.includes("token") && !env.SUPABASE_ACCESS_TOKEN?.startsWith("sbp_")) out.push("SUPABASE_ACCESS_TOKEN ist kein Zugangs-Token (sbp_…)");
  if (felder.includes("anthropic") && !env.ANTHROPIC_API_KEY?.startsWith("sk-ant-")) out.push("ANTHROPIC_API_KEY ist kein Anthropic-Schlüssel (sk-ant-…)");
  return out.map((p) => `${datei}: ${p}`);
}

/** Vite-Dev-Server und vite-node dürfen nie an production hängen (vite.config.ts). */
export function verweistAufProduction(url: string | undefined): boolean {
  return isProduction({ VITE_SUPABASE_URL: url });
}
