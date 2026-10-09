// Typen des Posteingangs-Agenten. Gelten im Browser-Demo und in der Edge Function (Schritt 9) gleich.

import type { AgentRule, AgentSettings, BauherrContact, Company, FolderTemplate, InboxStatus, Project, ProjectParty, Salesperson } from "../lib/types";

export interface MailAttachment {
  fileName: string;
  mime: string;
  sizeBytes: number;
  /** Im Text eingebettet (z. B. Logo in der Signatur) */
  inline?: boolean;
  /** Passwortgeschütztes Archiv */
  encrypted?: boolean;
}

/** Eine gelesene Mail. Der Agent liest nur; er verschiebt, löscht und beantwortet nichts. */
export interface MailMessage {
  messageId: string;
  mailboxId: string;
  receivedAt: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  /** Textauszug, nicht die ganze Mail */
  body: string;
  attachments: MailAttachment[];
  /** Mail trägt einen List-Unsubscribe-Kopf (Newsletter) */
  listUnsubscribe?: boolean;
}

export interface ClassifyContext {
  /** Nur aktive Projekte kommen als Ziel in Frage */
  projects: Project[];
  companies: Company[];
  salespeople: Salesperson[];
  bauherren: BauherrContact[];
  parties: ProjectParty[];
  folderTemplates: FolderTemplate[];
  rules: AgentRule[];
  settings: AgentSettings;
  /** Bereits verarbeitete message_id (Dubletten) */
  knownMessageIds: Set<string>;
}

/** Was an das Sprachmodell geht: nur das Nötigste, keine vollständigen Mails, keine Kontaktdaten. */
export interface AiRequest {
  subject: string;
  from: string;
  fileNames: string[];
  excerpt: string;
  /** Höchstens 20 vorselektierte Projekte */
  candidates: { id: string; abmNr: string | null; bauherr: string; ort: string | null; firma: string | null }[];
  /** Erlaubte Ordnerpfade (Vorlage) */
  allowedFolders: string[];
}

/** Rohantwort des Modells: nicht vertrauenswürdig, wird strikt geprüft. */
export interface AiSuggestion {
  projectId?: string | null;
  folderPath?: string | null;
  confidence?: number;
  reason?: string;
}

export type AiAdvisor = (req: AiRequest) => AiSuggestion | null;

export interface AttachmentDecision {
  fileName: string;
  mime: string;
  sizeBytes: number;
  status: Exclude<InboxStatus, "neu">;
  projectId: string | null;
  /** Vorlagenpfad (mit {datum}) */
  folderTemplate: string | null;
  /** Konkreter Pfad (Datum = Maildatum) */
  folderPath: string | null;
  confidence: number | null;
  reason: string;
}

export interface MailDecision {
  messageId: string;
  /** Mail wurde schon verarbeitet: nichts tun */
  skipped?: "duplikat";
  status: Exclude<InboxStatus, "neu">;
  projectId: string | null;
  confidence: number | null;
  reason: string;
  attachments: AttachmentDecision[];
}
