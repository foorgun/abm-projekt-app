// Repo-Interface: einziger Weg der Oberfläche zu den Daten.
// demoRepo (erfundene Daten im Speicher) und supabaseRepo (echte Datenbank) implementieren es gleich.
// Die UI spricht nie direkt mit Supabase.

import type { DocumentFilter, DocumentListResult } from "./documentFilters";
import type { SessionUser } from "./session";
import type { AgentRule, AgentSettings, Company, Dataset, Mailbox, MailboxStatus, PartyRole, Project, ProjectDocument, Salesperson, Task, TeamMember } from "./types";

export interface NewProject {
  bauherrLabel: string;
  abmNr: string | null;
  hausbauNr: string | null;
  kind: Project["kind"];
  companyId: string | null;
  salespersonId: string | null;
  location: string | null;
  architectId: string | null;
  planerId: string | null;
  /** Erster Tag des Eingangsmonats */
  intakeMonth: string | null;
  /** Name des Vermessers (Firma). Wird als Projektbeteiligter gespeichert. */
  vermesser?: string | null;
  /** Kontaktdaten des Bauherrn (nur Admin und Mitarbeiter). */
  bauherr?: BauherrInput | null;
  /** Projektordner aus der Vorlage anlegen (im Echtbetrieb im Speicher; im Demo-Modus protokolliert) */
  createFolders: boolean;
}

/** Kontaktdaten des Bauherrn. Leere Werte leeren das Feld. Ohne Namen gilt der Nachname des Projekts. */
export interface BauherrInput {
  name?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  buildingAddress: string | null;
}

/** Felder des Projekts, die sich auf der Projektseite bearbeiten lassen (Status und Art gehören nicht dazu). */
export type ProjectFields = Pick<
  Project,
  "bauherrLabel" | "abmNr" | "hausbauNr" | "companyId" | "salespersonId" | "location" | "architectId" | "planerId" | "intakeMonth" | "baubetreuung"
>;

/** Änderung an einem Projekt: nur was genannt ist, ändert sich. */
export interface ProjectPatch {
  project?: Partial<ProjectFields>;
  /** Alle Kontaktfelder auf einmal (die Kachel wird als Ganzes gespeichert). */
  bauherr?: BauherrInput;
  /** Beteiligte je Rolle; null trägt den Beteiligten aus. */
  parties?: Partial<Record<PartyRole, { name: string; contact: string | null } | null>>;
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
  /** Inhalt der Datei. Im Demo-Modus ungenutzt (dort werden nur die Angaben gespeichert). */
  blob?: Blob;
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
  /** Pflicht ist nur der Bauherr. Fehlen Angaben, entsteht eine Aufgabe "Fehlende Angaben nachfragen". */
  createProject(input: NewProject): Promise<Project>;
  /**
   * Projektdaten bearbeiten (nur Admin und Mitarbeiter), mit Protokolleintrag. Gleicht die Aufgabe
   * "Fehlende Angaben nachfragen" ab: fehlt nichts mehr, wird sie erledigt.
   */
  updateProject(projectId: string, patch: ProjectPatch): Promise<void>;
  /** Stammdaten direkt beim Anlegen eines Projekts ergänzen (nur Admin und Mitarbeiter). Der Name genügt. */
  createCompany(name: string): Promise<Company>;
  createSalesperson(companyId: string, name: string): Promise<Salesperson>;
  createTeamMember(name: string, role: TeamMember["role"]): Promise<TeamMember>;
  setProjectStatus(projectId: string, status: Project["status"]): Promise<void>;
  markInvoiceSent(invoiceId: string, sentOn: string): Promise<void>;
  uploadDocument(input: UploadInput): Promise<ProjectDocument>;
  /**
   * Alle Dokumente, die der Benutzer sehen darf, mit Filtern (Seite "Dokumente").
   * Liefert je Dokument Projekt und, bei Herkunft Agent, die zugehörige Mail (Betreff, Absender, Begründung).
   */
  listDocuments(filter: DocumentFilter): Promise<DocumentListResult>;
  /** Nur Echtbetrieb: kurzlebiger Link zum Öffnen einer Datei aus dem privaten Speicher. */
  documentUrl?(doc: ProjectDocument): Promise<string>;

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

  /** Nur Demo-Modus: alle Änderungen verwerfen und die erfundenen Ausgangsdaten neu laden. */
  resetDemo?(): Promise<void>;
}
