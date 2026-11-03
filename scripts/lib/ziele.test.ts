import { describe, expect, it } from "vitest";
import { parseZiel, pruefeWerte, verweistAufProduction, ZIELE } from "./ziele";

const gut = (ziel: "development" | "production") => ({
  SUPABASE_PROJECT_REF: ZIELE[ziel].ref,
  VITE_SUPABASE_URL: `https://${ZIELE[ziel].ref}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  SUPABASE_ACCESS_TOKEN: "sbp_x",
  ANTHROPIC_API_KEY: "sk-ant-x",
});
const alle = ["oeffentlich", "secret", "token", "anthropic"] as const;

describe("parseZiel", () => {
  it("verlangt ein ausdrückliches Ziel", () => {
    expect(parseZiel([])).toBeNull();
    expect(parseZiel(["--ziel"])).toBeNull();
    expect(parseZiel(["--ziel", "prod"])).toBeNull();
    expect(parseZiel(["--ziel", "--ab"])).toBeNull();
  });
  it("kennt beide Schreibweisen", () => {
    expect(parseZiel(["--ab", "7", "--ziel", "production"])).toBe("production");
    expect(parseZiel(["--ziel=development"])).toBe("development");
  });
});

describe("pruefeWerte", () => {
  it("nimmt passende Werte an", () => {
    expect(pruefeWerte("production", gut("production"), [...alle])).toEqual([]);
    expect(pruefeWerte("development", gut("development"), [...alle])).toEqual([]);
  });
  it("weist vertauschte Dateien ab", () => {
    expect(pruefeWerte("production", gut("development"), ["oeffentlich"])).toHaveLength(2);
    expect(pruefeWerte("development", gut("production"), ["oeffentlich"])).toHaveLength(2);
  });
  it("erlaubt alte JWT-Schlüssel nur in development", () => {
    const alt = { ...gut("production"), VITE_SUPABASE_ANON_KEY: "eyJx", SUPABASE_SECRET_KEY: "eyJy" };
    expect(pruefeWerte("production", alt, ["oeffentlich", "secret"])).toHaveLength(2);
    const dev = { ...gut("development"), VITE_SUPABASE_ANON_KEY: "eyJx", SUPABASE_SECRET_KEY: "eyJy" };
    expect(pruefeWerte("development", dev, ["oeffentlich", "secret"])).toEqual([]);
  });
  it("nennt falsche Formen, ohne den Wert auszugeben", () => {
    const wert = "ganzgeheimerwert123";
    const out = pruefeWerte("production", { ...gut("production"), SUPABASE_SECRET_KEY: wert, ANTHROPIC_API_KEY: wert }, ["secret", "anthropic"]);
    expect(out).toHaveLength(2);
    expect(out.join()).not.toContain(wert);
  });
  it("prüft nur die verlangten Felder", () => {
    expect(pruefeWerte("development", { ...gut("development"), SUPABASE_SECRET_KEY: "falsch" }, ["oeffentlich"])).toEqual([]);
  });
});

describe("verweistAufProduction", () => {
  it("erkennt nur die Produktions-Adresse", () => {
    expect(verweistAufProduction(`https://${ZIELE.production.ref}.supabase.co`)).toBe(true);
    expect(verweistAufProduction(`https://${ZIELE.development.ref}.supabase.co`)).toBe(false);
    expect(verweistAufProduction(undefined)).toBe(false);
  });
});
