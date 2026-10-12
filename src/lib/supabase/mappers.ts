// Zeilen der Datenbank (snake_case) → Domänentypen der App (camelCase). Reine Funktionen, getestet.

import type { StepDefinition } from "../steps";
import type {
  Activity,
  AgentFeedback,
  AgentRule,
  AgentRun,
  BauherrContact,
  Company,
  FolderTemplate,
  InboxAttachment,
  InboxItem,
  Invoice,
  Mailbox,
  Project,
  ProjectDocument,
  ProjectDraftRecord,
  ProjectParty,
  Salesperson,
  StepDates,
  Task,
  TeamMember,
} from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

// Spaltenlisten: immer ausdrücklich, nie "*". Bei mailboxes ist secret_ref per Spaltenrecht gesperrt,
// und neue Spalten sollen nicht unbemerkt in den Browser gelangen.
export const COLS = {
  companies: "id, name, number_prefix",
  salespeople: "id, company_id, name, email",
  team_members: "id, code, name, role",
  step_definitions: "key, label, sort_order, stage",
  folder_templates: "path, parent_path, sort, label, has_date, keywords, description",
  projects:
    "id, abm_nr, hausbau_nr, kind, status, company_id, salesperson_id, bauherr_id, bauherr_label, location, architect_id, planer_id, baubetreuung, intake_month, notes, flurstueck, gemarkung, created_at",
  project_steps: "project_id, step_key, occurred_on",
  invoices: "id, project_id, label, amount_cents, trigger_step_key, status, due_on, sent_on, paid_on",
  bauherren: "id, name, address, phone, email, building_address, name2, phone2, email2",
  project_parties: "project_id, role, name, contact",
  documents: "id, project_id, name, folder_path, storage_path, mime, size_bytes, source, source_item_id, received_on, uploaded_by, created_at, doc_type, meta",
  project_drafts: "id, status, fields, form, doc_type, file_name, file_size, file_mime, storage_path, project_id, created_by, created_at, updated_at",
  tasks: "id, project_id, title, due_on, assignee_id, status, source, source_key, created_at, done_at",
  activities: "id, project_id, kind, text, actor, at",
  mailboxes: "id, label, address, provider, status, last_checked_at, watch_folder",
  inbox_items: "id, mailbox_id, message_id, received_at, from_name, from_email, subject, body_excerpt, status, project_id, confidence, reason, created_at",
  inbox_attachments: "id, item_id, file_name, mime, size_bytes, storage_path, project_id, folder_path, confidence, status, document_id, corrected",
  agent_runs: "id, mailbox_id, started_at, finished_at, fetched, filed, to_review, ignored, errors, note",
  agent_rules: "id, kind, match, project_id, folder_path, created_by, created_at",
  agent_settings: "auto_file_threshold, suggest_threshold",
  agent_feedback: "id, attachment_id, action, project_id, folder_path, created_by, created_at",
} as const;

/**
 * Zeitstempel der Datenbank (mit Zeitzone) → lokale Zeit ohne Zone, "YYYY-MM-DDTHH:MM:SS".
 * So rechnet die App überall mit derselben Form wie im Demo-Modus (Datum = erste zehn Zeichen, in Ortszeit).
 */
export function localStamp(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const stamp = (ts: string): string => localStamp(ts) ?? ts;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export const toCompany = (r: Row): Company => ({ id: r.id, name: r.name, numberPrefix: r.number_prefix ?? null });
export const toSalesperson = (r: Row): Salesperson => ({ id: r.id, companyId: r.company_id, name: r.name, email: r.email ?? null });
export const toTeamMember = (r: Row): TeamMember => ({ id: r.id, code: r.code ?? null, name: r.name, role: r.role });
export const toStepDefinition = (r: Row): StepDefinition => ({ key: r.key, label: r.label, sortOrder: r.sort_order, stage: r.stage });

export const toFolderTemplate = (r: Row): FolderTemplate => ({
  path: r.path,
  parentPath: r.parent_path ?? null,
  sort: r.sort,
  label: r.label,
  hasDate: Boolean(r.has_date),
  keywords: r.keywords ?? [],
  description: r.description ?? null,
});

/** Schritte je Projekt aus project_steps sammeln. */
export function groupSteps(rows: Row[]): Map<string, StepDates> {
  const map = new Map<string, StepDates>();
  for (const r of rows) {
    const steps = map.get(r.project_id) ?? {};
    steps[r.step_key] = r.occurred_on;
    map.set(r.project_id, steps);
  }
  return map;
}

export const toProject = (r: Row, steps: StepDates = {}): Project => ({
  id: r.id,
  abmNr: r.abm_nr ?? null,
  hausbauNr: r.hausbau_nr ?? null,
  kind: r.kind,
  status: r.status,
  companyId: r.company_id ?? null,
  salespersonId: r.salesperson_id ?? null,
  bauherrLabel: r.bauherr_label,
  location: r.location ?? null,
  architectId: r.architect_id ?? null,
  planerId: r.planer_id ?? null,
  baubetreuung: r.baubetreuung ?? null,
  intakeMonth: r.intake_month ?? null,
  notes: r.notes ?? null,
  flurstueck: r.flurstueck ?? null,
  gemarkung: r.gemarkung ?? null,
  steps,
});

export const toInvoice = (r: Row): Invoice => ({
  id: r.id,
  projectId: r.project_id,
  label: r.label,
  amountCents: Number(r.amount_cents),
  triggerStep: r.trigger_step_key ?? null,
  status: r.status,
  dueOn: r.due_on ?? null,
  sentOn: r.sent_on ?? null,
  paidOn: r.paid_on ?? null,
});

/**
 * Kontaktdaten hängen in der Datenbank am Bauherrn (projects.bauherr_id), die App führt sie je Projekt.
 * Freiberufler bekommen von der Datenbank keine Bauherren-Zeilen, das Ergebnis ist dann leer.
 */
export function toBauherrContacts(bauherren: Row[], projects: Row[]): BauherrContact[] {
  const byId = new Map(bauherren.map((b) => [b.id, b]));
  const out: BauherrContact[] = [];
  for (const p of projects) {
    const b = p.bauherr_id ? byId.get(p.bauherr_id) : undefined;
    if (b) {
      out.push({
        projectId: p.id,
        name: b.name,
        address: b.address ?? null,
        phone: b.phone ?? null,
        email: b.email ?? null,
        buildingAddress: b.building_address ?? null,
        name2: b.name2 ?? null,
        phone2: b.phone2 ?? null,
        email2: b.email2 ?? null,
      });
    }
  }
  return out;
}

export const toParty = (r: Row): ProjectParty => ({ projectId: r.project_id, role: r.role, name: r.name, contact: r.contact ?? null });

export const toDocument = (r: Row, names: Map<string, string> = new Map()): ProjectDocument => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  folderPath: r.folder_path ?? "",
  storagePath: r.storage_path,
  mime: r.mime ?? null,
  sizeBytes: num(r.size_bytes),
  source: r.source,
  sourceItemId: r.source_item_id ?? null,
  receivedOn: r.received_on ?? stamp(r.created_at).slice(0, 10),
  // Anzeigename statt Benutzer-ID; bei Agent-Dateien steht dort, wer die Ablage bestätigt hat
  uploadedBy: r.uploaded_by ? names.get(r.uploaded_by) ?? null : null,
  createdAt: stamp(r.created_at),
  docType: r.doc_type ?? null,
  meta: r.meta && typeof r.meta === "object" ? r.meta : {},
});

/** Entwurf aus der Datenbank. `fields` und `form` sind JSON, das die App selbst geschrieben hat. */
export const toProjectDraft = (r: Row, names: Map<string, string> = new Map()): ProjectDraftRecord => ({
  id: r.id,
  status: r.status,
  draft: r.fields,
  form: r.form,
  docType: r.doc_type,
  file: { name: r.file_name, size: num(r.file_size) ?? 0, type: r.file_mime ?? "" },
  storagePath: r.storage_path ?? null,
  projectId: r.project_id ?? null,
  createdBy: r.created_by ? names.get(r.created_by) ?? null : null,
  createdAt: stamp(r.created_at),
  updatedAt: stamp(r.updated_at),
});

export const toTask = (r: Row): Task => ({
  id: r.id,
  projectId: r.project_id ?? null,
  title: r.title,
  dueOn: r.due_on ?? null,
  assigneeId: r.assignee_id ?? null,
  status: r.status,
  source: r.source,
  sourceKey: r.source_key ?? null,
  createdAt: stamp(r.created_at),
  doneAt: localStamp(r.done_at),
});

export const toActivity = (r: Row): Activity => ({ id: r.id, projectId: r.project_id ?? null, kind: r.kind, text: r.text, actor: r.actor, at: stamp(r.at) });

export const toMailbox = (r: Row): Mailbox => ({
  id: r.id,
  label: r.label,
  address: r.address,
  provider: r.provider,
  status: r.status,
  lastCheckedAt: localStamp(r.last_checked_at),
  watchFolder: r.watch_folder,
});

export const toInboxItem = (r: Row): InboxItem => ({
  id: r.id,
  mailboxId: r.mailbox_id,
  messageId: r.message_id,
  receivedAt: stamp(r.received_at),
  fromName: r.from_name ?? "",
  fromEmail: r.from_email,
  subject: r.subject ?? "",
  bodyExcerpt: r.body_excerpt ?? "",
  status: r.status,
  projectId: r.project_id ?? null,
  confidence: num(r.confidence),
  reason: r.reason ?? null,
  createdAt: stamp(r.created_at),
});

export const toInboxAttachment = (r: Row): InboxAttachment => ({
  id: r.id,
  itemId: r.item_id,
  fileName: r.file_name,
  mime: r.mime,
  sizeBytes: Number(r.size_bytes),
  storagePath: r.storage_path ?? null,
  projectId: r.project_id ?? null,
  folderPath: r.folder_path ?? null,
  confidence: num(r.confidence),
  status: r.status,
  documentId: r.document_id ?? null,
  corrected: Boolean(r.corrected),
});

export const toAgentRun = (r: Row): AgentRun => ({
  id: r.id,
  mailboxId: r.mailbox_id,
  startedAt: stamp(r.started_at),
  finishedAt: localStamp(r.finished_at),
  fetched: r.fetched,
  filed: r.filed,
  toReview: r.to_review,
  ignored: r.ignored,
  errors: r.errors,
  note: r.note ?? null,
});

export const toAgentRule = (r: Row, names: Map<string, string> = new Map()): AgentRule => ({
  id: r.id,
  kind: r.kind,
  match: r.match,
  projectId: r.project_id ?? null,
  folderPath: r.folder_path ?? null,
  createdBy: r.created_by ? names.get(r.created_by) ?? null : null,
  createdAt: stamp(r.created_at),
});

export const toAgentFeedback = (r: Row, names: Map<string, string> = new Map()): AgentFeedback => ({
  id: r.id,
  attachmentId: r.attachment_id,
  action: r.action,
  projectId: r.project_id ?? null,
  folderPath: r.folder_path ?? null,
  createdBy: r.created_by ? names.get(r.created_by) ?? null : null,
  createdAt: stamp(r.created_at),
});

/** Dateiname für den Speicher: nur ASCII, keine Pfadtrenner. Der echte Name bleibt in der Tabelle documents. */
export function storageSafeName(name: string): string {
  const map: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" };
  const ascii = name
    .replace(/[äöüÄÖÜß]/g, (c) => map[c])
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return ascii || "datei";
}

/** Meldungen der Datenbank in verständliche Sätze übersetzen. */
export function dbErrorMessage(e: { message?: string; code?: string } | null | undefined, fallback = "Die Aktion ist fehlgeschlagen"): string {
  const msg = e?.message ?? "";
  const code = e?.code ?? "";
  if (code === "42501" || /permission denied|row-level security/i.test(msg)) return "Keine Berechtigung für diese Aktion";
  if (code === "23505") return "Diesen Eintrag gibt es schon";
  if (code === "23503") return "Der Eintrag verweist auf etwas, das es nicht (mehr) gibt";
  if (code === "PGRST205" || /schema cache/i.test(msg)) return "Die Datenbank ist noch nicht eingerichtet (Migrationen fehlen). Siehe docs/supabase-einrichten.md";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "Keine Verbindung zur Datenbank. Bitte Internetverbindung prüfen.";
  if (/jwt expired|invalid jwt/i.test(msg)) return "Die Anmeldung ist abgelaufen. Bitte neu anmelden.";
  // Eigene Meldungen aus Funktionen und Constraints (deutsch) unverändert zeigen
  return msg || fallback;
}
