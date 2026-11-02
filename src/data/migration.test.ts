import { describe, expect, it } from "vitest";
import migration from "../../supabase/migrations/0002_agent_aufgaben_ordner.sql?raw";
import migration10 from "../../supabase/migrations/0010_projektentwurf_aus_dokument.sql?raw";
import migration3 from "../../supabase/migrations/0003_stufen_und_kurznamen.sql?raw";
import migration21 from "../../supabase/migrations/0021_baubegleitung.sql?raw";
import { BAUBEGLEITUNG_STAGE, CORE_STEPS } from "../lib/steps";
import { PROPOSED_STEPS, allStepDefinitions, buildFolderTemplates } from "./templates";

describe("Migrationen 0002 und 0010 sind synchron mit der App", () => {
  it("enthält jede Vorlagenzeile genau so, wie die App sie erzeugt (sonst: npm run gen:folders)", () => {
    // Vorlage = Grundbestand aus 0002 plus spätere Ergänzungen (0010: "00 Verträge")
    const block = [migration, migration10].map((m) => m.match(/-- BEGIN folder_templates([\s\S]*?)-- END folder_templates/)?.[1] ?? "").join("\n");
    const templates = buildFolderTemplates();
    expect(block.match(/^\s+\('/gm)?.length).toBe(templates.length);
    for (const t of templates) expect(block, t.path).toContain(`('${t.path.replace(/'/g, "''")}', `);
  });

  it("Namen, Stufen und Reihenfolge nach 0021 entsprechen der App", () => {
    // jeweils die letzte Migration, die den Wert setzt
    const last = (...found: (string | undefined)[]) => found.find((x) => x !== undefined);
    const key = (k: string) => `'${k}'`;
    const ORIGINAL: Record<string, string> = { vertrag_versendet: "ABM-Vertrag versendet", vertrag_zurueck: "ABM-Vertrag zurück", baugenehmigung: "Baugenehmigung" };
    for (const s of [...CORE_STEPS, ...PROPOSED_STEPS]) {
      const inserted = migration21.match(new RegExp(`\\(${key(s.key)},\\s+'([^']+)',\\s+(\\d+),\\s+'([^']+)'\\)`));
      const label = last(
        inserted?.[1],
        migration21.match(new RegExp(`label = '([^']+)' where key = ${key(s.key)}`))?.[1],
        migration3.match(new RegExp(`set label = '([^']+)'\\s+where key = ${key(s.key)}`))?.[1],
        migration.match(new RegExp(`\\(${key(s.key)},\\s+'([^']+)'`))?.[1],
        ORIGINAL[s.key],
        s.label,
      );
      expect(label, s.key).toBe(s.label);
      const sort = last(inserted?.[2], migration21.match(new RegExp(`sort_order = (\\d+)[^\\n]* where key = ${key(s.key)}`))?.[1], migration.match(new RegExp(`\\(${key(s.key)},\\s+'[^']+',\\s+(\\d+)\\)`))?.[1]);
      if (sort !== undefined) expect(Number(sort), s.key).toBe(s.sortOrder);
      const stage = inserted?.[3] ?? migration3.split("update public.step_definitions set stage = ").find((b) => b.includes(key(s.key)))?.match(/^'([^']+)'/)?.[1];
      expect(stage, s.key).toBe(s.stage);
    }
  });

  it("Baubegleitung läuft in der Reihenfolge der Ordner aus 11 Baubegleitung", () => {
    const folders = buildFolderTemplates().filter((t) => t.parentPath === "11 Baubegleitung").map((t) => t.label);
    expect(folders).toEqual(["01 Ausschreibung", "02 Hausanschlüsse", "03 Ausführungspläne", "04 Bauanlaufgespräch", "05 Vermesser", "06 Straßensperrung", "07 BP-Kellerbaufirma", "09 Hausanschlüsse nach der Hausaufstellung", "10 Baustellentermine"]);
    const steps = allStepDefinitions().filter((s) => s.stage === BAUBEGLEITUNG_STAGE).map((s) => s.label);
    expect(steps).toEqual(folders.map((f) => f.slice(3)));
  });

  it("der neunte Schritt ist die Baufreigabe, danach beginnt die Baubegleitung", () => {
    const all = allStepDefinitions();
    expect(all).toHaveLength(18);
    expect(all[8].key).toBe("baufreigabe");
    expect(all.slice(9).every((s) => s.stage === BAUBEGLEITUNG_STAGE)).toBe(true);
  });
});
