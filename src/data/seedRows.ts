// Demo-Daten für die ECHTE Datenbank: wandelt den erfundenen Demo-Bestand (derselbe wie im Demo-Modus) in Tabellenzeilen um.
// Alle Wurzeldatensätze tragen is_demo = true (Migrationen 0006/0009); abhängige Zeilen hängen per Fremdschlüssel daran.
// Reine Funktionen: scripts/seed-demo.ts lädt die Zeilen hoch oder schreibt sie als SQL.

import { createHash } from "node:crypto";
import type { Dataset } from "../lib/types";

export type SeedRow = Record<string, string | number | boolean | null | string[]>;
export interface SeedTable {
  table: string;
  rows: SeedRow[];
}

/** IDs der echten Hausbaufirmen aus Migration 0007. Die Demo-Daten hängen sich an diese Zeilen, statt Dubletten anzulegen. */
export const REAL_COMPANY_ID: Record<string, string> = {
  "Bien-Zenker": "0cab8f3a-799c-571f-b4dd-aec84a8a7f05",
  "Living Haus": "a82dbfb8-d1e1-5056-b3e5-59faa402eeeb",
  Schwabenhaus: "82fb4b3f-479e-5350-bf75-99b0717d2408",
};

/** Feste UUID aus einer Demo-ID ("p-001"): gleiche Eingabe, gleiche UUID. Beginnt mit "de30" (Demo), sonst zufällig verteilt. */
export function demoUuid(kind: string, id: string): string {
  const h = createHash("sha1").update(`abm-demo|${kind}|${id}`).digest("hex");
  return `de30${h.slice(4, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Ortszeit ohne Zone ("2026-10-08T09:12:00") → Zeitpunkt mit Zone für die Datenbank. */
function ts(local: string | null): string | null {
  if (!local) return null;
  return new Date(local.length <= 10 ? `${local}T12:00:00` : local).toISOString();
}

/** Reihenfolge = Reihenfolge beim Einfügen (Fremdschlüssel). */
export function buildSeedTables(d: Dataset): SeedTable[] {
  const company = (id: string | null) => {
    if (!id) return null;
    const name = d.companies.find((c) => c.id === id)?.name ?? "";
    const real = REAL_COMPANY_ID[name];
    if (!real) throw new Error(`Demo-Hausbaufirma "${name}" gibt es nicht als Stammdaten (Migration 0007)`);
    return real;
  };
  const u = (kind: string) => (id: string | null) => (id ? demoUuid(kind, id) : null);
  const [sales, team, project, invoice, doc, task, act, box, item, att, run, rule, fb] = ["sales", "team", "project", "invoice", "doc", "task", "act", "box", "item", "att", "run", "rule", "fb"].map(u);
  const projectIds = new Set(d.projects.map((p) => p.id));
  const bauherrOf = new Map(d.bauherren.map((b) => [b.projectId, b]));

  return [
    {
      table: "salespeople",
      rows: d.salespeople.map((s) => ({ id: sales(s.id), company_id: company(s.companyId), name: s.name, email: s.email ?? null, is_demo: true })),
    },
    {
      // ohne Kürzel: "BE"/"MC" sind eindeutig und gehören den echten Architekten
      table: "team_members",
      rows: d.team.map((t) => ({ id: team(t.id), code: null, name: t.name, role: t.role, is_demo: true })),
    },
    {
      table: "bauherren",
      rows: d.bauherren.map((b) => ({
        id: demoUuid("bauherr", b.projectId),
        name: b.name,
        address: b.address,
        phone: b.phone,
        email: b.email,
        building_address: b.buildingAddress,
        // getrennte Felder fürs Planungsprotokoll (Migration 0013)
        street: b.street ?? null,
        postal_code: b.postalCode ?? null,
        city: b.city ?? null,
        mobile: b.mobile ?? null,
        site_street: b.siteStreet ?? null,
        site_postal_code: b.sitePostalCode ?? null,
        site_city: b.siteCity ?? null,
        site_district: b.siteDistrict ?? null,
        site_state: b.siteState ?? null,
        notes: "Erfundener Demo-Datensatz",
        is_demo: true,
      })),
    },
    {
      table: "projects",
      rows: d.projects.map((p) => ({
        id: project(p.id),
        abm_nr: p.abmNr,
        hausbau_nr: p.hausbauNr ?? null,
        kind: p.kind,
        status: p.status,
        company_id: company(p.companyId),
        salesperson_id: sales(p.salespersonId),
        bauherr_id: bauherrOf.has(p.id) ? demoUuid("bauherr", p.id) : null,
        bauherr_label: p.bauherrLabel,
        location: p.location,
        architect_id: team(p.architectId),
        planer_id: team(p.planerId),
        baubetreuung: p.baubetreuung,
        intake_month: p.intakeMonth,
        notes: p.notes,
        flur: p.flur ?? null,
        is_demo: true,
      })),
    },
    {
      table: "project_steps",
      rows: d.projects.flatMap((p) => Object.entries(p.steps).map(([step_key, occurred_on]) => ({ project_id: project(p.id), step_key, occurred_on: occurred_on! }))),
    },
    {
      table: "project_parties",
      rows: d.parties.map((x) => ({ project_id: project(x.projectId), role: x.role, name: x.name, contact: x.contact, address: x.address ?? null, phone: x.phone ?? null, mobile: x.mobile ?? null, email: x.email ?? null, fax: x.fax ?? null })),
    },
    {
      table: "invoices",
      rows: d.invoices.map((i) => ({ id: invoice(i.id), project_id: project(i.projectId), label: i.label, amount_cents: i.amountCents, trigger_step_key: i.triggerStep, status: i.status, due_on: i.dueOn, sent_on: i.sentOn, paid_on: i.paidOn })),
    },
    {
      table: "tasks",
      rows: d.tasks.map((t) => ({
        id: task(t.id),
        project_id: project(t.projectId),
        title: t.title,
        due_on: t.dueOn,
        assignee_id: team(t.assigneeId),
        status: t.status,
        source: t.source,
        // Schlüssel aus Warnungen enthalten Demo-IDs; mit Vorsatz, damit sie nie mit echten Schlüsseln zusammenfallen
        source_key: t.sourceKey ? `demo:${t.sourceKey}` : null,
        created_at: ts(t.createdAt),
        done_at: ts(t.doneAt),
        is_demo: true,
      })),
    },
    {
      table: "mailboxes",
      rows: d.mailboxes.map((m) => ({ id: box(m.id), label: `${m.label} (Demo)`, address: m.address, provider: "demo", status: m.status, last_checked_at: ts(m.lastCheckedAt), watch_folder: m.watchFolder, is_demo: true })),
    },
    {
      table: "inbox_items",
      rows: d.inboxItems.map((i) => ({
        id: item(i.id),
        mailbox_id: box(i.mailboxId),
        message_id: `demo:${i.messageId}`,
        received_at: ts(i.receivedAt),
        from_name: i.fromName,
        from_email: i.fromEmail,
        subject: i.subject,
        body_excerpt: i.bodyExcerpt.slice(0, 2000),
        status: i.status,
        project_id: i.projectId && projectIds.has(i.projectId) ? project(i.projectId) : null,
        confidence: i.confidence,
        reason: i.reason,
        created_at: ts(i.createdAt),
      })),
    },
    {
      // document_id folgt nach den Dokumenten (gegenseitiger Verweis), siehe LINK_ATTACHMENTS_SQL
      table: "inbox_attachments",
      rows: d.inboxAttachments.map((a) => ({
        id: att(a.id),
        item_id: item(a.itemId),
        file_name: a.fileName,
        mime: a.mime,
        size_bytes: a.sizeBytes,
        storage_path: null,
        project_id: a.projectId && projectIds.has(a.projectId) ? project(a.projectId) : null,
        folder_path: a.folderPath,
        confidence: a.confidence,
        status: a.status,
        corrected: a.corrected,
      })),
    },
    {
      table: "documents",
      rows: d.documents.map((x) => ({
        id: doc(x.id),
        project_id: project(x.projectId),
        name: x.name,
        // Demo-Dokumente haben keine Datei im Speicher; der Pfad ist nur ein eindeutiger Platzhalter unter der Projekt-ID
        storage_path: `${project(x.projectId)}/demo/${doc(x.id)}`,
        mime: x.mime,
        size_bytes: x.sizeBytes,
        folder_path: x.folderPath,
        source: x.source,
        source_item_id: att(x.sourceItemId),
        received_on: x.receivedOn,
        created_at: ts(x.createdAt),
      })),
    },
    {
      table: "agent_runs",
      rows: d.agentRuns.map((r) => ({ id: run(r.id), mailbox_id: box(r.mailboxId), started_at: ts(r.startedAt), finished_at: ts(r.finishedAt), fetched: r.fetched, filed: r.filed, to_review: r.toReview, ignored: r.ignored, errors: r.errors, note: r.note })),
    },
    {
      table: "agent_rules",
      rows: d.agentRules.map((r) => ({ id: rule(r.id), kind: r.kind, match: r.match.trim().toLowerCase(), project_id: project(r.projectId), folder_path: r.folderPath, created_at: ts(r.createdAt), is_demo: true })),
    },
    {
      table: "agent_feedback",
      rows: d.agentFeedback.map((f) => ({ id: fb(f.id), attachment_id: att(f.attachmentId), action: f.action, project_id: project(f.projectId), folder_path: f.folderPath, created_at: ts(f.createdAt) })),
    },
    {
      table: "activities",
      rows: d.activities.map((a) => ({ id: act(a.id), project_id: project(a.projectId), kind: a.kind, text: a.text, actor: a.actor, at: ts(a.at), is_demo: true })),
    },
  ].filter((t) => t.rows.length > 0);
}

/** Nach dem Einfügen: Anhänge mit ihren Dokumenten verknüpfen (nur Demo-Zeilen). */
export const LINK_ATTACHMENTS_SQL = `update public.inbox_attachments a set document_id = d.id, storage_path = d.storage_path
  from public.documents d join public.projects p on p.id = d.project_id
  where d.source_item_id = a.id and p.is_demo and a.document_id is null;`;

/**
 * Alle Demo-Daten löschen, echte Daten bleiben. Reihenfolge: erst die Wurzeln, an denen am meisten hängt.
 * Schritte, Rechnungen, Dokumente, Beteiligte, Zuweisungen, Mails, Anhänge und Läufe verschwinden über die Fremdschlüssel mit.
 * Demo-Abwesenheiten (Urlaub, Krankheit) hängen an echten Konten und werden über ihr eigenes is_demo entfernt.
 */
export const DELETE_ORDER = ["abwesenheiten", "projects", "mailboxes", "tasks", "activities", "agent_rules", "bauherren", "salespeople", "team_members", "companies"] as const;

export function deleteDemoSql(): string {
  return ["begin;", ...DELETE_ORDER.map((t) => `delete from public.${t} where is_demo;`), "commit;", ""].join("\n");
}

/** Dieselben Zeilen als SQL (eine Transaktion). Zum Prüfen gegen ein lokales Postgres oder zum Einfügen in den SQL-Editor. */
export function seedSql(tables: SeedTable[]): string {
  const out = ["-- ABM Projekt-App: erfundene Demo-Daten (is_demo = true). ERZEUGT von scripts/seed-demo.ts, nicht einchecken.", "begin;"];
  for (const t of tables) {
    const cols = Object.keys(t.rows[0]);
    // jsonb_populate_recordset nimmt die Spaltentypen aus der Tabelle; eingefügt werden nur die genannten Spalten
    const json = JSON.stringify(t.rows).replace(/\$seed\$/g, "");
    out.push(`insert into public.${t.table} (${cols.join(", ")})\n  select ${cols.join(", ")} from jsonb_populate_recordset(null::public.${t.table}, $seed$${json}$seed$::jsonb);`);
  }
  out.push(LINK_ATTACHMENTS_SQL, "commit;", "");
  return out.join("\n");
}
