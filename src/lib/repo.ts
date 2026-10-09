// Repo-Interface: einziger Weg der Oberfläche zu den Daten.
// demoRepo (erfundene Daten im Speicher) und supabaseRepo (ab Schritt 8) implementieren es gleich.
// Die UI spricht nie direkt mit Supabase.

import type { SessionUser } from "./session";
import type { AgentRule, AgentSettings, Dataset, Mailbox, MailboxStatus, Project, ProjectDocument, Task } from "./types";

export interface NewProject {
  bauherrLabel: string;
  abmNr: string | null;
  kind: Project["kind"];
  companyId: string | null;
  location: string | null;
  architectId: string | null;
  intakeMonth: string | null;
}

export interface NewTask {
  title: string;
  projectId: string | null;
  dueOn: string | null;
  assigneeId: string | null;
  source?: Task["source"];
  sourceKey?: string | null;
}

export type TaskPatch = Partial<Pick<Task, "title" | "dueOn" | "assigneeId" | "status">>;

export interface UploadInput {
  projectId: string;
  /** Konkreter Ordnerpfad (Vorlagenpfad oder mit eingesetztem Datum). */
  folderPath: string;
  file: { name: string; size: number; type: string };
}

export type NewAgentRule = Pick<AgentRule, "kind" | "match" | "projectId" | "folderPath">;

/** Ergebnis eines Agentenlaufs ("Jetzt prüfen") */
export interface AgentRunSummary {
  fetched: number;
  filed: number;
  toReview: number;
  ignored: number;
  errors: number;
  duplicates: number;
  /** Mails in pausierten Postfächern, die liegen bleiben */
  waitingPaused: number;
}

/** Entscheidung eines Menschen in der Prüfliste */
export interface ReviewResolution {
  action: "bestaetigen" | "aendern" | "ignorieren";
  /** bei "aendern": Zielprojekt */
  projectId?: string;
  /** bei "aendern": konkreter Ordnerpfad (Datum eingesetzt) */
  folderPath?: string;
  /** Regel merken: Absender → Projekt / Absender → Ordner / Absender ignorieren */
  rememberRule?: "absender_projekt" | "absender_ordner" | "ignorieren" | null;
}

export type MailboxInput = Pick<Mailbox, "label" | "address" | "provider" | "watchFolder"> & { id?: string };

/** Fehler, den die Datenbank (RLS) bzw. das Demo-Repo bei fehlender Berechtigung meldet. */
export class PermissionError extends Error {
  constructor(message = "Keine Berechtigung für diese Aktion") {
    super(message);
    this.name = "PermissionError";
  }
}

export interface Repo {
  readonly mode: "demo" | "supabase";
  /** Lädt alles, was der Benutzer sehen darf (Filter wie RLS). Merkt sich den Benutzer für Änderungen. */
  load(user: SessionUser): Promise<Dataset>;

  setStepDate(projectId: string, stepKey: string, date: string | null): Promise<void>;
  createProject(input: NewProject): Promise<Project>;
  setProjectStatus(projectId: string, status: Project["status"]): Promise<void>;
  markInvoiceSent(invoiceId: string, sentOn: string): Promise<void>;
  uploadDocument(input: UploadInput): Promise<ProjectDocument>;

  createTask(input: NewTask): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;

  setMailboxStatus(id: string, status: MailboxStatus): Promise<void>;
  saveAgentRule(rule: NewAgentRule): Promise<AgentRule>;
  removeAgentRule(id: string): Promise<void>;
  saveAgentSettings(settings: AgentSettings): Promise<void>;
  saveMailbox(input: MailboxInput): Promise<Mailbox>;

  /** Posteingänge lesen und zuordnen (Demo: nächste Lieferung erfundener Mails; später: Edge Function). */
  runAgent(): Promise<AgentRunSummary>;
  resolveReview(attachmentId: string, resolution: ReviewResolution): Promise<void>;
  /** Automatisch abgelegter Anhang war falsch: zurück in die Prüfliste (zählt gegen die Trefferquote). */
  reportWrongFiling(attachmentId: string): Promise<void>;
}
