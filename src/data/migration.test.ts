import { describe, expect, it } from "vitest";
import migration from "../../supabase/migrations/0002_agent_aufgaben_ordner.sql?raw";
import { PROPOSED_STEPS, buildFolderTemplates } from "./templates";

describe("Migration 0002 ist synchron mit der App", () => {
  it("enthält jede Vorlagenzeile genau so, wie die App sie erzeugt (sonst: npm run gen:folders)", () => {
    const block = migration.match(/-- BEGIN folder_templates([\s\S]*?)-- END folder_templates/)?.[1] ?? "";
    const templates = buildFolderTemplates();
    expect(block.match(/^\s+\('/gm)?.length).toBe(templates.length);
    for (const t of templates) expect(block, t.path).toContain(`('${t.path.replace(/'/g, "''")}', `);
  });

  it("enthält die vorgeschlagenen Schritte mit gleicher Reihenfolge", () => {
    for (const s of PROPOSED_STEPS) expect(migration).toMatch(new RegExp(`\\('${s.key}',\\s+'${s.label}',\\s+${s.sortOrder}\\)`));
  });
});
