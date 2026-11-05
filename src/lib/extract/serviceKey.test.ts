// Prüft die Schlüsselwahl der Edge Functions (supabase/functions/_shared/serviceKey.ts) und dass alle drei sie nutzen.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keyInvalidMessage } from "../../../supabase/functions/extract-project/logic";
import { serviceKey } from "../../../supabase/functions/_shared/serviceKey";

const env = (vars: Record<string, string>) => (name: string) => vars[name];

describe("serviceKey", () => {
  it("nimmt den Eintrag default aus SUPABASE_SECRET_KEYS", () => {
    expect(serviceKey(env({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: "neu" }), SUPABASE_SERVICE_ROLE_KEY: "alt" }))).toBe("neu");
  });
  it("fällt auf den alten Namen zurück", () => {
    expect(serviceKey(env({ SUPABASE_SERVICE_ROLE_KEY: "alt" }))).toBe("alt");
    expect(serviceKey(env({ SUPABASE_SECRET_KEYS: "{}", SUPABASE_SERVICE_ROLE_KEY: "alt" }))).toBe("alt");
    expect(serviceKey(env({ SUPABASE_SECRET_KEYS: "kein json", SUPABASE_SERVICE_ROLE_KEY: "alt" }))).toBe("alt");
  });
  it("liefert nichts, wenn keiner da ist", () => {
    expect(serviceKey(env({}))).toBeUndefined();
  });
  it.each(["extract-project", "schornsteinfeger-suche", "standort-analyse"])("%s nutzt die Schlüsselwahl", (fn) => {
    const source = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
    expect(source).toContain("serviceKey(env)");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("keyInvalidMessage", () => {
  it("nennt nur Admins den Grund", () => {
    expect(keyInvalidMessage("admin")).toContain("KI-Schlüssel ungültig oder abgelaufen");
    for (const role of ["mitarbeiter", undefined]) expect(keyInvalidMessage(role)).not.toContain("Schlüssel");
  });
});
