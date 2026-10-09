// Repo-Interface: einziger Weg der Oberfläche zu den Daten.
// demoRepo (erfundene Daten im Speicher) und supabaseRepo (ab Schritt 8) implementieren es gleich.
// Die UI spricht nie direkt mit Supabase.

import type { SessionUser } from "./session";
import type { AgentRule, AgentSettings, Dataset, MailboxStatus, Project, ProjectDocument, Task } from "./types";

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
  markInvoiceSent(invoiceId: string, sentOn: string): Promise<void>;
  uploadDocument(input: UploadInput): Promise<ProjectDocument>;

  createTask(input: NewTask): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;

  setMailboxStatus(id: string, status: MailboxStatus): Promise<void>;
  saveAgentRule(rule: NewAgentRule): Promise<AgentRule>;
  removeAgentRule(id: string): Promise<void>;
  saveAgentSettings(settings: AgentSettings): Promise<void>;
}
