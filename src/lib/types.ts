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
  /** Flur (getrennt vom Flurstück, Migration 0013) */
  flur?: string | null;
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

/**
 * Rollen von Projektbeteiligten. Die ersten fünf stammen aus Liste.docx (sehen auch Freiberufler zugewiesener Projekte),
 * die übrigen kamen mit dem Planungsprotokoll dazu (Migration 0013, nur Admin und Mitarbeiter).
 * "sachbearbeiter" ist der zuständige ABM-Mitarbeiter: seine Tel./Mobil/E-Mail ersetzen im Protokoll die Bürodaten.
 */
export type PartyRole =
  | "vermesser"
  | "erdbauer"
  | "strom"
  | "wasser"
  | "elektriker_baustrom"
  | "kellerbauer"
  | "baugrundgutachter"
  | "gemeinde"
  | "bauamt"
  | "schornsteinfeger"
  | "gas"
  | "fernwaerme"
  | "abwasser"
  | "sonstige"
  | "sachbearbeiter";

/** Rollen aus Liste.docx: für Freiberufler zugewiesener Projekte lesbar (wie vor Migration 0013). */
export const CLASSIC_PARTY_ROLES: readonly PartyRole[] = ["vermesser", "erdbauer", "strom", "wasser", "elektriker_baustrom"];

export interface ProjectParty {
  projectId: string;
  role: PartyRole;
  name: string;
  /** Alte Kontaktzeile: Telefon oder Mail des Unternehmens (keine Privatperson). Bleibt neben den getrennten Feldern erhalten. */
  contact: string | null;
  /** Getrennte Kontaktangaben (Migration 0013), alle optional. */
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  fax?: string | null;
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
  /** Wohnanschrift getrennt (Migration 0013). `address` bleibt als eine Zeile erhalten. */
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  /** Mobil getrennt vom Telefon. */
  mobile?: string | null;
  /** Bauort getrennt (Migration 0013). Liegt wie `buildingAddress` beim Bauherrn: nur für Admin und Mitarbeiter. */
  siteStreet?: string | null;
  sitePostalCode?: string | null;
  siteCity?: string | null;
  /** Ortsteil bzw. Gemeindeteil */
  siteDistrict?: string | null;
  siteState?: string | null;
}

// ---------------------------------------------------------------------------
// Bürodaten und Planungsprotokoll (Migration 0013/0014)
// ---------------------------------------------------------------------------

/** Daten des Büros (Einstellungen, nur Admin ändert). Stehen im Planungsprotokoll beim Architekten. */
export interface BueroDaten {
  name: string | null;
  anschrift: string | null;
  tel: string | null;
  mobil: string | null;
  email: string | null;
}

export type ProtokollVorlage = "schwabenhaus" | "living-haus" | "bien-zenker";
/** "bearbeitbar": Felder bleiben ausfüllbar. "flach": Felder eingebrannt (Fassung zum Versand). */
export type ProtokollVariante = "bearbeitbar" | "flach";

export interface Planungsprotokoll {
  id: string;
  projectId: string;
  vorlage: ProtokollVorlage;
  variante: ProtokollVariante;
  /** Name der Person, die es erzeugt hat */
  erstelltVon: string | null;
  erstelltAm: string;
  /** Abgelegtes Dokument im Projektordner */
  dokumentId: string | null;
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
  /** Eigene Benutzer-ID (für "meine" Zeilen). null im Demo-Modus als Freiberufler. */
  meId: string | null;
  /** Konten mit Rolle Admin oder Mitarbeiter. Admins sehen alle, Mitarbeiter nur sich selbst, Freiberufler niemanden. */
  mitarbeiter: StaffMember[];
  /** Urlaub und Krankheit: eigene Zeilen, für Admins alle. Leer für Freiberufler (RLS). */
  abwesenheiten: Abwesenheit[];
  urlaubsAnspruch: UrlaubsAnspruch[];
  /** Bürodaten für das Planungsprotokoll. null, solange keine eingetragen sind, und für Freiberufler. */
  buero: BueroDaten | null;
  /** Erzeugte Planungsprotokolle (neueste zuerst). Leer für Freiberufler (RLS). */
  planungsprotokolle: Planungsprotokoll[];
}

// ---------------------------------------------------------------------------
// Urlaub und Krankheit
// ---------------------------------------------------------------------------

export interface StaffMember {
  id: string;
  name: string;
  role: "admin" | "mitarbeiter";
}

export type AbwesenheitArt = "urlaub" | "krank";
export type AbwesenheitStatus = "offen" | "genehmigt" | "abgelehnt" | "zurueckgezogen";

export interface Abwesenheit {
  id: string;
  userId: string;
  art: AbwesenheitArt;
  von: string;
  /** Letzter Tag. null nur bei einer Krankmeldung ohne Ende ("noch krank"). */
  bis: string | null;
  /** Werktage (nur Urlaub), von der Datenbank berechnet. */
  werktage: number | null;
  /** Krankmeldungen sind sofort "genehmigt" (keine Genehmigung nötig). */
  status: AbwesenheitStatus;
  /** Nur bei Urlaub. Krankmeldungen haben nie eine Notiz (keine Diagnose). */
  notiz: string | null;
  entscheidungVon: string | null;
  entscheidungAm: string | null;
  ablehnGrund: string | null;
  createdAt: string;
}

export interface UrlaubsAnspruch {
  userId: string;
  jahr: number;
  tage: number;
  uebertrag: number;
}

/** Eintrag im Abwesenheitskalender. `art` ist nur für Admins gesetzt; alle anderen sehen nur "abwesend". */
export interface KalenderEintrag {
  userId: string;
  name: string;
  von: string;
  bis: string;
  art: AbwesenheitArt | null;
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
