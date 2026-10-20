// Repo-Interface: einziger Weg der Oberfläche zu den Daten.
// demoRepo (erfundene Daten im Speicher) und supabaseRepo (echte Datenbank) implementieren es gleich.
// Die UI spricht nie direkt mit Supabase.

import type { DocumentFilter, DocumentListResult } from "./documentFilters";
import type { SessionUser } from "./session";
import type { DraftFormState, ExtractRequest, ExtractResponse, ProjectDraft } from "./extract/types";
import type { DetailAntwort, Fehler as SchornsteinfegerFehler, SuchAnfrage, SuchAntwort } from "./planungsprotokoll/schornsteinfeger";
import type {
  Abwesenheit,
  AgentRule,
  AgentSettings,
  BueroDaten,
  Company,
  ContractMeta,
  Dataset,
  DocumentType,
  KalenderEintrag,
  Mailbox,
  MailboxStatus,
  PartyRole,
  Planungsprotokoll,
  Project,
  ProjectDocument,
  ProjectDraftRecord,
  ProtokollVariante,
  ProtokollVorlage,
  Salesperson,
  Task,
  TeamMember,
} from "./types";

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
  flurstueck?: string | null;
  gemarkung?: string | null;
  flur?: string | null;
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
  /** Zweiter Bauherr. Nicht genannt (undefined) = unverändert. */
  name2?: string | null;
  phone2?: string | null;
  email2?: string | null;
  /** Getrennte Anschrift, Mobil und Bauort (Planungsprotokoll). Nicht genannt (undefined) = unverändert. */
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  mobile?: string | null;
  siteStreet?: string | null;
  sitePostalCode?: string | null;
  siteCity?: string | null;
  siteDistrict?: string | null;
  siteState?: string | null;
}

/** Ein Beteiligter. Außer dem Namen gilt: nicht genannt (undefined) = unverändert, null oder leer = leeren. */
export interface PartyInput {
  name: string;
  contact?: string | null;
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  fax?: string | null;
}

/** Erzeugtes Planungsprotokoll ablegen: als Dokument im Projektordner plus Eintrag in der Liste der Fassungen. */
export interface ProtokollAblage {
  projectId: string;
  vorlage: ProtokollVorlage;
  variante: ProtokollVariante;
  fileName: string;
  blob: Blob;
}

/** Felder des Projekts, die sich auf der Projektseite bearbeiten lassen (Status und Art gehören nicht dazu). */
export type ProjectFields = Pick<
  Project,
  "bauherrLabel" | "abmNr" | "hausbauNr" | "companyId" | "salespersonId" | "location" | "architectId" | "planerId" | "intakeMonth" | "baubetreuung" | "flurstueck" | "gemarkung" | "flur"
>;

/** Änderung an einem Projekt: nur was genannt ist, ändert sich. */
export interface ProjectPatch {
  project?: Partial<ProjectFields>;
  /** Alle Kontaktfelder auf einmal (die Kachel wird als Ganzes gespeichert). */
  bauherr?: BauherrInput;
  /** Beteiligte je Rolle; null trägt den Beteiligten aus. */
  parties?: Partial<Record<PartyRole, PartyInput | null>>;
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
  /** Vertrag: Typ und Metadaten (Vertragsdatum, Vertragspreis, Angebotsnummer, Haustyp). */
  docType?: DocumentType | null;
  meta?: ContractMeta;
}

/** Entwurf speichern: ohne `id` neu anlegen (dann mit Datei), mit `id` den Stand der Prüfmaske aktualisieren. */
export interface DraftInput {
  id?: string;
  draft: ProjectDraft;
  form: DraftFormState;
  docType: DocumentType;
  file: { name: string; size: number; type: string };
  /** Inhalt der Datei, nur beim ersten Speichern nötig. */
  blob?: Blob;
}

/** Vertrag aus der Prüfmaske in ein Projekt ablegen und den Entwurf abschließen. */
export interface ContractFiling {
  projectId: string;
  docType: DocumentType;
  meta: ContractMeta;
  file: { name: string; size: number; type: string };
  blob?: Blob;
  /** Entwurf, der damit erledigt ist (wird als übernommen markiert, seine Datei im Entwurfsspeicher entfernt). */
  draftId?: string | null;
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
  /**
   * Projekt endgültig löschen, mit Schritten, Aufgaben, Rechnungen, Aktivitäten, Dokumenten (auch den Dateien im Speicher),
   * Beteiligten, Zuweisungen und Entwürfen. Der Bauherr-Kontakt geht mit, wenn er an keinem anderen Projekt hängt.
   * Nur Admin. `filesLeft`: Dateien, die sich nicht aus dem Speicher entfernen ließen (die Zeilen sind trotzdem gelöscht).
   */
  deleteProject(projectId: string): Promise<{ filesLeft: number }>;
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

  // --- Neues Projekt aus einem Vertrag (nur Admin und Mitarbeiter) ---
  saveProjectDraft(input: DraftInput): Promise<ProjectDraftRecord>;
  /** Entwurf verwerfen (Status, kein Löschen der Zeile); die Datei im Entwurfsspeicher wird entfernt. */
  discardProjectDraft(id: string): Promise<void>;
  /** Datei eines offenen Entwurfs zum Fortsetzen (Vorschau, spätere Ablage). null, wenn sie fehlt. */
  draftFile(id: string): Promise<Blob | null>;
  /** Legt den Vertrag im Zielordner seines Typs ab (privater Speicher) und schließt den Entwurf ab. */
  fileContract(input: ContractFiling): Promise<ProjectDocument>;
  /** Nur Echtbetrieb: KI-Auslesung über die Edge Function extract-project. Fehlt im Demo-Modus. */
  extractProject?(request: ExtractRequest): Promise<ExtractResponse>;

  // --- Urlaub und Krankheit (nur Admin und Mitarbeiter; Regeln erzwingt die Datenbank, Migration 0012) ---
  /** Eigenen Urlaub beantragen. Status "offen"; die Werktage rechnet die Datenbank. */
  requestUrlaub(input: { von: string; bis: string; notiz?: string | null }): Promise<Abwesenheit>;
  /** Eigenen offenen Antrag zurückziehen. */
  withdrawUrlaub(id: string): Promise<void>;
  /** Sich krank melden: sofort wirksam, ohne Notiz. `bis` leer = noch krank. */
  reportKrank(input: { von: string; bis: string | null }): Promise<Abwesenheit>;
  /** Bei der eigenen Krankmeldung den letzten Krankheitstag nachtragen. */
  setKrankBis(id: string, bis: string): Promise<void>;
  /** Offenen Antrag einer ANDEREN Person genehmigen oder ablehnen (nur Admin; nie der eigene). */
  decideUrlaub(id: string, status: "genehmigt" | "abgelehnt", grund?: string | null): Promise<void>;
  /** Anspruch und Übertrag einer Person für ein Jahr setzen (nur Admin). */
  setUrlaubsAnspruch(userId: string, jahr: number, werte: { tage: number; uebertrag: number }): Promise<void>;
  /** Kalender: wer im Zeitraum abwesend ist. Für Nicht-Admins ohne Grund (art ist null). */
  kalenderAbwesenheiten(von: string, bis: string): Promise<KalenderEintrag[]>;

  // --- Planungsprotokoll (nur Admin und Mitarbeiter; Migration 0013/0014) ---
  /** Bürodaten speichern (nur Admin). Leere Werte leeren das Feld. */
  saveBueroDaten(daten: BueroDaten): Promise<void>;
  /** PDF-Vorlage laden: Echtbetrieb aus dem privaten Bucket "vorlagen", Demo-Modus aus dem lokalen Ordner. */
  vorlageLaden(vorlage: ProtokollVorlage): Promise<ArrayBuffer>;
  /** Erzeugtes Protokoll im Projektordner ablegen und als neue Fassung eintragen (nie überschreiben). */
  savePlanungsprotokoll(input: ProtokollAblage): Promise<Planungsprotokoll>;
  /** Datei einer Fassung zum Herunterladen. */
  planungsprotokollDatei(protokoll: Planungsprotokoll): Promise<Blob>;
  /**
   * Schornsteinfeger zur Bauadresse vorschlagen (Echtbetrieb: Edge Function schornsteinfeger-suche, Demo: feste Beispielantwort).
   * Wirft nie wegen der Quelle: Fehler kommen als { ok: false } bzw. Status quelle_nicht_erreichbar zurück.
   */
  schornsteinfegerSuchen(anfrage: SuchAnfrage): Promise<SuchAntwort | SchornsteinfegerFehler>;
  /** Kontaktdaten des gewählten Kandidaten (nur nach einer Suche). */
  schornsteinfegerDetails(bsmId: string): Promise<DetailAntwort | SchornsteinfegerFehler>;

  /** Nur Demo-Modus: alle Änderungen verwerfen und die erfundenen Ausgangsdaten neu laden. */
  resetDemo?(): Promise<void>;
}
