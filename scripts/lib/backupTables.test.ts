// Die Sicherung muss jede Tabelle des public-Schemas enthalten, die die Migrationen anlegen.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, tablesFromMigrations } from "./backupTables";

const dir = join(__dirname, "../../supabase/migrations");
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"));

describe("Sicherung (export:backup)", () => {
  it("enthält genau die Tabellen, die die Migrationen im public-Schema anlegen", () => {
    const expected = tablesFromMigrations(migrations);
    expect(expected.length).toBeGreaterThan(30);
    const listed = Object.keys(BACKUP_TABLES).sort();
    // fehlt eine Tabelle: in scripts/lib/backupTables.ts mit eindeutiger Sortierung (Primärschlüssel) eintragen
    expect(expected.filter((t) => !listed.includes(t)), "fehlen in der Sicherung").toEqual([]);
    // gibt es eine Tabelle nicht mehr: Eintrag entfernen
    expect(listed.filter((t) => !expected.includes(t)), "gibt es nicht (mehr)").toEqual([]);
  });

  it("hat für jede Tabelle eine Sortierung", () => {
    for (const [t, order] of Object.entries(BACKUP_TABLES)) expect(order.length, t).toBeGreaterThan(0);
  });

  it("erkennt angelegte, gelöschte und umbenannte Tabellen, nicht aber Kommentare und andere Schemas", () => {
    expect(
      tablesFromMigrations([
        "create table public.a (id int);\ncreate table if not exists public.b (id int);\n-- create table public.kommentar (x int)\ncreate table storage.c (id int);",
        "drop table if exists public.a;\nalter table public.b rename to b_neu;\n/* create table public.block (x int) */",
      ]),
    ).toEqual(["b_neu"]);
  });
});
