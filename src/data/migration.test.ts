import { describe, expect, it } from "vitest";
import migration from "../../supabase/migrations/0002_agent_aufgaben_ordner.sql?raw";
import migration10 from "../../supabase/migrations/0010_projektentwurf_aus_dokument.sql?raw";
import migration3 from "../../supabase/migrations/0003_stufen_und_kurznamen.sql?raw";
import { CORE_STEPS } from "../lib/steps";
import { PROPOSED_STEPS, buildFolderTemplates } from "./templates";

describe("Migrationen 0002 und 0010 sind synchron mit der App", () => {
  it("enthält jede Vorlagenzeile genau so, wie die App sie erzeugt (sonst: npm run gen:folders)", () => {
    // Vorlage = Grundbestand aus 0002 plus spätere Ergänzungen (0010: "00 Verträge")
    const block = [migration, migration10].map((m) => m.match(/-- BEGIN folder_templates([\s\S]*?)-- END folder_templates/)?.[1] ?? "").join("\n");
    const templates = buildFolderTemplates();
    expect(block.match(/^\s+\('/gm)?.length).toBe(templates.length);
    for (const t of templates) expect(block, t.path).toContain(`('${t.path.replace(/'/g, "''")}', `);
  });

  it("enthält die vorgeschlagenen Schritte mit gleicher Reihenfolge", () => {
    for (const s of PROPOSED_STEPS) expect(migration).toMatch(new RegExp(`\\('${s.key}',\\s+'[^']+',\\s+${s.sortOrder}\\)`));
  });

  it("Namen und Stufen nach 0003 entsprechen der App", () => {
    const labelAfter = (key: string, original: string) =>
      migration3.match(new RegExp(`set label = '([^']+)'\\s+where key = '${key}'`))?.[1] ??
      migration.match(new RegExp(`\\('${key}',\\s+'([^']+)'`))?.[1] ??
      original;
    const ORIGINAL: Record<string, string> = { vertrag_versendet: "ABM-Vertrag versendet", vertrag_zurueck: "ABM-Vertrag zurück", baugenehmigung: "Baugenehmigung" };
    for (const s of [...CORE_STEPS, ...PROPOSED_STEPS]) {
      expect(labelAfter(s.key, ORIGINAL[s.key] ?? s.label), s.key).toBe(s.label);
      const stageLine = migration3.split("update public.step_definitions set stage = ").find((b) => b.includes(`'${s.key}'`));
      expect(stageLine?.startsWith(`'${s.stage}'`), s.key).toBe(true);
    }
  });
});
