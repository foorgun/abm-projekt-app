// Demo-Repo: hält den erfundenen Datenbestand im Speicher (Neuladen setzt zurück).
// Bildet die Zugriffsregeln der Datenbank (RLS, Migration 0001/0002) für die Demo nach,
// damit die Rollen-Umschaltung zeigt, was z. B. ein Freiberufler sieht. Echter Schutz liegt in der Datenbank.

import { classify } from "../agent/classify";
import { buildDemoMailQueue, demoAi, type QueuedMail } from "../agent/demoMailSource";
import type { ClassifyContext } from "../agent/types";
import { DEMO_ME } from "../data/demoAbwesenheit";
import { buildDemoDataset, DEMO_FREELANCER_TEAM_ID } from "../data/demoData";
import { darfEntscheiden, endeVon, pruefeKrank, pruefeUrlaub } from "./abwesenheit/urlaub";
import { werktage } from "./abwesenheit/werktage";
import { filterDocuments, type DocumentFilter, type DocumentRow } from "./documentFilters";
import { cleanMeta } from "./extract/applyDraft";
import { checkContractFile } from "./extract/contractFile";
import { contractFolder } from "./extract/filing";
import { checkFile } from "./files";
import { demoDetails, demoSuche } from "./planungsprotokoll/schornsteinfeger";
import { isAllowedFolder, templateOf } from "./folders";
import { PROTOKOLL_ORDNER, VORLAGEN, VORLAGEN_ORDNER } from "./planungsprotokoll/vorlagen";
import { cleanPrefix } from "./abmNr";
import { planProjectUpdate } from "./projectEdit";
import { cleanMasterName, followupForMissingInfo, followupKey, infoStateOfNew, validateNewProject } from "./projectForm";
import { todayIso } from "./format";
import {
  PermissionError,
  type AgentRunSummary,
  type ContractFiling,
  type DraftInput,
  type MailboxInput,
  type ProjectPatch,
  type ProtokollAblage,
  type NewAgentRule,
  type NewProject,
  type NewTask,
  type Repo,
  type ReviewResolution,
  type TaskPatch,
  type UploadInput,
} from "./repo";
import type { SessionUser } from "./session";
import { CLASSIC_PARTY_ROLES } from "./types";
import type { Activity, AgentSettings, BueroDaten, Dataset, InboxAttachment, InboxStatus, Mailbox, MailboxStatus, Abwesenheit, KalenderEintrag, Planungsprotokoll, Project, ProjectDocument, ProjectDraftRecord, Task } from "./types";

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

/** Verlaufseinträge, die Freiberufler nie sehen (wie Rechnungen und Aufgaben selbst). */
const FREELANCER_HIDDEN_ACTIVITIES: Activity["kind"][] = ["rechnung", "aufgabe"];

/** Was eine Rolle sehen darf (entspricht den RLS-Policies). */
export function visibleFor(db: Dataset, user: SessionUser): Dataset {
  if (user.role === "admin") return { ...db, meId: DEMO_ME.admin };
  if (user.role === "mitarbeiter") {
    // wie RLS: nur die eigenen Abwesenheiten, der eigene Anspruch, im Team nur man selbst
    const me = DEMO_ME.mitarbeiter;
    return { ...db, meId: me, mitarbeiter: db.mitarbeiter.filter((m) => m.id === me), abwesenheiten: db.abwesenheiten.filter((a) => a.userId === me), urlaubsAnspruch: db.urlaubsAnspruch.filter((a) => a.userId === me) };
  }
  const projects = db.projects.filter((p) => p.planerId === DEMO_FREELANCER_TEAM_ID);
  const ids = new Set(projects.map((p) => p.id));
  return {
    ...db,
    companies: [],
    salespeople: [],
    projects,
    invoices: [],
    bauherren: [],
    // wie RLS (0013): nur die Rollen aus Liste.docx; Kellerbauer, Ämter, Sachbearbeiter usw. nicht
    parties: db.parties.filter((x) => ids.has(x.projectId) && CLASSIC_PARTY_ROLES.includes(x.role)),
    documents: db.documents.filter((d) => ids.has(d.projectId)),
    tasks: [],
    // wie RLS (0016): Verlauf der zugewiesenen Projekte, ohne Einträge zu Rechnungen und Aufgaben
    activities: db.activities.filter((a) => a.projectId !== null && ids.has(a.projectId) && FREELANCER_HIDDEN_ACTIVITIES.every((k) => k !== a.kind)),
    mailboxes: [],
    inboxItems: [],
    inboxAttachments: [],
    agentRuns: [],
    agentRules: [],
    agentFeedback: [],
    projectDrafts: [],
    meId: null,
    mitarbeiter: [],
    abwesenheiten: [],
    urlaubsAnspruch: [],
    buero: null,
    planungsprotokolle: [],
  };
}

export function createDemoRepo(today: string = todayIso(), opts: { delayMs?: number } = {}): Repo {
  let db: Dataset = buildDemoDataset(today);
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
  /** Wer "ich" ist (Demo: je Rolle eine erfundene Person). Freiberufler haben keinen Zugang zu Urlaub und Krankheit. */
  const requireMe = (): string => {
    const me = DEMO_ME[user.role];
    if (!me) throw new PermissionError();
    return me;
  };
  const absence = (id: string): Abwesenheit => {
    const row = db.abwesenheiten.find((a) => a.id === id);
    // wie RLS: fremde Zeilen gibt es für Mitarbeiter nicht
    if (!row || (user.role !== "admin" && row.userId !== DEMO_ME[user.role])) throw new Error("Eintrag nicht gefunden");
    return row;
  };
  /** Dateien offener Entwürfe (im Demo-Modus nur im Speicher des Browsers) */
  const draftBlobs = new Map<string, Blob>();
  /** Erzeugte Planungsprotokolle (PDF) je Fassung: nur in dieser Sitzung, wie alles im Demo-Modus */
  const protokollBlobs = new Map<string, Blob>();

  /** Legt eine Kopie ab (Metadaten). Bei Namenskonflikt Zähler anhängen, nie überschreiben. */
  function storeDocument(input: {
    projectId: string;
    folderPath: string;
    file: { name: string; size: number; type: string };
    source: ProjectDocument["source"];
    sourceItemId: string | null;
    receivedOn: string;
    docType?: ProjectDocument["docType"];
    meta?: ProjectDocument["meta"];
  }): ProjectDocument {
    if (input.folderPath.includes("{datum}")) throw new Error("Für diesen Ordner fehlt das Datum");
    if (!isAllowedFolder(input.folderPath, db.folderTemplates)) throw new Error("Ordner gehört nicht zur Vorlage");
    const check = checkFile(input.file.name, input.file.size);
    if (!check.ok) throw new Error(check.reason);
    const base = `${input.projectId}/${input.folderPath}/${input.receivedOn}_${input.file.name}`;
    let storagePath = base;
    for (let n = 2; db.documents.some((d) => d.storagePath === storagePath); n++) {
      storagePath = base.replace(/(\.[^./]+)?$/, (ext) => ` (${n})${ext}`);
    }
    const doc: ProjectDocument = {
      id: newId("d"),
      projectId: input.projectId,
      name: input.file.name,
      folderPath: input.folderPath,
      storagePath,
      mime: input.file.type || null,
      sizeBytes: input.file.size,
      source: input.source,
      sourceItemId: input.sourceItemId,
      receivedOn: input.receivedOn,
      uploadedBy: input.source === "upload" ? user.name : null,
      createdAt: now(),
      docType: input.docType ?? null,
      meta: input.meta ? cleanMeta(input.meta) : {},
    };
    db.documents.push(doc);
    return doc;
  }

  // Simulierte Postfächer: Warteschlange erfundener Mails, je "Jetzt prüfen" eine Lieferung
  let mailQueue: QueuedMail[] | null = null;
  let batch = 0;
  const delivered = new Set<string>();

  function agentContext(): ClassifyContext {
    return {
      projects: db.projects,
      companies: db.companies,
      salespeople: db.salespeople,
      bauherren: db.bauherren,
      parties: db.parties,
      folderTemplates: db.folderTemplates,
      rules: db.agentRules,
      settings: db.agentSettings,
      knownMessageIds: new Set(db.inboxItems.map((i) => i.messageId)),
    };
  }

  function itemStatus(itemId: string): InboxStatus {
    const atts = db.inboxAttachments.filter((a) => a.itemId === itemId);
    if (atts.some((a) => a.status === "pruefen")) return "pruefen";
    if (atts.some((a) => a.status === "fehler")) return "fehler";
    if (atts.some((a) => a.status === "abgelegt")) return "abgelegt";
    return "ignoriert";
  }

  function attachment(id: string): InboxAttachment {
    const a = db.inboxAttachments.find((x) => x.id === id);
    if (!a) throw new Error("Anhang nicht gefunden");
    return a;
  }

  /**
   * Aufgabe "Fehlende Angaben nachfragen" abgleichen (wie sync_followup_task in Migration 0008): eine je Projekt.
   * Fehlt nichts mehr, wird die offene Aufgabe erledigt; sonst umbenannt oder, wenn es noch keine gab, angelegt.
   * Eine erledigte Aufgabe bleibt erledigt.
   */
  function syncFollowup(projectId: string, followup: { title: string; dueOn: string } | null) {
    const key = followupKey(projectId);
    const existing = db.tasks.find((t) => t.sourceKey === key);
    if (!followup) {
      if (existing?.status === "offen") Object.assign(existing, { status: "erledigt", doneAt: now() });
      return;
    }
    if (existing) {
      if (existing.status === "offen") existing.title = followup.title;
      return;
    }
    // "manuell", nicht "warnung": sonst würde der Abgleich mit den Warnungen die Aufgabe sofort schließen
    db.tasks.push({ id: newId("task"), projectId, title: followup.title, dueOn: followup.dueOn, assigneeId: project(projectId).architectId, status: "offen", source: "manuell", sourceKey: key, createdAt: now(), doneAt: null });
  }

  return {
    mode: "demo",

    async resetDemo() {
      db = buildDemoDataset(today);
      mailQueue = null;
      batch = 0;
      delivered.clear();
      draftBlobs.clear();
      protokollBlobs.clear();
      return done(undefined);
    },

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
      // Dieselben Regeln wie im Formular (in der Datenbank zusätzlich per Constraint)
      const errors = validateNewProject(input, db.projects);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      const p: Project = {
        id: newId("p"),
        abmNr: input.kind === "bauvoranfrage" ? "Bauvoranfrage" : input.abmNr?.trim() || null,
        hausbauNr: input.hausbauNr?.trim() || null,
        kind: input.kind,
        status: "aktiv",
        companyId: input.companyId,
        salespersonId: input.salespersonId,
        bauherrLabel: input.bauherrLabel.trim(),
        location: input.location?.trim() || null,
        architectId: input.architectId,
        planerId: input.planerId,
        baubetreuung: null,
        intakeMonth: input.intakeMonth,
        notes: null,
        flurstueck: input.flurstueck?.trim() || null,
        gemarkung: input.gemarkung?.trim() || null,
        flur: input.flur?.trim() || null,
        steps: {},
      };
      db.projects.unshift(p);
      const vermesser = input.vermesser?.trim();
      if (vermesser) db.parties.push({ projectId: p.id, role: "vermesser", name: vermesser, contact: null });
      const b = input.bauherr;
      const val = (v: string | null | undefined) => v?.trim() || null;
      const extra = b ? ([b.street, b.postalCode, b.city, b.mobile, b.siteStreet, b.sitePostalCode, b.siteCity, b.siteDistrict, b.siteState] as (string | null | undefined)[]) : [];
      if (b && (val(b.phone) || val(b.email) || val(b.address) || val(b.buildingAddress) || val(b.name) || val(b.name2) || val(b.phone2) || val(b.email2) || extra.some(val))) {
        db.bauherren.push({
          projectId: p.id,
          name: val(b.name) ?? p.bauherrLabel,
          address: val(b.address),
          phone: val(b.phone),
          email: val(b.email),
          buildingAddress: val(b.buildingAddress),
          name2: val(b.name2),
          phone2: val(b.phone2),
          email2: val(b.email2),
          street: val(b.street),
          postalCode: val(b.postalCode),
          city: val(b.city),
          mobile: val(b.mobile),
          siteStreet: val(b.siteStreet),
          sitePostalCode: val(b.sitePostalCode),
          siteCity: val(b.siteCity),
          siteDistrict: val(b.siteDistrict),
          siteState: val(b.siteState),
        });
      }
      log({ projectId: p.id, kind: "projekt", text: "Projekt angelegt" });
      if (input.createFolders) log({ projectId: p.id, kind: "projekt", text: `Projektordner aus der Vorlage angelegt (${db.folderTemplates.length} Ordner)` });
      // Fehlende Angaben: eine Aufgabe zum Nachfragen (ohne eigenen Protokolleintrag)
      syncFollowup(p.id, followupForMissingInfo(infoStateOfNew(input), todayIso()));
      return done(structuredClone(p));
    },

    async updateProject(projectId, patch: ProjectPatch) {
      requireStaff();
      const p = project(projectId);
      const plan = planProjectUpdate(db, projectId, patch, todayIso());
      const first = Object.values(plan.errors)[0];
      if (first) throw new Error(first);
      Object.assign(p, plan.project);
      if (plan.bauherr) {
        const row = { projectId, ...plan.bauherr, name: plan.bauherr.name ?? p.bauherrLabel };
        const cur = db.bauherren.find((b) => b.projectId === projectId);
        if (cur) Object.assign(cur, row);
        else db.bauherren.push(row);
      }
      for (const [role, value] of Object.entries(plan.parties) as [keyof typeof plan.parties, (typeof plan.parties)[keyof typeof plan.parties]][]) {
        db.parties = db.parties.filter((x) => !(x.projectId === projectId && x.role === role));
        if (value) db.parties.push({ projectId, role, ...value });
      }
      if (plan.activity) log({ projectId, kind: "projekt", text: plan.activity });
      syncFollowup(projectId, plan.followup);
      return done(undefined);
    },

    async createCompany(name, numberPrefix = null) {
      requireStaff();
      // Nummernkreis nur durch Admins (wie die Zeilenregel companies_prefix_insert_admin)
      if (numberPrefix && user.role !== "admin") throw new PermissionError();
      const c = cleanMasterName(name, db.companies.map((x) => x.name));
      if (!c.ok) throw new Error(c.reason);
      const p = cleanPrefix(numberPrefix ?? "", null, db.companies);
      if (!p.ok) throw new Error(p.reason);
      const row = { id: newId("c"), name: c.name, numberPrefix: p.prefix };
      db.companies.push(row);
      return done(structuredClone(row));
    },

    async setCompanyPrefix(companyId, numberPrefix) {
      if (user.role !== "admin") throw new PermissionError();
      const row = db.companies.find((x) => x.id === companyId);
      if (!row) throw new Error("Hausbaufirma nicht gefunden");
      const p = cleanPrefix(numberPrefix ?? "", companyId, db.companies);
      if (!p.ok) throw new Error(p.reason);
      row.numberPrefix = p.prefix;
      return done(undefined);
    },

    async createSalesperson(companyId, name) {
      requireStaff();
      if (!db.companies.some((x) => x.id === companyId)) throw new Error("Hausbaufirma nicht gefunden");
      const c = cleanMasterName(name, db.salespeople.filter((s) => s.companyId === companyId).map((x) => x.name));
      if (!c.ok) throw new Error(c.reason);
      const row = { id: newId("s"), companyId, name: c.name, email: null };
      db.salespeople.push(row);
      return done(structuredClone(row));
    },

    async createTeamMember(name, role) {
      requireStaff();
      const c = cleanMasterName(name, db.team.filter((t) => t.role === role).map((x) => x.name));
      if (!c.ok) throw new Error(c.reason);
      const row = { id: newId("t"), code: null, name: c.name, role };
      db.team.push(row);
      return done(structuredClone(row));
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

    async deleteProject(projectId) {
      // wie die Funktion in der Datenbank: nur Admin, Berechtigung vor allem anderen
      if (user.role !== "admin") throw new PermissionError();
      const p = project(projectId);
      const keep = <T extends { projectId: string | null }>(rows: T[]) => rows.filter((r) => r.projectId !== p.id);
      db.projects = db.projects.filter((x) => x.id !== p.id);
      db.invoices = keep(db.invoices);
      db.documents = keep(db.documents);
      db.tasks = keep(db.tasks);
      db.activities = keep(db.activities);
      db.parties = keep(db.parties);
      db.agentRules = keep(db.agentRules);
      for (const x of db.planungsprotokolle.filter((x) => x.projectId === p.id)) protokollBlobs.delete(x.id);
      db.planungsprotokolle = keep(db.planungsprotokolle);
      // im Demo-Modus hängt der Kontakt am Projekt: er geht mit
      db.bauherren = keep(db.bauherren);
      for (const d of db.projectDrafts.filter((x) => x.projectId === p.id)) draftBlobs.delete(d.id);
      db.projectDrafts = keep(db.projectDrafts);
      // Posteingang und Lernbeispiele bleiben, nur der Verweis auf das Projekt entfällt
      for (const row of [...db.inboxItems, ...db.inboxAttachments, ...db.agentFeedback]) if (row.projectId === p.id) row.projectId = null;
      for (const a of db.inboxAttachments) if (a.documentId && !db.documents.some((d) => d.id === a.documentId)) a.documentId = null;
      return done({ filesLeft: 0 });
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

    async uploadDocument({ projectId, folderPath, file, docType, meta }: UploadInput) {
      // Wie RLS: Mitarbeiter überall, Freiberufler nur in zugewiesenen Projekten
      const p = project(projectId);
      if (!isStaff() && p.planerId !== DEMO_FREELANCER_TEAM_ID) throw new PermissionError();
      const doc = storeDocument({ projectId, folderPath, file, source: "upload", sourceItemId: null, receivedOn: todayIso(), docType, meta });
      log({ projectId, kind: "datei", text: `${file.name} abgelegt` });
      return done(structuredClone(doc));
    },

    // ------------------------------------------------------------- Urlaub und Krankheit (Regeln wie Migration 0012)

    async requestUrlaub({ von, bis, notiz }) {
      const me = requireMe();
      const check = pruefeUrlaub({ userId: me, von, bis }, db.abwesenheiten, db.urlaubsAnspruch, today);
      if (check.fehler.length) throw new Error(check.fehler[0]);
      const row: Abwesenheit = { id: newId("abw"), userId: me, art: "urlaub", von, bis, werktage: werktage(von, bis), status: "offen", notiz: notiz?.trim() || null, entscheidungVon: null, entscheidungAm: null, ablehnGrund: null, createdAt: now() };
      db.abwesenheiten.push(row);
      return done(structuredClone(row));
    },

    async withdrawUrlaub(id) {
      const me = requireMe();
      const row = absence(id);
      if (row.userId !== me) throw new Error("Nur die Person selbst kann ihren Antrag zurückziehen.");
      if (row.art !== "urlaub" || row.status !== "offen") throw new Error("Der Antrag ist nicht mehr offen.");
      row.status = "zurueckgezogen";
      return done(undefined);
    },

    async reportKrank({ von, bis }) {
      const me = requireMe();
      const fehler = pruefeKrank({ userId: me, von, bis }, db.abwesenheiten, today);
      if (fehler.length) throw new Error(fehler[0]);
      // sofort wirksam, nie mit Notiz
      const row: Abwesenheit = { id: newId("abw"), userId: me, art: "krank", von, bis, werktage: null, status: "genehmigt", notiz: null, entscheidungVon: null, entscheidungAm: null, ablehnGrund: null, createdAt: now() };
      db.abwesenheiten.push(row);
      return done(structuredClone(row));
    },

    async setKrankBis(id, bis) {
      const me = requireMe();
      const row = absence(id);
      if (row.art !== "krank") throw new Error("Das ist keine Krankmeldung.");
      if (row.userId !== me && user.role !== "admin") throw new PermissionError();
      const fehler = pruefeKrank({ userId: row.userId, von: row.von, bis }, db.abwesenheiten, today, row.id);
      if (fehler.length) throw new Error(fehler[0]);
      row.bis = bis;
      return done(undefined);
    },

    async decideUrlaub(id, status, grund) {
      const me = requireMe();
      const row = absence(id);
      if (user.role !== "admin") throw new PermissionError();
      if (row.art !== "urlaub" || row.status !== "offen") throw new Error("Der Antrag ist nicht mehr offen.");
      // Vier-Augen-Prinzip: nie der eigene Antrag
      if (!darfEntscheiden({ id: me, role: user.role }, row)) throw new Error("Den eigenen Antrag kann nur ein anderer Admin entscheiden.");
      Object.assign(row, { status, entscheidungVon: db.mitarbeiter.find((m) => m.id === me)?.name ?? user.name, entscheidungAm: now(), ablehnGrund: status === "abgelehnt" ? grund?.trim() || null : null });
      return done(undefined);
    },

    async setUrlaubsAnspruch(userId, jahr, { tage, uebertrag }) {
      requireMe();
      if (user.role !== "admin") throw new PermissionError();
      if (!(tage >= 0 && tage <= 366) || !(uebertrag >= 0 && uebertrag <= 366)) throw new Error("Bitte Tage zwischen 0 und 366 eintragen.");
      const cur = db.urlaubsAnspruch.find((a) => a.userId === userId && a.jahr === jahr);
      if (cur) Object.assign(cur, { tage, uebertrag });
      else db.urlaubsAnspruch.push({ userId, jahr, tage, uebertrag });
      return done(undefined);
    },

    async kalenderAbwesenheiten(von, bis) {
      requireMe();
      const admin = user.role === "admin";
      const rows: KalenderEintrag[] = db.abwesenheiten
        .filter((a) => a.status === "genehmigt" && a.von <= bis && endeVon(a, today) >= von)
        // andere sehen nur "abwesend": kein Grund, und eine offene Krankmeldung endet in der Anzeige heute
        .map((a) => ({ userId: a.userId, name: db.mitarbeiter.find((m) => m.id === a.userId)?.name ?? "Unbekannt", von: a.von, bis: endeVon(a, today), art: admin ? a.art : null }))
        .sort((x, y) => x.von.localeCompare(y.von) || x.name.localeCompare(y.name, "de"));
      return done(rows);
    },

    // ------------------------------------------------------------- Neues Projekt aus einem Vertrag

    async saveProjectDraft(input: DraftInput) {
      requireStaff();
      if (input.id) {
        const cur = db.projectDrafts.find((d) => d.id === input.id && d.status === "offen");
        if (!cur) throw new Error("Der Entwurf ist nicht mehr offen.");
        Object.assign(cur, { draft: structuredClone(input.draft), form: structuredClone(input.form), docType: input.docType, updatedAt: now() });
        return done(structuredClone(cur));
      }
      const check = checkContractFile(input.file);
      if (!check.ok) throw new Error(check.reason);
      const id = newId("e");
      const rec: ProjectDraftRecord = {
        id,
        status: "offen",
        draft: structuredClone(input.draft),
        form: structuredClone(input.form),
        docType: input.docType,
        file: { ...input.file },
        storagePath: `drafts/${id}/${input.file.name}`,
        projectId: null,
        createdBy: user.name,
        createdAt: now(),
        updatedAt: now(),
      };
      db.projectDrafts.unshift(rec);
      if (input.blob) draftBlobs.set(id, input.blob);
      return done(structuredClone(rec));
    },

    async discardProjectDraft(id) {
      requireStaff();
      const cur = db.projectDrafts.find((d) => d.id === id);
      if (!cur) throw new Error("Entwurf nicht gefunden");
      Object.assign(cur, { status: "verworfen", storagePath: null, updatedAt: now() });
      draftBlobs.delete(id);
      return done(undefined);
    },

    async draftFile(id) {
      requireStaff();
      return done(draftBlobs.get(id) ?? null);
    },

    async fileContract({ projectId, docType, meta, file, draftId }: ContractFiling) {
      requireStaff();
      project(projectId);
      const check = checkContractFile(file);
      if (!check.ok) throw new Error(check.reason);
      const doc = storeDocument({ projectId, folderPath: contractFolder(docType, db.folderTemplates), file, source: "upload", sourceItemId: null, receivedOn: todayIso(), docType, meta });
      log({ projectId, kind: "datei", text: `${file.name} abgelegt` });
      const draft = draftId ? db.projectDrafts.find((d) => d.id === draftId) : null;
      if (draft) {
        Object.assign(draft, { status: "uebernommen", projectId, storagePath: null, updatedAt: now() });
        draftBlobs.delete(draft.id);
      }
      return done(structuredClone(doc));
    },

    async listDocuments(filter: DocumentFilter) {
      // Sichtbarkeit wie RLS: Freiberufler nur Dokumente zugewiesener Projekte, ohne Maildaten (Posteingang ist Mitarbeitern vorbehalten)
      const visible = visibleFor(db, user);
      const projects = new Map(visible.projects.map((p) => [p.id, p]));
      const atts = new Map(visible.inboxAttachments.map((a) => [a.id, a]));
      const items = new Map(visible.inboxItems.map((i) => [i.id, i]));
      const rows: DocumentRow[] = visible.documents.map((doc) => {
        const p = projects.get(doc.projectId);
        const item = doc.sourceItemId ? items.get(atts.get(doc.sourceItemId)?.itemId ?? "") : undefined;
        const att = doc.sourceItemId ? atts.get(doc.sourceItemId) : undefined;
        return {
          doc,
          project: p ? { id: p.id, abmNr: p.abmNr, bauherrLabel: p.bauherrLabel, location: p.location } : null,
          mail: item ? { subject: item.subject, fromName: item.fromName, fromEmail: item.fromEmail, receivedAt: item.receivedAt, reason: item.reason, confidence: att?.confidence ?? null } : null,
        };
      });
      return done(structuredClone(filterDocuments(rows, filter, todayIso())));
    },

    async projectHistory(projectId, limit) {
      const rows = visibleFor(db, user).activities.filter((a) => a.projectId === projectId);
      return done(structuredClone([...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)));
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
      // Automatisch aus Warnungen erzeugte Aufgaben nicht als Aktivität protokollieren (sonst verdrängen sie echte Ereignisse)
      if (t.source !== "warnung") log({ projectId: t.projectId, kind: "aufgabe", text: `Aufgabe angelegt: ${t.title}` });
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

    async saveMailbox(input: MailboxInput) {
      requireStaff();
      const address = input.address.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error("Bitte eine gültige Mailadresse eintragen");
      if (!input.label.trim()) throw new Error("Bitte einen Namen eintragen");
      if (db.mailboxes.some((m) => m.address === address && m.id !== input.id)) throw new Error("Dieses Postfach gibt es schon");
      let m: Mailbox | undefined = input.id ? db.mailboxes.find((x) => x.id === input.id) : undefined;
      if (m) Object.assign(m, { label: input.label.trim(), address, provider: input.provider, watchFolder: input.watchFolder.trim() || "Posteingang" });
      else {
        // Neues Postfach startet pausiert: Zugangsdaten werden im Echtbetrieb in Supabase Vault hinterlegt
        m = { id: newId("mb"), label: input.label.trim(), address, provider: input.provider, status: "pausiert", lastCheckedAt: null, watchFolder: input.watchFolder.trim() || "Posteingang" };
        db.mailboxes.push(m);
      }
      return done(structuredClone(m));
    },

    async runAgent() {
      requireStaff();
      mailQueue ??= buildDemoMailQueue(db);
      batch += 1;
      const summary: AgentRunSummary = { fetched: 0, filed: 0, toReview: 0, ignored: 0, errors: 0, duplicates: 0, waitingPaused: 0 };
      const started = now();
      const perMailbox = new Map<string, AgentRunSummary>();
      for (const q of mailQueue) {
        if (q.batch > batch || delivered.has(q.mail.messageId + q.batch)) continue;
        const box = db.mailboxes.find((b) => b.id === q.mail.mailboxId);
        if (!box || box.status !== "verbunden") {
          summary.waitingPaused++;
          continue;
        }
        delivered.add(q.mail.messageId + q.batch);
        const mb = perMailbox.get(box.id) ?? { fetched: 0, filed: 0, toReview: 0, ignored: 0, errors: 0, duplicates: 0, waitingPaused: 0 };
        perMailbox.set(box.id, mb);
        summary.fetched++;
        mb.fetched++;

        const decision = classify(q.mail, agentContext(), demoAi);
        if (decision.skipped) {
          summary.duplicates++;
          mb.duplicates++;
          continue;
        }
        const itemId = newId("in");
        db.inboxItems.push({
          id: itemId,
          mailboxId: box.id,
          messageId: q.mail.messageId,
          receivedAt: q.mail.receivedAt,
          fromName: q.mail.fromName,
          fromEmail: q.mail.fromEmail,
          subject: q.mail.subject,
          bodyExcerpt: q.mail.body.slice(0, 2000),
          status: decision.status,
          projectId: decision.projectId,
          confidence: decision.confidence,
          reason: decision.reason,
          createdAt: now(),
        });
        for (const a of decision.attachments) {
          const att: InboxAttachment = {
            id: newId("att"),
            itemId,
            fileName: a.fileName,
            mime: a.mime,
            sizeBytes: a.sizeBytes,
            storagePath: null,
            projectId: a.projectId,
            folderPath: a.folderPath,
            confidence: a.confidence,
            status: a.status,
            documentId: null,
            corrected: false,
          };
          db.inboxAttachments.push(att);
          if (a.status === "abgelegt" && a.projectId && a.folderPath) {
            const doc = storeDocument({
              projectId: a.projectId,
              folderPath: a.folderPath,
              file: { name: a.fileName, size: a.sizeBytes, type: a.mime },
              source: "agent",
              sourceItemId: att.id,
              receivedOn: q.mail.receivedAt.slice(0, 10),
            });
            att.documentId = doc.id;
            att.storagePath = doc.storagePath;
            db.activities.unshift({ id: newId("a"), projectId: a.projectId, kind: "agent", text: `${a.fileName} abgelegt`, actor: "Agent", at: now() });
          }
        }
        const key = { abgelegt: "filed", pruefen: "toReview", ignoriert: "ignored", fehler: "errors" } as const;
        summary[key[decision.status]]++;
        mb[key[decision.status]]++;
      }
      for (const box of db.mailboxes) {
        if (box.status !== "verbunden") continue;
        box.lastCheckedAt = now();
        const mb = perMailbox.get(box.id);
        db.agentRuns.push({
          id: newId("run"),
          mailboxId: box.id,
          startedAt: started,
          finishedAt: now(),
          fetched: mb?.fetched ?? 0,
          filed: mb?.filed ?? 0,
          toReview: mb?.toReview ?? 0,
          ignored: mb?.ignored ?? 0,
          errors: mb?.errors ?? 0,
          note: mb?.duplicates ? `${mb.duplicates} Dublette(n) übersprungen` : null,
        });
      }
      return wait(summary, delay * 4); // ein Lauf dauert sichtbar etwas länger
    },

    async resolveReview(attachmentId, r: ReviewResolution) {
      requireStaff();
      const att = attachment(attachmentId);
      const item = db.inboxItems.find((i) => i.id === att.itemId)!;
      if (r.action === "ignorieren") {
        att.status = "ignoriert";
        db.agentFeedback.push({ id: newId("fb"), attachmentId, action: "ignoriert", projectId: null, folderPath: null, createdBy: user.name, createdAt: now() });
        if (r.rememberRule === "ignorieren") db.agentRules.push({ id: newId("rule"), kind: "ignorieren", match: item.fromEmail.toLowerCase(), projectId: null, folderPath: null, createdBy: user.name, createdAt: now() });
      } else {
        const projectId = r.action === "aendern" ? r.projectId : att.projectId;
        const folderPath = r.action === "aendern" ? r.folderPath : att.folderPath;
        if (!projectId || !folderPath) throw new Error("Projekt und Ordner wählen");
        if (!db.projects.some((p) => p.id === projectId)) throw new Error("Projekt nicht gefunden");
        if (att.documentId) {
          // Korrektur einer automatischen Ablage: die Kopie wandert in den richtigen Ordner (keine zweite Kopie)
          const doc = db.documents.find((d) => d.id === att.documentId)!;
          if (!isAllowedFolder(folderPath, db.folderTemplates) || folderPath.includes("{datum}")) throw new Error("Ordner gehört nicht zur Vorlage");
          Object.assign(doc, { projectId, folderPath, storagePath: `${projectId}/${folderPath}/${doc.receivedOn}_${doc.name}` });
        } else {
          const doc = storeDocument({ projectId, folderPath, file: { name: att.fileName, size: att.sizeBytes, type: att.mime }, source: "agent", sourceItemId: att.id, receivedOn: item.receivedAt.slice(0, 10) });
          att.documentId = doc.id;
          att.storagePath = doc.storagePath;
        }
        att.status = "abgelegt";
        att.projectId = projectId;
        att.folderPath = folderPath;
        item.projectId = projectId;
        db.agentFeedback.push({ id: newId("fb"), attachmentId, action: r.action === "aendern" ? "geaendert" : "bestaetigt", projectId, folderPath, createdBy: user.name, createdAt: now() });
        db.activities.unshift({ id: newId("a"), projectId, kind: "agent", text: `${att.fileName} nach Prüfung abgelegt`, actor: user.name, at: now() });
        if (r.rememberRule === "absender_projekt") {
          db.agentRules.push({ id: newId("rule"), kind: "absender_projekt", match: item.fromEmail.toLowerCase(), projectId, folderPath: null, createdBy: user.name, createdAt: now() });
        }
        if (r.rememberRule === "absender_ordner") {
          const tpl = templateOf(folderPath, db.folderTemplates)?.path ?? null;
          if (tpl) db.agentRules.push({ id: newId("rule"), kind: "absender_ordner", match: item.fromEmail.toLowerCase(), projectId: null, folderPath: tpl, createdBy: user.name, createdAt: now() });
        }
      }
      item.status = itemStatus(item.id);
      return done(undefined);
    },

    async reportWrongFiling(attachmentId) {
      requireStaff();
      const att = attachment(attachmentId);
      if (att.status !== "abgelegt") throw new Error("Nur abgelegte Anhänge lassen sich als falsch melden");
      att.corrected = true;
      att.status = "pruefen";
      const item = db.inboxItems.find((i) => i.id === att.itemId)!;
      item.status = itemStatus(item.id);
      return done(undefined);
    },

    // ------------------------------------------------------------- Planungsprotokoll (Regeln wie Migration 0013/0014)

    async saveBueroDaten(daten: BueroDaten) {
      if (user.role !== "admin") throw new PermissionError();
      const c = (v: string | null | undefined) => v?.replace(/\s+/g, " ").trim() || null;
      const next: BueroDaten = { name: c(daten.name), anschrift: c(daten.anschrift), tel: c(daten.tel), mobil: c(daten.mobil), email: c(daten.email) };
      if (next.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.email)) throw new Error("Bitte eine gültige E-Mail-Adresse eintragen.");
      db.buero = next;
      return done(undefined);
    },

    async vorlageLaden(vorlage) {
      requireStaff();
      // Im Demo-Modus aus dem lokalen Ordner (Firmendokumente, nicht im Repo und nicht im Build)
      const url = `${VORLAGEN_ORDNER}/${encodeURIComponent(VORLAGEN[vorlage].datei)}`;
      const fehlt = new Error(`Vorlage „${VORLAGEN[vorlage].firma}“ nicht gefunden. Im Demo-Modus muss die Datei „${VORLAGEN[vorlage].datei}“ im Ordner ${VORLAGEN_ORDNER}/ liegen.`);
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) throw fehlt;
      const bytes = await res.arrayBuffer();
      // Der Entwicklungsserver liefert für fehlende Dateien die Startseite aus: nur echte PDFs annehmen
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw fehlt;
      return bytes;
    },

    async savePlanungsprotokoll({ projectId, vorlage, variante, fileName, blob }: ProtokollAblage) {
      requireStaff();
      project(projectId);
      const doc = storeDocument({ projectId, folderPath: PROTOKOLL_ORDNER, file: { name: fileName, size: blob.size, type: "application/pdf" }, source: "upload", sourceItemId: null, receivedOn: todayIso() });
      const row: Planungsprotokoll = { id: newId("pp"), projectId, vorlage, variante, erstelltVon: user.name, erstelltAm: now(), dokumentId: doc.id };
      db.planungsprotokolle.unshift(row);
      protokollBlobs.set(row.id, blob);
      log({ projectId, kind: "datei", text: `${fileName} abgelegt` });
      return done(structuredClone(row));
    },

    async planungsprotokollDatei(protokoll) {
      requireStaff();
      const blob = protokollBlobs.get(protokoll.id);
      if (!blob) throw new Error("Im Demo-Modus gibt es die Datei nur in der Sitzung, in der sie erzeugt wurde.");
      return blob;
    },

    async schornsteinfegerSuchen(anfrage) {
      requireStaff();
      return done(demoSuche(anfrage));
    },

    async schornsteinfegerDetails(bsmId) {
      requireStaff();
      return done(demoDetails(bsmId));
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
