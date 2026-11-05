import { describe, expect, it } from "vitest";
import { findSecrets, forbiddenPath, MUST_BE_IGNORED } from "./secretGuard";

// Zusammengesetzt, damit diese Datei selbst nicht anschlägt
const fill = "a1B2".repeat(15);
const secretKey = "sb_sec" + "ret_" + fill;
const publishable = "sb_publish" + "able_" + fill;
const accessToken = "sb" + "p_" + fill;
const anthropic = "sk-" + "ant-api03-" + fill;
const jwt = "ey" + "J" + fill + ".ey" + "J" + fill + ".sig";
const dbUrl = "postgres" + "ql://postgres:" + "geheim@db.example.co:5432/postgres";

describe("forbiddenPath", () => {
  it.each(MUST_BE_IGNORED)("sperrt %s", (path) => {
    expect(forbiddenPath(path)).not.toBeNull();
  });

  it.each([".env.ziel.production", ".env.ziel.development", "supabase/functions/.env", "supabase/.env.local", ".dev.vars", "x/y.pem"])(
    "sperrt auch %s",
    (path) => expect(forbiddenPath(path)).not.toBeNull(),
  );

  it.each([".env.example", "konten.beispiel.json", "docs/umgebungen.md", "src/lib/env.ts", "scripts/check-secrets.ts", "environment.md"])(
    "lässt %s durch",
    (path) => expect(forbiddenPath(path)).toBeNull(),
  );
});

describe("findSecrets", () => {
  it.each([
    ["Secret key", secretKey],
    ["Publishable key", publishable],
    ["Zugangs-Token", accessToken],
    ["Anthropic", anthropic],
    ["JWT", jwt],
    ["Datenbank-Adresse", dbUrl],
  ])("findet %s und nennt die Zeile", (_name, value) => {
    expect(findSecrets(`erste Zeile\nWERT=${value}\n`).map((h) => h.line)).toEqual([2]);
  });

  it("gibt den Wert nie zurück", () => {
    expect(JSON.stringify(findSecrets(`WERT=${secretKey}`))).not.toContain(fill);
  });

  it.each(["SUPABASE_SECRET_KEY=sb_secret_…", "SUPABASE_SECRET_KEY=", "sb_publishable_…", "key sk-ant-1234567890abcdef in Fehlermeldung", "<Schlüssel aus der Anthropic Console>"])(
    "schlägt bei Platzhalter nicht an: %s",
    (text) => expect(findSecrets(text)).toEqual([]),
  );
});
