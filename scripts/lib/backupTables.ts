// Tabellen der Sicherung (npm run export:backup) mit eindeutiger Sortierung je Tabelle (nötig, damit seitenweises Lesen
// keine Zeile doppelt oder gar nicht liefert; meist der Primärschlüssel).
// Vollständigkeit prüft scripts/lib/backupTables.test.ts: Jede Tabelle, die eine Migration im public-Schema anlegt,
// muss hier stehen. Eine neue Tabelle ohne Eintrag lässt die Tests fehlschlagen.

export const BACKUP_TABLES: Record<string, string[]> = {
  companies: ["id"],
  salespeople: ["id"],
  team_members: ["id"],
  step_definitions: ["key"],
  folder_templates: ["id"],
  bauherren: ["id"],
  projects: ["id"],
  project_steps: ["project_id", "step_key"],
  project_parties: ["project_id", "role"],
  project_members: ["project_id", "user_id"],
  invoices: ["id"],
  documents: ["id"],
  tasks: ["id"],
  activities: ["id"],
  mailboxes: ["id"],
  inbox_items: ["id"],
  inbox_attachments: ["id"],
  agent_runs: ["id"],
  agent_rules: ["id"],
  agent_settings: ["id"],
  agent_feedback: ["id"],
  project_drafts: ["id"],
  project_draft_files: ["id"],
  extraction_log: ["id"],
  urlaubs_anspruch: ["user_id", "jahr"],
  abwesenheiten: ["id"],
  user_roles: ["user_id"],
  buero_daten: ["id"],
  planungsprotokolle: ["id"],
  schornsteinfeger_suche: ["plz", "strasse_key"],
  schornsteinfeger_details: ["bsm_id"],
  schornsteinfeger_abrufe: ["id"],
};

/**
 * Tabellen des public-Schemas, die die Migrationen (in Reihenfolge) anlegen und nicht wieder löschen oder umbenennen.
 * Erkennt "create table [if not exists] public.x", "drop table [if exists] public.x" und "alter table public.x rename to y".
 */
export function tablesFromMigrations(sqlFiles: string[]): string[] {
  const tables = new Set<string>();
  const clean = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const sql of sqlFiles.map(clean)) {
    const re = /\b(create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+))|(drop\s+table\s+(?:if\s+exists\s+)?public\.(\w+))|(alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\s+rename\s+to\s+(\w+))/gi;
    for (const m of sql.matchAll(re)) {
      if (m[2]) tables.add(m[2].toLowerCase());
      else if (m[4]) tables.delete(m[4].toLowerCase());
      else if (m[6]) {
        tables.delete(m[6].toLowerCase());
        tables.add(m[7].toLowerCase());
      }
    }
  }
  return [...tables].sort();
}
