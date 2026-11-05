import { describe, expect, it } from "vitest";
import { isProduction, PRODUCTION_REF } from "./umgebung";

describe("isProduction", () => {
  it("erkennt die Produktions-Adresse", () => {
    expect(isProduction({ VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` })).toBe(true);
  });
  it("gilt nicht für andere Projekte und den Demo-Modus", () => {
    expect(isProduction({ VITE_SUPABASE_URL: "https://anderes.supabase.co" })).toBe(false);
    expect(isProduction({ VITE_SUPABASE_URL: "" })).toBe(false);
    expect(isProduction({})).toBe(false);
  });
});
