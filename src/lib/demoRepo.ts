// Demo-Repo: hält den erfundenen Datenbestand im Speicher (Neuladen setzt zurück).
// Bildet die Zugriffsregeln der Datenbank (RLS, Migration 0001/0002) für die Demo nach,
// damit die Rollen-Umschaltung zeigt, was z. B. ein Freiberufler sieht. Echter Schutz liegt in der Datenbank.

import { buildDemoDataset, DEMO_FREELANCER_TEAM_ID } from "../data/demoData";
import { checkFile } from "./files";
import { isAllowedFolder } from "./folders";
import { todayIso } from "./format";
import { PermissionError, type NewAgentRule, type NewProject, type NewTask, type Repo, type TaskPatch, type UploadInput } from "./repo";
import type { SessionUser } from "./session";
import type { Activity, AgentSettings, Dataset, MailboxStatus, Project, ProjectDocument, Task } from "./types";

const DELAY_MS = 120; // kleine Verzögerung, damit Ladezustände sichtbar und realistisch bleiben

function wait<T>(value: T, ms = DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function now(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${todayIso(d)}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let idCounter = 0;
function newId(prefix: string) {
  idCounter += 1;
  return `${prefix}-n${Date.now().toString(36)}${idCounter}`;
}

/** Was eine Rolle sehen darf (entspricht den RLS-Policies). */
export function visibleFor(db: Dataset, user: SessionUser): Dataset {
  if (user.role !== "freiberufler") return db;
  const projects = db.projects.filter((p) => p.planerId === DEMO_FREELANCER_TEAM_ID);
  const ids = new Set(projects.map((p) => p.id));
  return {
    ...db,
    companies: [],
    salespeople: [],
    projects,
    invoices: [],
    bauherren: [],
    parties: db.parties.filter((x) => ids.has(x.projectId)),
    documents: db.documents.filter((d) => ids.has(d.projectId)),
    tasks: [],
    activities: [],
    mailboxes: [],
    inboxItems: [],
    inboxAttachments: [],
    agentRuns: [],
    agentRules: [],
    agentFeedback: [],
  };
}

export function createDemoRepo(today: string = todayIso(), opts: { delayMs?: number } = {}): Repo {
  const db: Dataset = buildDemoDataset(today);
  let user: SessionUser = { name: "Demo", role: "admin" };
  const delay = opts.delayMs ?? DELAY_MS;
  const done = <T,>(v: T) => wait(v, delay);

  const isStaff = () => user.role === "admin" || user.role === "mitarbeiter";
  const requireStaff = () => {
    if (!isStaff()) throw new PermissionError();
  };
  const project = (id: string): Project => {
    const p = db.projects.find((x) => x.id === id);
    if (!p) throw new Error(`Projekt ${id} nicht gefunden`);
    return p;
  };
  const log = (a: Omit<Activity, "id" | "at" | "actor">) => {
    db.activities.unshift({ id: newId("a"), at: now(), actor: user.name, ...a });
  };
  const stepLabel = (key: string) => db.stepDefinitions.find((s) => s.key === key)?.label ?? key;

  return {
    mode: "demo",

    async load(u) {
      user = u;
      return done(structuredClone(visibleFor(db, u)));
    },

    async setStepDate(projectId, stepKey, date) {
      requireStaff();
      if (!db.stepDefinitions.some((s) => s.key === stepKey)) throw new Error(`Unbekannter Schritt ${stepKey}`);
      const p = project(projectId);
      if (date) p.steps[stepKey] = date;
      else delete p.steps[stepKey];
      log({ projectId, kind: "schritt", text: date ? `${stepLabel(stepKey)} erledigt` : `${stepLabel(stepKey)} zurückgesetzt` });
      return done(undefined);
    },

    async createProject(input: NewProject) {
      requireStaff();
      const p: Project = {
        id: newId("p"),
        abmNr: input.abmNr,
        hausbauNr: null,
        kind: input.kind,
        status: "aktiv",
        companyId: input.companyId,
        salespersonId: null,
        bauherrLabel: input.bauherrLabel.trim(),
        location: input.location,
        architectId: input.architectId,
        planerId: null,
        baubetreuung: null,
        intakeMonth: input.intakeMonth,
        notes: null,
        steps: {},
      };
      if (!p.bauherrLabel) throw new Error("Bauherr fehlt");
      db.projects.unshift(p);
      log({ projectId: p.id, kind: "projekt", text: "Projekt angelegt" });
      return done(structuredClone(p));
    },

    async setProjectStatus(projectId, status) {
      requireStaff();
      const p = project(projectId);
      if (p.status === status) return done(undefined);
      p.status = status;
      const text = { aktiv: "Projekt wieder aktiv", abgeschlossen: "Projekt abgeschlossen", storno: "Projekt storniert" }[status];
      log({ projectId, kind: "projekt", text });
      return done(undefined);
    },

    async markInvoiceSent(invoiceId, sentOn) {
      requireStaff();
      const inv = db.invoices.find((i) => i.id === invoiceId);
      if (!inv) throw new Error("Rechnung nicht gefunden");
      if (inv.status === "versendet" || inv.status === "bezahlt") return done(undefined);
      inv.status = "versendet";
      inv.sentOn = sentOn;
      log({ projectId: inv.projectId, kind: "rechnung", text: `Rechnung versendet: ${inv.label}` });
      return done(undefined);
    },

    async uploadDocument({ projectId, folderPath, file }: UploadInput) {
      // Wie RLS: Mitarbeiter überall, Freiberufler nur in zugewiesenen Projekten
      const p = project(projectId);
      if (!isStaff() && p.planerId !== DEMO_FREELANCER_TEAM_ID) throw new PermissionError();
      if (folderPath.includes("{datum}")) throw new Error("Für diesen Ordner fehlt das Datum");
      if (!isAllowedFolder(folderPath, db.folderTemplates)) throw new Error("Ordner gehört nicht zur Vorlage");
      const check = checkFile(file.name, file.size);
      if (!check.ok) throw new Error(check.reason);
      const day = todayIso();
      // Bei Namenskonflikt Zähler anhängen, nie überschreiben
      const base = `${projectId}/${folderPath}/${day}_${file.name}`;
      let storagePath = base;
      for (let n = 2; db.documents.some((d) => d.storagePath === storagePath); n++) {
        storagePath = base.replace(/(\.[^./]+)?$/, (ext) => ` (${n})${ext}`);
      }
      const doc: ProjectDocument = {
        id: newId("d"),
        projectId,
        name: file.name,
        folderPath,
        storagePath,
        mime: file.type || null,
        sizeBytes: file.size,
        source: "upload",
        sourceItemId: null,
        receivedOn: day,
        uploadedBy: user.name,
        createdAt: now(),
      };
      db.documents.push(doc);
      log({ projectId, kind: "datei", text: `${file.name} abgelegt` });
      return done(structuredClone(doc));
    },

    async createTask(input: NewTask) {
      requireStaff();
      // Dedupliziert über sourceKey (in der Datenbank: unique)
      if (input.sourceKey) {
        const existing = db.tasks.find((t) => t.sourceKey === input.sourceKey);
        if (existing) return done(structuredClone(existing));
      }
      const t: Task = {
        id: newId("task"),
        projectId: input.projectId,
        title: input.title.trim(),
        dueOn: input.dueOn,
        assigneeId: input.assigneeId,
        status: "offen",
        source: input.source ?? "manuell",
        sourceKey: input.sourceKey ?? null,
        createdAt: now(),
        doneAt: null,
      };
      if (!t.title) throw new Error("Titel fehlt");
      db.tasks.push(t);
      log({ projectId: t.projectId, kind: "aufgabe", text: `Aufgabe angelegt: ${t.title}` });
      return done(structuredClone(t));
    },

    async updateTask(id, patch: TaskPatch) {
      requireStaff();
      const t = db.tasks.find((x) => x.id === id);
      if (!t) throw new Error("Aufgabe nicht gefunden");
      const wasDone = t.status === "erledigt";
      Object.assign(t, patch);
      if (patch.status === "erledigt" && !wasDone) {
        t.doneAt = now();
        log({ projectId: t.projectId, kind: "aufgabe", text: `Aufgabe erledigt: ${t.title}` });
      }
      if (patch.status === "offen") t.doneAt = null;
      return done(structuredClone(t));
    },

    async setMailboxStatus(id, status: MailboxStatus) {
      requireStaff();
      const m = db.mailboxes.find((x) => x.id === id);
      if (!m) throw new Error("Postfach nicht gefunden");
      m.status = status;
      return done(undefined);
    },

    async saveAgentRule(rule: NewAgentRule) {
      requireStaff();
      if (rule.folderPath && !isAllowedFolder(rule.folderPath, db.folderTemplates)) throw new Error("Ordner gehört nicht zur Vorlage");
      const r = { id: newId("rule"), createdBy: user.name, createdAt: now(), ...rule, match: rule.match.trim().toLowerCase() };
      db.agentRules.push(r);
      return done(structuredClone(r));
    },

    async removeAgentRule(id) {
      requireStaff();
      db.agentRules = db.agentRules.filter((r) => r.id !== id);
      return done(undefined);
    },

    async saveAgentSettings(settings: AgentSettings) {
      requireStaff();
      if (!(settings.suggestThreshold >= 0 && settings.suggestThreshold < settings.autoFileThreshold && settings.autoFileThreshold <= 1)) {
        throw new Error("Schwellen ungültig: 0 ≤ Vorschlag < Auto-Ablage ≤ 100 %");
      }
      db.agentSettings = { ...settings };
      return done(undefined);
    },
  };
}
