// Supabase-Repo: dieselbe Schnittstelle wie das Demo-Repo, aber gegen die echte Datenbank.
// Was jemand sehen und ändern darf, entscheidet die Datenbank (GRANT in Migration 0004, RLS in 0001/0002).
// Die Prüfungen hier dienen nur verständlichen Fehlermeldungen, sie sind kein Schutz.

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { filterDocuments, type DocumentFilter, type DocumentRow } from "./documentFilters";
import { cleanMeta } from "./extract/applyDraft";
import { checkContractFile } from "./extract/contractFile";
import { contractFolder } from "./extract/filing";
import type { ExtractResponse } from "./extract/types";
import { checkFile } from "./files";
import { isAllowedFolder, templateOf } from "./folders";
import { todayIso } from "./format";
import { planProjectUpdate } from "./projectEdit";
import { cleanMasterName, followupForMissingInfo, infoStateOfNew, validateNewProject } from "./projectForm";
import {
  PermissionError,
  type BauherrInput,
  type ContractFiling,
  type DraftInput,
  type MailboxInput,
  type ProjectFields,
  type ProjectPatch,
  type NewAgentRule,
  type NewProject,
  type NewTask,
  type Repo,
  type ReviewResolution,
  type TaskPatch,
  type UploadInput,
} from "./repo";
import type { SessionUser } from "./session";
import { getSupabase } from "./supabase/client";
import {
  COLS,
  dbErrorMessage,
  groupSteps,
  storageSafeName,
  toActivity,
  toAgentFeedback,
  toAgentRule,
  toAgentRun,
  toBauherrContacts,
  toCompany,
  toDocument,
  toFolderTemplate,
  toInboxAttachment,
  toInboxItem,
  toInvoice,
  toMailbox,
  toParty,
  toProject,
  toProjectDraft,
  toSalesperson,
  toStepDefinition,
  toTask,
  toTeamMember,
  type Row,
} from "./supabase/mappers";
import type { ActivityKind, AgentSettings, Dataset, MailboxStatus } from "./types";

export const BUCKET = "project-documents";
/** Die Daten-API liefert höchstens 1000 Zeilen je Anfrage: größere Tabellen werden seitenweise geholt. */
const PAGE = 1000;
/** Aktivitäten und Agent-Läufe sind Protokolle: die App lädt nur die neuesten. */
export const ACTIVITY_LIMIT = 500;
const RUN_LIMIT = 500;
const DEFAULT_SETTINGS: AgentSettings = { autoFileThreshold: 0.9, suggestThreshold: 0.6 };
const AGENT_NOT_CONNECTED = "Der Posteingangs-Agent ist noch nicht angeschlossen (folgt in einem späteren Schritt). Prüfliste, Regeln und Postfächer arbeiten bereits mit der Datenbank.";

function fail(error: PostgrestError | { message: string; code?: string } | null, fallback?: string): never {
  const msg = dbErrorMessage(error, fallback);
  if (msg === "Keine Berechtigung für diese Aktion") throw new PermissionError();
  throw new Error(msg);
}

/** Alle Zeilen einer Tabelle, seitenweise. `order` muss eindeutig sortieren, sonst können Zeilen doppelt oder gar nicht kommen. */
async function all(sb: SupabaseClient, table: string, cols: string, order: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(cols);
    for (const o of order) q = q.order(o, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) fail(error, `${table} konnte nicht geladen werden`);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function latest(sb: SupabaseClient, table: string, cols: string, by: string, limit: number): Promise<Row[]> {
  const { data, error } = await sb.from(table).select(cols).order(by, { ascending: false }).limit(limit);
  if (error) fail(error, `${table} konnte nicht geladen werden`);
  return (data ?? []) as unknown as Row[];
}

const PROJECT_COLUMN: Record<keyof ProjectFields, string> = {
  bauherrLabel: "bauherr_label",
  abmNr: "abm_nr",
  hausbauNr: "hausbau_nr",
  companyId: "company_id",
  salespersonId: "salesperson_id",
  location: "location",
  architectId: "architect_id",
  planerId: "planer_id",
  intakeMonth: "intake_month",
  baubetreuung: "baubetreuung",
  flurstueck: "flurstueck",
  gemarkung: "gemarkung",
};

/** Projektfelder → Spaltennamen. Nur genannte Felder; leere Texte werden zu null. */
export function projectJson(fields: Partial<ProjectFields>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(fields) as [keyof ProjectFields, string | null | undefined][]) {
    if (value === undefined) continue;
    out[PROJECT_COLUMN[key]] = value?.trim() || null;
  }
  return out;
}

export function bauherrJson(b: BauherrInput): Record<string, string | null> {
  const v = (x: string | null | undefined) => x?.trim() || null;
  return { name: v(b.name), phone: v(b.phone), email: v(b.email), address: v(b.address), building_address: v(b.buildingAddress), name2: v(b.name2), phone2: v(b.phone2), email2: v(b.email2) };
}

export function createSupabaseRepo(): Repo {
  const sb = getSupabase();
  let user: SessionUser = { name: "", role: "freiberufler" };
  let uid: string | null = null;
  /** Zuletzt geladener Stand: für Prüfungen vor dem Speichern (Ordnervorlage, doppelte ABM-Nr., Schrittnamen). */
  let last: Dataset | null = null;

  const isStaff = () => user.role === "admin" || user.role === "mitarbeiter";
  const requireStaff = () => {
    if (!isStaff()) throw new PermissionError();
  };
  async function userId(): Promise<string> {
    if (uid) return uid;
    const { data } = await sb.auth.getSession();
    uid = data.session?.user.id ?? null;
    if (!uid) throw new Error("Nicht angemeldet. Bitte neu anmelden.");
    return uid;
  }
  const templates = () => last?.folderTemplates ?? [];
  const stepLabel = (key: string) => last?.stepDefinitions.find((s) => s.key === key)?.label ?? key;

  /** Protokolleintrag. Schlägt er fehl, bleibt die eigentliche Änderung trotzdem gültig. */
  async function log(projectId: string | null, kind: ActivityKind, text: string) {
    if (!isStaff()) return; // Aktivitäten schreiben nur Mitarbeiter (RLS)
    const { error } = await sb.from("activities").insert({ project_id: projectId, kind, text, actor: user.name, actor_id: await userId() });
    if (error) console.warn("Aktivität nicht protokolliert:", error.message);
  }

  async function userNames(): Promise<Map<string, string>> {
    const { data, error } = await sb.rpc("list_user_names");
    if (error) fail(error, "Namen konnten nicht geladen werden");
    return new Map(((data ?? []) as Row[]).map((r) => [r.user_id, r.full_name || "Unbekannt"]));
  }

  /** Pfad einer Entwurfsdatei im Speicher: "drafts/<Entwurf>/<Dateiname>". Nur Admin und Mitarbeiter (Migration 0010). */
  const draftPath = (id: string, name: string) => `drafts/${id}/${storageSafeName(name)}`;

  async function draftRow(id: string): Promise<Row> {
    const { data, error } = await sb.from("project_drafts").select(COLS.project_drafts).eq("id", id).maybeSingle();
    if (error) fail(error, "Entwurf konnte nicht geladen werden");
    if (!data) throw new Error("Entwurf nicht gefunden");
    return data as unknown as Row;
  }

  const repo: Repo = {
    mode: "supabase",

    async load(u) {
      if (u.id !== uid) last = null;
      user = u;
      uid = u.id ?? null;
      const [companies, salespeople, team, stepDefs, folders, projects, steps, invoices, bauherren, parties, documents, tasks, activities, mailboxes, items, atts, runs, rules, feedback, drafts, settings, names] =
        await Promise.all([
          all(sb, "companies", COLS.companies, ["name", "id"]),
          all(sb, "salespeople", COLS.salespeople, ["name", "id"]),
          all(sb, "team_members", COLS.team_members, ["name", "id"]),
          all(sb, "step_definitions", COLS.step_definitions, ["sort_order"]),
          all(sb, "folder_templates", COLS.folder_templates, ["sort", "path"]),
          all(sb, "projects", COLS.projects, ["created_at", "id"]),
          all(sb, "project_steps", COLS.project_steps, ["project_id", "step_key"]),
          all(sb, "invoices", COLS.invoices, ["id"]),
          all(sb, "bauherren", COLS.bauherren, ["id"]),
          all(sb, "project_parties", COLS.project_parties, ["project_id", "role"]),
          all(sb, "documents", COLS.documents, ["created_at", "id"]),
          all(sb, "tasks", COLS.tasks, ["created_at", "id"]),
          latest(sb, "activities", COLS.activities, "at", ACTIVITY_LIMIT),
          all(sb, "mailboxes", COLS.mailboxes, ["label", "id"]),
          all(sb, "inbox_items", COLS.inbox_items, ["received_at", "id"]),
          all(sb, "inbox_attachments", COLS.inbox_attachments, ["id"]),
          latest(sb, "agent_runs", COLS.agent_runs, "started_at", RUN_LIMIT),
          all(sb, "agent_rules", COLS.agent_rules, ["created_at", "id"]),
          all(sb, "agent_feedback", COLS.agent_feedback, ["created_at", "id"]),
          // Entwürfe: Freiberufler bekommen von der Datenbank keine Zeile
          sb.from("project_drafts").select(COLS.project_drafts).eq("status", "offen").order("created_at", { ascending: false }).limit(PAGE),
          sb.from("agent_settings").select(COLS.agent_settings).maybeSingle(),
          userNames(),
        ]);
      if (settings.error) fail(settings.error, "Einstellungen des Agenten konnten nicht geladen werden");
      if (drafts.error) fail(drafts.error, "Entwürfe konnten nicht geladen werden");
      const s = settings.data as Row | null;
      const stepsByProject = groupSteps(steps);
      const data: Dataset = {
        companies: companies.map(toCompany),
        salespeople: salespeople.map(toSalesperson),
        team: team.map(toTeamMember),
        stepDefinitions: stepDefs.map(toStepDefinition),
        folderTemplates: folders.map(toFolderTemplate),
        // neueste zuerst, wie im Demo-Modus
        projects: projects.map((p) => toProject(p, stepsByProject.get(p.id) ?? {})).reverse(),
        invoices: invoices.map(toInvoice),
        bauherren: toBauherrContacts(bauherren, projects),
        parties: parties.map(toParty),
        documents: documents.map((d) => toDocument(d, names)),
        tasks: tasks.map(toTask),
        activities: activities.map(toActivity),
        mailboxes: mailboxes.map(toMailbox),
        inboxItems: items.map(toInboxItem),
        inboxAttachments: atts.map(toInboxAttachment),
        agentRuns: runs.map(toAgentRun).reverse(),
        agentRules: rules.map((r) => toAgentRule(r, names)),
        agentFeedback: feedback.map((f) => toAgentFeedback(f, names)),
        projectDrafts: ((drafts.data ?? []) as unknown as Row[]).map((d) => toProjectDraft(d, names)),
        agentSettings: s ? { autoFileThreshold: Number(s.auto_file_threshold), suggestThreshold: Number(s.suggest_threshold) } : DEFAULT_SETTINGS,
      };
      last = data;
      return structuredClone(data);
    },

    async setStepDate(projectId, stepKey, date) {
      requireStaff();
      if (last && !last.stepDefinitions.some((s) => s.key === stepKey)) throw new Error(`Unbekannter Schritt ${stepKey}`);
      if (date) {
        const { data, error } = await sb
          .from("project_steps")
          .upsert({ project_id: projectId, step_key: stepKey, occurred_on: date }, { onConflict: "project_id,step_key" })
          .select("step_key");
        if (error) fail(error);
        if (!data?.length) throw new PermissionError();
      } else {
        const { error } = await sb.from("project_steps").delete().eq("project_id", projectId).eq("step_key", stepKey);
        if (error) fail(error);
      }
      await log(projectId, "schritt", date ? `${stepLabel(stepKey)} erledigt` : `${stepLabel(stepKey)} zurückgesetzt`);
    },

    async createProject(input: NewProject) {
      requireStaff();
      // Dieselben Regeln wie im Formular
      const first = Object.values(validateNewProject(input, last?.projects ?? []))[0];
      if (first) throw new Error(first);
      const followup = followupForMissingInfo(infoStateOfNew(input), todayIso());
      // Eine Funktion in der Datenbank legt Projekt, Bauherr, Vermesser, Aufgabe und Protokoll in einer Transaktion an (Migration 0008)
      const created = await sb.rpc("create_project", {
        p_project: {
          ...projectJson({
            bauherrLabel: input.bauherrLabel,
            abmNr: input.kind === "bauvoranfrage" ? "Bauvoranfrage" : input.abmNr,
            hausbauNr: input.hausbauNr,
            companyId: input.companyId,
            salespersonId: input.salespersonId,
            location: input.location,
            architectId: input.architectId,
            planerId: input.planerId,
            intakeMonth: input.intakeMonth,
            flurstueck: input.flurstueck ?? null,
            gemarkung: input.gemarkung ?? null,
          }),
          kind: input.kind,
        },
        p_bauherr: input.bauherr ? bauherrJson(input.bauherr) : null,
        p_vermesser: input.vermesser?.trim() || null,
        p_followup_title: followup?.title ?? null,
        p_followup_due: followup?.dueOn ?? null,
        // Ordner sind keine eigenen Zeilen: der Baum entsteht aus der Vorlage, ein Ordner "existiert", sobald eine Datei darin liegt
        p_folders_note: input.createFolders ? `Projektordner aus der Vorlage angelegt (${templates().length} Ordner)` : null,
      });
      if (created.error) fail(created.error, "Projekt konnte nicht angelegt werden");
      const { data, error } = await sb.from("projects").select(COLS.projects).eq("id", created.data as string).single();
      if (error) fail(error, "Projekt wurde angelegt, konnte aber nicht geladen werden. Bitte Seite neu laden.");
      return toProject(data as unknown as Row);
    },

    async updateProject(projectId, patch: ProjectPatch) {
      requireStaff();
      if (!last) throw new Error("Daten noch nicht geladen. Bitte Seite neu laden.");
      const plan = planProjectUpdate(last, projectId, patch, todayIso());
      const first = Object.values(plan.errors)[0];
      if (first) throw new Error(first);
      // Eine Funktion in der Datenbank ändert Projekt, Bauherr, Beteiligte, Aufgabe und Protokoll in einer Transaktion (Migration 0008)
      const { error } = await sb.rpc("update_project", {
        p_id: projectId,
        p_project: projectJson(plan.project),
        p_bauherr: plan.bauherr ? bauherrJson(plan.bauherr) : null,
        p_parties: Object.keys(plan.parties).length ? plan.parties : null,
        p_activity: plan.activity,
        p_followup_title: plan.followup?.title ?? null,
        p_followup_due: plan.followup?.dueOn ?? null,
      });
      if (error) fail(error, "Projektdaten konnten nicht gespeichert werden");
    },

    async createCompany(name) {
      requireStaff();
      const c = cleanMasterName(name, (last?.companies ?? []).map((x) => x.name));
      if (!c.ok) throw new Error(c.reason);
      const { data, error } = await sb.from("companies").insert({ name: c.name }).select(COLS.companies).single();
      if (error) fail(error, "Hausbaufirma konnte nicht angelegt werden");
      return toCompany(data as unknown as Row);
    },

    async createSalesperson(companyId, name) {
      requireStaff();
      const c = cleanMasterName(name, (last?.salespeople ?? []).filter((s) => s.companyId === companyId).map((x) => x.name));
      if (!c.ok) throw new Error(c.reason);
      const { data, error } = await sb.from("salespeople").insert({ company_id: companyId, name: c.name }).select(COLS.salespeople).single();
      if (error) fail(error, "Verkäufer konnte nicht angelegt werden");
      return toSalesperson(data as unknown as Row);
    },

    async createTeamMember(name, role) {
      requireStaff();
      const c = cleanMasterName(name, (last?.team ?? []).filter((t) => t.role === role).map((x) => x.name));
      if (!c.ok) throw new Error(c.reason);
      const { data, error } = await sb.from("team_members").insert({ name: c.name, role }).select(COLS.team_members).single();
      if (error) fail(error, "Eintrag konnte nicht angelegt werden");
      return toTeamMember(data as unknown as Row);
    },

    async setProjectStatus(projectId, status) {
      requireStaff();
      const { data, error } = await sb.from("projects").update({ status }).eq("id", projectId).neq("status", status).select("id");
      if (error) fail(error);
      if (!data?.length) return; // schon in diesem Status (oder nicht sichtbar)
      const text = { aktiv: "Projekt wieder aktiv", abgeschlossen: "Projekt abgeschlossen", storno: "Projekt storniert" }[status];
      await log(projectId, "projekt", text);
    },

    async markInvoiceSent(invoiceId, sentOn) {
      requireStaff();
      // Nur wenn noch nicht versendet: zwei gleichzeitige Klicks ergeben einen Eintrag, nicht zwei
      const { data, error } = await sb
        .from("invoices")
        .update({ status: "versendet", sent_on: sentOn })
        .eq("id", invoiceId)
        .in("status", ["geplant", "faellig"])
        .select("project_id, label");
      if (error) fail(error);
      const inv = (data as Row[] | null)?.[0];
      if (inv) await log(inv.project_id, "rechnung", `Rechnung versendet: ${inv.label}`);
    },

    async uploadDocument({ projectId, folderPath, file, blob, docType, meta }: UploadInput) {
      if (folderPath.includes("{datum}")) throw new Error("Für diesen Ordner fehlt das Datum");
      if (!isAllowedFolder(folderPath, templates())) throw new Error("Ordner gehört nicht zur Vorlage");
      const check = checkFile(file.name, file.size);
      if (!check.ok) throw new Error(check.reason);
      if (!blob) throw new Error("Die Datei fehlt (nur Angaben zur Datei übergeben)");
      const me = await userId();
      // Pfad im Speicher: "<Projekt-ID>/<zufällig>/<Dateiname ohne Sonderzeichen>". Die Projekt-ID vorn ist die
      // Grundlage der Zugriffsregel im Speicher; der echte Name und der Ordner stehen in der Tabelle documents.
      const storagePath = `${projectId}/${crypto.randomUUID()}/${storageSafeName(file.name)}`;
      const up = await sb.storage.from(BUCKET).upload(storagePath, blob, { contentType: file.type || "application/octet-stream", upsert: false });
      if (up.error) fail({ message: up.error.message }, "Datei konnte nicht hochgeladen werden");
      const { data, error } = await sb
        .from("documents")
        .insert({
          project_id: projectId,
          name: file.name,
          storage_path: storagePath,
          size_bytes: file.size,
          mime: file.type || null,
          folder_path: folderPath,
          source: "upload",
          received_on: todayIso(),
          uploaded_by: me,
          doc_type: docType ?? null,
          meta: meta ? cleanMeta(meta) : {},
        })
        .select(COLS.documents)
        .single();
      if (error) {
        // Eintrag fehlgeschlagen: die eben hochgeladene Datei wieder entfernen (darf nur Mitarbeiter; sonst bleibt sie ohne Eintrag liegen)
        await sb.storage.from(BUCKET).remove([storagePath]);
        fail(error, "Datei konnte nicht eingetragen werden");
      }
      await log(projectId, "datei", `${file.name} abgelegt`);
      return toDocument(data as unknown as Row, new Map([[me, user.name]]));
    },

    async documentUrl(doc) {
      // Kurzlebiger Link (60 Sekunden); die Zugriffsregel des Speichers prüft das Projekt
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(doc.storagePath, 60);
      if (error || !data?.signedUrl) throw new Error("Zu diesem Eintrag liegt keine Datei im Speicher.");
      return data.signedUrl;
    },

    async listDocuments(filter: DocumentFilter) {
      // Sichtbarkeit regelt die Datenbank: Freiberufler bekommen nur Dokumente zugewiesener Projekte und keine Maildaten.
      // Gefiltert wird hier im Repo mit denselben Regeln wie im Demo-Modus (bei Pilotgröße reicht das; siehe docs/entscheidungen.md).
      const [docs, projects, atts, items, names] = await Promise.all([
        all(sb, "documents", COLS.documents, ["created_at", "id"]),
        all(sb, "projects", "id, abm_nr, bauherr_label, location", ["id"]),
        all(sb, "inbox_attachments", "id, item_id, confidence", ["id"]),
        all(sb, "inbox_items", "id, subject, from_name, from_email, received_at, reason", ["id"]),
        userNames(),
      ]);
      const projectById = new Map(projects.map((p) => [p.id, p]));
      const attById = new Map(atts.map((a) => [a.id, a]));
      const itemById = new Map(items.map((i) => [i.id, toInboxItem({ ...i, mailbox_id: "", message_id: "", status: "abgelegt", created_at: i.received_at })]));
      const rows: DocumentRow[] = docs.map((d) => {
        const doc = toDocument(d, names);
        const p = projectById.get(doc.projectId);
        const att = doc.sourceItemId ? attById.get(doc.sourceItemId) : undefined;
        const item = att ? itemById.get(att.item_id) : undefined;
        return {
          doc,
          project: p ? { id: p.id, abmNr: p.abm_nr ?? null, bauherrLabel: p.bauherr_label, location: p.location ?? null } : null,
          mail: item
            ? { subject: item.subject, fromName: item.fromName, fromEmail: item.fromEmail, receivedAt: item.receivedAt, reason: item.reason, confidence: att?.confidence == null ? null : Number(att.confidence) }
            : null,
        };
      });
      return filterDocuments(rows, filter, todayIso());
    },

    async createTask(input: NewTask) {
      requireStaff();
      const title = input.title.trim();
      if (!title) throw new Error("Titel fehlt");
      const row = {
        project_id: input.projectId,
        title,
        due_on: input.dueOn,
        assignee_id: input.assigneeId,
        source: input.source ?? "manuell",
        source_key: input.sourceKey ?? null,
        created_by: await userId(),
      };
      if (row.source_key) {
        // Aufgaben aus Warnungen: source_key ist eindeutig. Legen zwei Leute gleichzeitig an, gewinnt die erste Zeile.
        const ins = await sb.from("tasks").upsert(row, { onConflict: "source_key", ignoreDuplicates: true }).select(COLS.tasks);
        if (ins.error) fail(ins.error, "Aufgabe konnte nicht angelegt werden");
        if (ins.data?.length) return toTask(ins.data[0] as unknown as Row);
        const ex = await sb.from("tasks").select(COLS.tasks).eq("source_key", row.source_key).single();
        if (ex.error) fail(ex.error);
        return toTask(ex.data as unknown as Row);
      }
      const { data, error } = await sb.from("tasks").insert(row).select(COLS.tasks).single();
      if (error) fail(error, "Aufgabe konnte nicht angelegt werden");
      const t = toTask(data as unknown as Row);
      // Automatisch aus Warnungen erzeugte Aufgaben nicht protokollieren (sonst verdrängen sie echte Ereignisse)
      if (t.source !== "warnung") await log(t.projectId, "aufgabe", `Aufgabe angelegt: ${t.title}`);
      return t;
    },

    async updateTask(id, patch: TaskPatch) {
      requireStaff();
      const cur = await sb.from("tasks").select("status, title, project_id").eq("id", id).maybeSingle();
      if (cur.error) fail(cur.error);
      if (!cur.data) throw new Error("Aufgabe nicht gefunden");
      const wasDone = cur.data.status === "erledigt";
      const upd: Row = {};
      if (patch.title !== undefined) upd.title = patch.title.trim();
      if (patch.dueOn !== undefined) upd.due_on = patch.dueOn;
      if (patch.assigneeId !== undefined) upd.assignee_id = patch.assigneeId;
      if (patch.status === "erledigt" && !wasDone) Object.assign(upd, { status: "erledigt", done_at: new Date().toISOString() });
      if (patch.status === "offen" && wasDone) Object.assign(upd, { status: "offen", done_at: null });
      if (!Object.keys(upd).length) {
        const same = await sb.from("tasks").select(COLS.tasks).eq("id", id).single();
        if (same.error) fail(same.error);
        return toTask(same.data as unknown as Row);
      }
      const { data, error } = await sb.from("tasks").update(upd).eq("id", id).select(COLS.tasks).single();
      if (error) fail(error, "Aufgabe konnte nicht geändert werden");
      const t = toTask(data as unknown as Row);
      if (upd.status === "erledigt") await log(t.projectId, "aufgabe", `Aufgabe erledigt: ${t.title}`);
      return t;
    },

    async setMailboxStatus(id, status: MailboxStatus) {
      requireStaff();
      const { data, error } = await sb.from("mailboxes").update({ status }).eq("id", id).select("id");
      if (error) fail(error);
      if (!data?.length) throw new Error("Postfach nicht gefunden");
    },

    async saveAgentRule(rule: NewAgentRule) {
      requireStaff();
      if (rule.folderPath && !isAllowedFolder(rule.folderPath, templates())) throw new Error("Ordner gehört nicht zur Vorlage");
      const me = await userId();
      const { data, error } = await sb
        .from("agent_rules")
        .insert({ kind: rule.kind, match: rule.match.trim().toLowerCase(), project_id: rule.projectId, folder_path: rule.folderPath, created_by: me })
        .select(COLS.agent_rules)
        .single();
      if (error) fail(error, "Regel konnte nicht gespeichert werden");
      return toAgentRule(data as unknown as Row, new Map([[me, user.name]]));
    },

    async removeAgentRule(id) {
      requireStaff();
      const { error } = await sb.from("agent_rules").delete().eq("id", id);
      if (error) fail(error);
    },

    async saveAgentSettings(settings: AgentSettings) {
      requireStaff();
      if (!(settings.suggestThreshold >= 0 && settings.suggestThreshold < settings.autoFileThreshold && settings.autoFileThreshold <= 1)) {
        throw new Error("Schwellen ungültig: 0 ≤ Vorschlag < Auto-Ablage ≤ 100 %");
      }
      const { data, error } = await sb
        .from("agent_settings")
        .update({ auto_file_threshold: settings.autoFileThreshold, suggest_threshold: settings.suggestThreshold })
        .eq("id", true)
        .select("auto_file_threshold");
      if (error) fail(error);
      // Die Zeilenregel lässt nur Admins ändern; bei allen anderen trifft das Update still keine Zeile
      if (!data?.length) throw new PermissionError("Die Schwellen ändert nur ein Admin");
    },

    async saveMailbox(input: MailboxInput) {
      requireStaff();
      const address = input.address.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error("Bitte eine gültige Mailadresse eintragen");
      if (!input.label.trim()) throw new Error("Bitte einen Namen eintragen");
      const row = { label: input.label.trim(), address, provider: input.provider, watch_folder: input.watchFolder.trim() || "Posteingang" };
      const q = input.id
        ? sb.from("mailboxes").update(row).eq("id", input.id)
        : // Neues Postfach startet pausiert: Zugangsdaten hinterlegt später der Admin im Vault, nie in dieser Tabelle
          sb.from("mailboxes").insert({ ...row, status: "pausiert" });
      const { data, error } = await q.select(COLS.mailboxes).maybeSingle();
      if (error) fail(error.code === "23505" ? { message: "Dieses Postfach gibt es schon" } : error, "Postfach konnte nicht gespeichert werden");
      if (!data) throw new Error("Postfach nicht gefunden");
      return toMailbox(data as unknown as Row);
    },

    async runAgent() {
      requireStaff();
      throw new Error(AGENT_NOT_CONNECTED);
    },

    async resolveReview(attachmentId, r: ReviewResolution) {
      requireStaff();
      let ruleFolder: string | null = null;
      if (r.action === "aendern") {
        if (!r.projectId || !r.folderPath) throw new Error("Projekt und Ordner wählen");
        if (!isAllowedFolder(r.folderPath, templates()) || r.folderPath.includes("{datum}")) throw new Error("Ordner gehört nicht zur Vorlage");
      }
      if (r.rememberRule === "absender_ordner") {
        const folder = r.action === "aendern" ? r.folderPath : last?.inboxAttachments.find((a) => a.id === attachmentId)?.folderPath;
        ruleFolder = folder ? templateOf(folder, templates())?.path ?? null : null;
      }
      // Eine Funktion in der Datenbank erledigt alle Schritte in einer Transaktion (Migration 0005)
      const { error } = await sb.rpc("resolve_review", {
        p_attachment: attachmentId,
        p_action: r.action,
        p_project: r.action === "aendern" ? r.projectId : null,
        p_folder: r.action === "aendern" ? r.folderPath : null,
        p_rule: r.rememberRule ?? null,
        p_rule_folder: ruleFolder,
      });
      if (error) fail(error);
    },

    async reportWrongFiling(attachmentId) {
      requireStaff();
      const { error } = await sb.rpc("report_wrong_filing", { p_attachment: attachmentId });
      if (error) fail(error);
    },
    // ------------------------------------------------------------- Neues Projekt aus einem Vertrag

    async saveProjectDraft(input: DraftInput) {
      requireStaff();
      const names = new Map([[await userId(), user.name]]);
      if (input.id) {
        const { data, error } = await sb.from("project_drafts").update({ fields: input.draft, form: input.form, doc_type: input.docType }).eq("id", input.id).eq("status", "offen").select(COLS.project_drafts).maybeSingle();
        if (error) fail(error, "Entwurf konnte nicht gespeichert werden");
        if (!data) throw new Error("Der Entwurf ist nicht mehr offen.");
        return toProjectDraft(data as unknown as Row, names);
      }
      const check = checkContractFile(input.file);
      if (!check.ok) throw new Error(check.reason);
      if (!input.blob) throw new Error("Die Datei fehlt (nur Angaben zur Datei übergeben)");
      const created = await sb
        .from("project_drafts")
        .insert({ fields: input.draft, form: input.form, doc_type: input.docType, file_name: input.file.name, file_size: input.file.size, file_mime: input.file.type || null })
        .select("id")
        .single();
      if (created.error) fail(created.error, "Entwurf konnte nicht gespeichert werden");
      const id = (created.data as Row).id as string;
      const path = draftPath(id, input.file.name);
      const up = await sb.storage.from(BUCKET).upload(path, input.blob, { contentType: input.file.type || "application/octet-stream", upsert: false });
      if (up.error) {
        // ohne Datei ist der Entwurf nicht fortsetzbar: gleich wieder schließen
        await sb.from("project_drafts").update({ status: "verworfen" }).eq("id", id);
        fail({ message: up.error.message }, "Datei konnte nicht hochgeladen werden");
      }
      const { data, error } = await sb.from("project_drafts").update({ storage_path: path }).eq("id", id).select(COLS.project_drafts).single();
      if (error) fail(error, "Entwurf konnte nicht gespeichert werden");
      return toProjectDraft(data as unknown as Row, names);
    },

    async discardProjectDraft(id) {
      requireStaff();
      const row = await draftRow(id);
      if (row.storage_path) await sb.storage.from(BUCKET).remove([row.storage_path]);
      const { error } = await sb.from("project_drafts").update({ status: "verworfen", storage_path: null }).eq("id", id).eq("status", "offen");
      if (error) fail(error, "Entwurf konnte nicht verworfen werden");
    },

    async draftFile(id) {
      requireStaff();
      const row = await draftRow(id);
      if (!row.storage_path) return null;
      const { data, error } = await sb.storage.from(BUCKET).download(row.storage_path);
      if (error || !data) return null;
      return data;
    },

    async fileContract({ projectId, docType, meta, file, blob, draftId }: ContractFiling) {
      requireStaff();
      const check = checkContractFile(file);
      if (!check.ok) throw new Error(check.reason);
      const draft = draftId ? await draftRow(draftId) : null;
      let content = blob ?? null;
      if (!content && draft?.storage_path) content = (await sb.storage.from(BUCKET).download(draft.storage_path)).data;
      if (!content) throw new Error("Die Datei zum Vertrag fehlt. Bitte das Dokument noch einmal auswählen.");
      // Der Typ bestimmt den Ordner; abgelegt wird unter der Projekt-ID (Zugriffsregel des Speichers)
      const doc = await repo.uploadDocument({ projectId, folderPath: contractFolder(docType, templates()), file, blob: content, docType, meta });
      if (draft) {
        const { error } = await sb.from("project_drafts").update({ status: "uebernommen", project_id: projectId, document_id: doc.id, storage_path: null }).eq("id", draft.id);
        if (error) console.warn("Entwurf nicht abgeschlossen:", error.message);
        else if (draft.storage_path) await sb.storage.from(BUCKET).remove([draft.storage_path]);
      }
      return doc;
    },

    async extractProject(request): Promise<ExtractResponse> {
      requireStaff();
      // Die Funktion prüft Anmeldung, Rolle, Freischaltung und Limits selbst; der Schlüssel zum KI-Dienst liegt nur dort.
      const { data, error } = await sb.functions.invoke("extract-project", { body: request });
      if (error) {
        // Fehlerantwort der Funktion (z. B. 403, 429): die Meldung steht im Antworttext
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        if (body && typeof body === "object" && body.ok === false && typeof body.message === "string") return body as ExtractResponse;
        return { ok: false, code: "error", message: "Die Auslesung ist gerade nicht erreichbar." };
      }
      if (!data || typeof data !== "object" || typeof (data as { ok?: unknown }).ok !== "boolean") return { ok: false, code: "error", message: "Unerwartete Antwort der Auslesung." };
      return data as ExtractResponse;
    },
  };
  return repo;
}
