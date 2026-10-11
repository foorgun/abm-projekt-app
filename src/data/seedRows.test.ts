import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "./demoData";
import { buildSeedTables, deleteDemoSql, demoUuid, REAL_COMPANY_ID, seedSql } from "./seedRows";

const d = buildDemoDataset("2026-10-10");
const tables = buildSeedTables(d);
const rows = (t: string) => tables.find((x) => x.table === t)?.rows ?? [];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("Demo-Daten für die echte Datenbank", () => {
  it("feste, gültige UUIDs: gleiche Demo-ID → gleiche UUID, verschiedene Arten → verschiedene", () => {
    expect(demoUuid("project", "p-001")).toMatch(UUID);
    expect(demoUuid("project", "p-001")).toBe(demoUuid("project", "p-001"));
    expect(demoUuid("project", "p-001")).not.toBe(demoUuid("task", "p-001"));
    expect(demoUuid("project", "p-001").startsWith("de30")).toBe(true);
  });

  it("gleich viele Zeilen wie im Demo-Modus", () => {
    expect(rows("projects")).toHaveLength(d.projects.length);
    expect(rows("invoices")).toHaveLength(d.invoices.length);
    expect(rows("documents")).toHaveLength(d.documents.length);
    expect(rows("tasks")).toHaveLength(d.tasks.length);
    expect(rows("inbox_attachments")).toHaveLength(d.inboxAttachments.length);
    expect(rows("project_steps")).toHaveLength(d.projects.reduce((n, p) => n + Object.keys(p.steps).length, 0));
  });

  it("jeder Wurzeldatensatz ist als Demo gekennzeichnet; Hausbaufirmen werden nicht angelegt", () => {
    for (const t of ["salespeople", "team_members", "bauherren", "projects", "tasks", "mailboxes", "agent_rules", "activities"]) {
      expect(rows(t).length, t).toBeGreaterThan(0);
      expect(rows(t).every((r) => r.is_demo === true), t).toBe(true);
    }
    expect(tables.some((t) => t.table === "companies")).toBe(false);
    const real = new Set(Object.values(REAL_COMPANY_ID));
    expect(rows("projects").every((p) => p.company_id === null || real.has(p.company_id as string))).toBe(true);
    expect(rows("salespeople").every((s) => real.has(s.company_id as string))).toBe(true);
  });

  it("Verweise zeigen auf Zeilen, die es im Bestand gibt", () => {
    const ids = (t: string) => new Set(rows(t).map((r) => r.id));
    const projects = ids("projects");
    for (const t of ["project_steps", "project_parties", "invoices", "documents"]) expect(rows(t).every((r) => projects.has(r.project_id)), t).toBe(true);
    expect(rows("tasks").every((r) => r.project_id === null || projects.has(r.project_id))).toBe(true);
    expect(rows("inbox_attachments").every((r) => ids("inbox_items").has(r.item_id))).toBe(true);
    expect(rows("documents").every((r) => r.source_item_id === null || ids("inbox_attachments").has(r.source_item_id))).toBe(true);
    expect(rows("projects").every((r) => r.bauherr_id === null || ids("bauherren").has(r.bauherr_id))).toBe(true);
    expect(rows("projects").every((r) => r.architect_id === null || ids("team_members").has(r.architect_id))).toBe(true);
  });

  it("hält die Regeln der Tabellen ein (Rechnungen, Aufgaben, eindeutige Werte)", () => {
    for (const i of rows("invoices")) {
      expect(["versendet", "bezahlt"].includes(i.status as string)).toBe(i.sent_on !== null);
      expect(i.status === "bezahlt").toBe(i.paid_on !== null);
    }
    for (const t of rows("tasks")) expect(t.status === "erledigt").toBe(t.done_at !== null);
    const unique = (t: string, col: string) => {
      const vals = rows(t).map((r) => r[col]).filter((v) => v !== null);
      expect(new Set(vals).size, `${t}.${col}`).toBe(vals.length);
    };
    unique("documents", "storage_path");
    unique("tasks", "source_key");
    unique("inbox_items", "message_id");
    unique("mailboxes", "address");
    expect(rows("team_members").every((t) => t.code === null)).toBe(true);
    expect(rows("documents").every((x) => !(x.folder_path as string).includes("{datum}"))).toBe(true);
  });

  it("keine echten Adressen: nur reservierte Beispiel-Domains (.example, example.com)", () => {
    const mails = [...rows("bauherren").map((b) => b.email), ...rows("inbox_items").map((i) => i.from_email), ...rows("mailboxes").map((m) => m.address), ...rows("salespeople").map((s) => s.email)].filter(Boolean) as string[];
    expect(mails.length).toBeGreaterThan(20);
    expect(mails.filter((m) => !/(\.example|@example\.(com|org|net))$/.test(m))).toEqual([]);
  });

  it("SQL: eine Transaktion, Löschen nur mit is_demo", () => {
    const sql = seedSql(tables);
    expect(sql.startsWith("--")).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql.trim().endsWith("commit;")).toBe(true);
    const del = deleteDemoSql();
    expect(del.match(/delete from/g)).toHaveLength(9);
    expect(del.split("\n").filter((l) => l.startsWith("delete")).every((l) => l.endsWith("where is_demo;"))).toBe(true);
  });
});
