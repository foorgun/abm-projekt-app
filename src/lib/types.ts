// Domänentypen der App. Spiegeln das Schema in supabase/migrations (snake_case → camelCase).

import type { DraftFormState, ProjectDraft } from "./extract/types";
import type { StepDefinition } from "./steps";

export type ProjectKind = "neubau" | "bauvoranfrage";
export type ProjectStatus = "aktiv" | "storno" | "abgeschlossen";
export type InvoiceStatus = "geplant" | "faellig" | "versendet" | "bezahlt";

/** Schritt-Key → Datum (YYYY-MM-DD). Fehlender Key = Schritt noch offen. */
export type StepDates = Partial<Record<string, string>>;

export interface Company {
  id: string;
  name: string;
  numberPrefix: string | null;
}

export interface Salesperson {
  id: string;
  companyId: string;
  name: string;
  /** Absenderadresse, z. B. für die Zuordnung von Mails (Agent). */
  email?: string | null;
}

export interface TeamMember {
  id: string;
  code: string | null;
  name: string;
  role: "architekt" | "planer";
}

export interface Project {
  id: string;
  abmNr: string | null;
  /** Auftragsnummer der Hausbaufirma ("Hausbau-Nr."). */
  hausbauNr?: string | null;
  kind: ProjectKind;
  status: ProjectStatus;
  companyId: string | null;
  salespersonId: string | null;
  bauherrLabel: string;
  location: string | null;
  architectId: string | null;
  planerId: string | null;
  baubetreuung: string | null;
  intakeMonth: string | null;
  notes: string | null;
  /** Flurstück und Gemarkung des Baugrundstücks (optional; dienen auch der Duplikatprüfung). */
  flurstueck?: string | null;
  gemarkung?: string | null;
  steps: StepDates;
}

export interface Invoice {
  id: string;
  projectId: string;
  label: string;
  amountCents: number;
  triggerStep: string | null;
  status: InvoiceStatus;
  dueOn: string | null;
  sentOn: string | null;
  paidOn: string | null;
}

/** Alles, was die Warnlogik braucht. */
export interface Snapshot {
  companies: Company[];
  salespeople: Salesperson[];
  team: TeamMember[];
  projects: Project[];
  invoices: Invoice[];
}

// ---------------------------------------------------------------------------
// Projektdetails (Liste.docx: Projektbeteiligte)
// ---------------------------------------------------------------------------

export type PartyRole = "vermesser" | "erdbauer" | "strom" | "wasser" | "elektriker_baustrom";

export interface ProjectParty {
  projectId: string;
  role: PartyRole;
  name: string;
  /** Telefon oder Mail des Unternehmens (keine Privatperson). */
  contact: string | null;
}

/** Kontaktdaten des Bauherrn. Nur für Mitarbeiter und Admins sichtbar (RLS). */
export interface BauherrContact {
  projectId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  buildingAddress: string | null;
  /** Zweiter Bauherr (z. B. Ehepartner): nur Name, Telefon und E-Mail, keine eigene Entität. */
  name2?: string | null;
  phone2?: string | null;
  email2?: string | null;
}

// ---------------------------------------------------------------------------
// Ordner und Dokumente
// ---------------------------------------------------------------------------

export interface FolderTemplate {
  /** Pfad mit "/" als Trenner, Datumsplatzhalter normalisiert zu "{datum}". */
  path: string;
  parentPath: string | null;
  sort: number;
  label: string;
  /** Ordnername enthält ein Datum, das beim Ablegen eingesetzt wird. */
  hasDate: boolean;
  keywords: string[];
  description: string | null;
}

export type DocumentSource = "upload" | "agent";
/** Typ eines abgelegten Vertrags; bestimmt den Zielordner (lib/extract/filing.ts). */
export type DocumentType = "werkvertrag" | "vermessungsvertrag" | "sonstiges";
/** Metadaten eines Vertrags am Dokument (keine Projektfelder): Texte, wie sie in der Prüfmaske bestätigt wurden. */
export interface ContractMeta {
  vertragsdatum?: string;
  vertragspreis?: string;
  angebotsnummer?: string;
  haustyp?: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  /** Konkreter Ordnerpfad (Datum bereits eingesetzt). */
  folderPath: string;
  storagePath: string;
  mime: string | null;
  sizeBytes: number | null;
  source: DocumentSource;
  /** Bei Herkunft "agent": der zugehörige Anhang. */
  sourceItemId: string | null;
  receivedOn: string | null;
  uploadedBy: string | null;
  createdAt: string;
  docType?: DocumentType | null;
  meta?: ContractMeta;
}

// ---------------------------------------------------------------------------
// Aufgaben
// ---------------------------------------------------------------------------

export type TaskStatus = "offen" | "erledigt";
export type TaskSource = "manuell" | "warnung" | "agent";

export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  dueOn: string | null;
  /** team_members.id */
  assigneeId: string | null;
  status: TaskStatus;
  source: TaskSource;
  /** Eindeutiger Schlüssel der Quelle (z. B. Warnungs-ID), verhindert Dubletten. */
  sourceKey: string | null;
  createdAt: string;
  doneAt: string | null;
}

// ---------------------------------------------------------------------------
// Aktivitäten
// ---------------------------------------------------------------------------

export type ActivityKind = "schritt" | "datei" | "rechnung" | "aufgabe" | "projekt" | "agent";

export interface Activity {
  id: string;
  projectId: string | null;
  kind: ActivityKind;
  text: string;
  actor: string;
  /** ISO-Zeitstempel */
  at: string;
}

// ---------------------------------------------------------------------------
// Posteingangs-Agent
// ---------------------------------------------------------------------------

export type MailboxProvider = "microsoft365" | "imap" | "demo";
export type MailboxStatus = "verbunden" | "pausiert" | "fehler";

export interface Mailbox {
  id: string;
  label: string;
  address: string;
  provider: MailboxProvider;
  status: MailboxStatus;
  lastCheckedAt: string | null;
  watchFolder: string;
}

export type InboxStatus = "neu" | "abgelegt" | "pruefen" | "ignoriert" | "fehler";

export interface InboxItem {
  id: string;
  mailboxId: string;
  messageId: string;
  receivedAt: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  bodyExcerpt: string;
  status: InboxStatus;
  projectId: string | null;
  confidence: number | null;
  reason: string | null;
  createdAt: string;
}

export interface InboxAttachment {
  id: string;
  itemId: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  storagePath: string | null;
  projectId: string | null;
  /** Vorlagenpfad oder konkreter Pfad (mit Datum). */
  folderPath: string | null;
  confidence: number | null;
  status: InboxStatus;
  documentId: string | null;
  /** Automatisch abgelegt und später von Hand korrigiert (für die Trefferquote). */
  corrected: boolean;
}

export interface AgentRun {
  id: string;
  mailboxId: string;
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  filed: number;
  toReview: number;
  ignored: number;
  errors: number;
  note: string | null;
}

export type AgentRuleKind = "absender_projekt" | "absender_ordner" | "ignorieren";

export interface AgentRule {
  id: string;
  kind: AgentRuleKind;
  /** Absenderadresse oder Domain (z. B. "@newsletter.example"). */
  match: string;
  projectId: string | null;
  folderPath: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AgentSettings {
  /** Ab dieser Sicherheit (0–1) wird automatisch abgelegt. */
  autoFileThreshold: number;
  /** Ab dieser Sicherheit kommt ein Vorschlag in die Prüfliste, darunter ohne Vorschlag. */
  suggestThreshold: number;
}

/** Bestätigung oder Korrektur durch einen Menschen: Lernbeispiel für spätere Zuordnungen. */
export interface AgentFeedback {
  id: string;
  attachmentId: string;
  action: "bestaetigt" | "geaendert" | "ignoriert";
  projectId: string | null;
  folderPath: string | null;
  createdBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Gesamter Datenbestand, den die App lädt
// ---------------------------------------------------------------------------

export interface Dataset extends Snapshot {
  stepDefinitions: StepDefinition[];
  folderTemplates: FolderTemplate[];
  parties: ProjectParty[];
  /** Leer für Freiberufler (RLS). */
  bauherren: BauherrContact[];
  documents: ProjectDocument[];
  tasks: Task[];
  activities: Activity[];
  mailboxes: Mailbox[];
  inboxItems: InboxItem[];
  inboxAttachments: InboxAttachment[];
  agentRuns: AgentRun[];
  agentRules: AgentRule[];
  agentSettings: AgentSettings;
  agentFeedback: AgentFeedback[];
  /** Entwürfe "Neues Projekt aus Dokument". Leer für Freiberufler (RLS). */
  projectDrafts: ProjectDraftRecord[];
}

// ---------------------------------------------------------------------------
// Entwürfe: neues Projekt aus einem Vertrag
// ---------------------------------------------------------------------------

export type DraftStatus = "offen" | "uebernommen" | "verworfen";

export interface ProjectDraftRecord {
  id: string;
  status: DraftStatus;
  /** Ergebnis des Extractors (Felder mit Wert, Quelle, Sicherheit). */
  draft: ProjectDraft;
  /** Stand der Prüfmaske, damit man später weitermachen kann. */
  form: DraftFormState;
  docType: DocumentType;
  file: { name: string; size: number; type: string };
  /** Pfad der Datei im privaten Speicher, solange der Entwurf offen ist. */
  storagePath: string | null;
  projectId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
