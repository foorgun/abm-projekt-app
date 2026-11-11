import { createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, FileUp, Mail, X } from "lucide-react";
import { ALWAYS_CHECK, applyDraft, cleanMeta, FORM_SOURCE, formPatchFor, preserveEdited, SIMILAR_LABEL, similarProjects, type AppliedDraft, type FormKey } from "../lib/extract/applyDraft";
import { initialJob, metaOf, readDocuments } from "../lib/extract/batch";
import { mergeDrafts, sourceLabel, type ConflictOption, type MergedDraft } from "../lib/extract/merge";
import {
  checkContractFile,
  CONTRACT_ACCEPT,
  DRAFT_FIELDS,
  emptyDraft,
  ExtractUnavailable,
  extractorKind,
  extractProjectFromDocument,
  NO_SITE_HINT,
  restrictToType,
  SICHERHEIT_LABEL,
  VERTRAGSART_LABEL,
  type DraftFieldKey,
  type DraftFormState,
  type ProjectDraft,
  type Sicherheit,
  type Vertragsart,
} from "../lib/extract";
import { companyForAbm, suggestNummer } from "../lib/abmNr";
import { suggestBundesland } from "../lib/bundesland";
import { isPilot } from "../lib/appMode";
import { scanWerkvertragFile, vermesservertragFile, vorlageVermessungFile } from "../lib/extract/fixtures";
import { beteiligteNachAnlage, KELLER_BAUSEITS } from "../lib/extract/nachtraeglich";
import { sourcePage } from "../lib/extract/previewState";
import { extension } from "../lib/files";
import { formatBytes, formatDate, monthStart } from "../lib/format";
import { anfrageTextOf, berlinDay, isEmlFile, MAIL_FOLDER, matchSender, readEml, type ParsedMail, type SenderMatch } from "../lib/mail/eml";
import { extractProjectFromMail, MAIL_DRAFT_FIELDS } from "../lib/mail/extractMail";
import { demoAnfrageEml } from "../lib/mail/fixtures";
import { folgeAnschrift } from "../lib/projectEdit";
import { namensFormKey, namenTeilen, WEITERE_BAUHERREN, weitereSichtbar } from "../lib/weitereBauherren";
import { anfrageOhneBauherr, infoStateOfNew, missingProjectInfo, validateNewProject, type ProjectFormErrors } from "../lib/projectForm";
import { projectTitle } from "../lib/projects";
import type { NewProject } from "../lib/repo";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { ContractMeta, DraftFileRecord, Project, ProjectDraftRecord } from "../lib/types";
import { AbmHinweise } from "./AbmHinweise";
import { BaubegleitungField } from "./BaubegleitungField";
import { BundeslandSelect } from "./BundeslandSelect";
import { DocumentCards, pagesText, UploadList, type DocEntry } from "./DraftDocuments";
import { DocumentPreview } from "./DocumentPreview";
import { useToast } from "./Toast";
import { SelectOrCreate } from "./SelectOrCreate";
import { AiSpinner, Button, Checkbox, Dialog, Field, IconButton, Input, Pill, Select, type Tone } from "./ui";

/** Öffnet den Dialog "Neues Projekt"; mit der ID eines Entwurfs wird dieser fortgesetzt. */
// Als Klick-Handler bekommt die Funktion ein Ereignis statt einer ID, deshalb "unknown": nur Zeichenketten zählen
const NewProjectContext = createContext<(draftId?: unknown) => void>(() => {});
/** Öffnet denselben Dialog für eine Projektanfrage vom Verkäufer. */
const NewRequestContext = createContext<() => void>(() => {});

/** Stellt den Dialog "Neues Projekt" bereit (Kopfzeile, Projektliste, leere Zustände, Prüfliste). */
export function NewProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; draftId: string | null; request: boolean }>({ open: false, draftId: null, request: false });
  const openDialog = useCallback((draftId?: unknown) => setState({ open: true, draftId: typeof draftId === "string" ? draftId : null, request: false }), []);
  const openRequest = useCallback(() => setState({ open: true, draftId: null, request: true }), []);
  return (
    <NewProjectContext.Provider value={openDialog}>
      <NewRequestContext.Provider value={openRequest}>
        {children}
        {state.open && <NewProjectDialog key={state.draftId ?? "neu"} draftId={state.draftId} request={state.request} onClose={() => setState({ open: false, draftId: null, request: false })} />}
      </NewRequestContext.Provider>
    </NewProjectContext.Provider>
  );
}

export function useNewProject() {
  return useContext(NewProjectContext);
}

export function useNewRequest() {
  return useContext(NewRequestContext);
}

const SICHERHEIT_TONE: Record<Sicherheit, Tone> = { hoch: "ok", mittel: "neutral", niedrig: "warn" };
const KIND_OF = (name: string, type: string) => {
  const c = checkContractFile({ name, size: 1, type });
  return c.ok ? c.kind : null;
};

/** Schritte im Dialog: Dateien (hinzufügen, speichern, auslesen), Formular (manuell oder als Prüfmaske), Duplikate. */
type Step = "start" | "form" | "duplicates";

/** Formularfelder, die ein Entwurfsfeld speisen (für "von Hand geändert" bei abweichenden Werten). */
const FORM_KEYS_OF = Object.fromEntries(DRAFT_FIELDS.map((k) => [k, (Object.keys(FORM_SOURCE) as FormKey[]).filter((f) => FORM_SOURCE[f] === k)])) as Record<DraftFieldKey, FormKey[]>;

/** Feldnamen für Hinweise zu abweichenden Werten */
const CONFLICT_LABEL: Partial<Record<DraftFieldKey, string>> & Record<string, string> = {
  bauherrLabel: "Nachname (Bauherr 1)",
  bauherrName: "Vorname (Bauherr 1)",
  phone: "Telefon",
  email: "E-Mail",
  address: "Anschrift",
  bauherr2Name: "Bauherr 2",
  bauherr2Phone: "Telefon (Bauherr 2)",
  bauherr2Email: "E-Mail (Bauherr 2)",
  company: "Hausbaufirma",
  buildingAddress: "Bauadresse",
  location: "Bauort",
  flur: "Flur",
  flurstueck: "Flurstück",
  gemarkung: "Gemarkung",
  vermesser: "Vermesser",
  rechtsform: "Rechtsform",
  foerderung: "Förderung",
  vermesserAnschrift: "Anschrift (Vermesser)",
  vermesserTelefon: "Telefon (Vermesser)",
  vermesserEmail: "E-Mail (Vermesser)",
  kellerBauseits: "Keller/Bodenplatte bauseits",
};

/** Eine hineingezogene Mail (.eml): wird mit dem Projekt samt der nicht auslesbaren Anhänge in MAIL_FOLDER abgelegt. */
interface MailEntry {
  key: string;
  file: File;
  mail: ParsedMail;
  /** Hausbaufirma (und Verkäufer) aus dem Absender übernommen */
  sender: "verkaeufer" | "firma" | null;
  /** Abgleich des Absenders mit den Stammdaten (auch ein noch fehlender Verkäufer) */
  match: SenderMatch | null;
  /** Auslesung des Mailtexts (Bauherr, Baugrundstück) */
  phase: "liest" | "fertig" | "fehler" | "ohne";
  draft: ProjectDraft | null;
  error: string | null;
}

/** Quelle eines Werts aus dem Mailtext (IDs der Mails beginnen mit "mail-") */
const isMailSource = (id: string | undefined) => Boolean(id?.startsWith("mail-"));

const MAIL_ACCEPT = ".eml,message/rfc822";

/** Feldnamen, die aus dem Mailtext erkannt wurden */
const mailFound = (m: MailEntry) => (m.draft ? MAIL_DRAFT_FIELDS.filter((k) => m.draft!.felder[k].wert && k !== "bauherrName").map((k) => CONFLICT_LABEL[k] ?? k) : []);

const count = (n: number, eins: string, mehr: string) => (n === 1 ? `1 ${eins}` : `${n} ${mehr}`);

/** Was aus einer Mail übernommen wird und wohin ihre Teile gehen (Startschritt). */
function MailList({ mails, request, onRemove }: { mails: MailEntry[]; request: boolean; onRemove: (m: MailEntry) => void }) {
  if (!mails.length) return null;
  return (
    <ul className="job-list" aria-label="Mails">
      {mails.map((m) => {
        const { mail } = m;
        const von = mail.fromName ?? mail.fromEmail ?? "unbekanntem Absender";
        return (
          <li key={m.key} className="job-item mail-item">
            <Mail size={18} aria-hidden className="job-icon" />
            <span className="job-name" title={mail.subject ?? m.file.name}>
              {mail.subject ?? m.file.name}
            </span>
            <span className="job-size muted">{formatBytes(m.file.size)}</span>
            <span className="job-art muted">
              von {von}
              {mail.date ? ` · ${formatDate(berlinDay(mail.date))}` : ""}
            </span>
            <span className="job-actions">
              <IconButton size="sm" label={`Mail ${m.file.name} entfernen`} onClick={() => onRemove(m)}>
                <X size={14} />
              </IconButton>
            </span>
            <ul className="mail-facts">
              <li>{!mail.text ? "Mail ohne Text" : request ? "Nachricht übernommen" : "Nachricht bleibt in der Mail"}{m.sender === "verkaeufer" ? ", Hausbaufirma und Verkäufer am Absender erkannt" : m.sender === "firma" ? ", Hausbaufirma am Absender erkannt" : ""}.</li>
              {m.match?.newSalesperson && m.sender === "firma" && <li>Verkäufer „{m.match.newSalesperson}“ steht noch nicht in den Stammdaten: im nächsten Schritt mit einem Klick anlegen.</li>}
              <li>
                {m.phase === "liest" ? (
                  <AiSpinner size="sm" label="Bauherr und Baugrundstück werden aus dem Text gelesen …" />
                ) : m.phase === "fehler" ? (
                  <span className="mail-error">Text nicht ausgelesen: {m.error}</span>
                ) : m.phase === "fertig" ? (
                  mailFound(m).length ? `Aus dem Text erkannt: ${mailFound(m).join(", ")}.` : "Im Text keine Angaben zu Bauherr oder Baugrundstück gefunden."
                ) : null}
              </li>
              <li>{mail.readable.length ? `${count(mail.readable.length, "Anhang wird", "Anhänge werden")} ausgelesen (unten).` : "Kein Anhang zum Auslesen."}</li>
              <li>
                Beim Anlegen abgelegt in „{MAIL_FOLDER}“: die Mail
                {mail.other.length ? ` und ${mail.other.map((f) => f.name).join(", ")}` : ""}.
              </li>
              {mail.skipped.length > 0 && (
                <li className="mail-skipped">
                  Nicht übernommen: {mail.skipped.map((x) => `${x.name} (${x.reason.replace(/\.$/, "")})`).join(", ")}.
                </li>
              )}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

const PHASE_OF: Record<DraftFileRecord["status"], DocEntry["phase"]> = { offen: "fehler", ausgelesen: "fertig", fehler: "fehler", entfernt: "abgelehnt", abgelegt: "fertig" };

/** Dokumente eines gespeicherten Entwurfs; ältere Entwürfe haben genau eine Datei direkt am Entwurf. */
function docsOfDraft(rec: ProjectDraftRecord | null): DocEntry[] {
  if (!rec) return [];
  if (!rec.files.length) {
    return [
      {
        key: "legacy",
        legacy: true,
        name: rec.file.name,
        size: rec.file.size,
        type: rec.file.type,
        phase: rec.draft.textquelle === "ohne" ? "fehler" : "fertig",
        error: rec.draft.textquelle === "ohne" ? (rec.draft.hinweise[0] ?? null) : null,
        errorCode: null,
        fileId: null,
        art: rec.docType,
        artTouched: true,
        draft: rec.draft.textquelle === "ohne" ? null : rec.draft,
        meta: rec.form.meta ?? {},
        blob: null,
      },
    ];
  }
  return rec.files.map((f) => ({
    key: f.id,
    name: f.file.name,
    size: f.file.size,
    type: f.file.type,
    phase: PHASE_OF[f.status],
    error: f.status === "offen" ? "Noch nicht ausgelesen (Auslesung wurde unterbrochen)." : f.error,
    errorCode: null,
    fileId: f.id,
    art: f.docType,
    artTouched: true,
    draft: f.draft,
    meta: f.meta,
    blob: null,
  }));
}

/** Dokumente und ausgelesene Mailtexte zusammenführen (Mails nach den Dokumenten, als "sonstiges"). */
const mergeOf = (docs: DocEntry[], mails: MailEntry[] = []) =>
  mergeDrafts([
    ...docs.filter((d) => d.phase === "fertig" && d.draft).map((d) => ({ id: d.fileId ?? d.key, art: d.art, draft: d.draft! })),
    ...mails.filter((m) => m.draft).map((m) => ({ id: m.key, art: "sonstiges" as const, draft: m.draft! })),
  ]);

/** Entwurf für die Prüfmaske aus dem Zusammengeführten; nicht ausgelesene Dateien stehen in den Hinweisen. */
function displayDraft(docs: DocEntry[], merged: MergedDraft, mails: MailEntry[] = []): ProjectDraft {
  const read = [...docs.filter((d) => d.phase === "fertig" && d.draft), ...mails.filter((m) => m.draft)];
  const first = docs.find((d) => d.phase !== "abgelehnt");
  const datei = first ? { name: first.name, size: first.size, type: first.type } : { name: "ohne Dokument", size: 0, type: "" };
  const failed = [
    ...docs.filter((d) => d.phase === "fehler").map((d) => `${d.name}: nicht ausgelesen (${d.error ?? "unbekannter Grund"}). Die Datei wird trotzdem im Projekt abgelegt.`),
    ...mails.filter((m) => m.phase === "fehler").map((m) => `Mailtext nicht ausgelesen (${m.error ?? "unbekannter Grund"}).`),
  ];
  if (!read.length) return emptyDraft(datei, "edge", [...failed, "Bitte die Felder von Hand ausfüllen."]);
  return {
    datei,
    textquelle: read.some((d) => d.draft!.textquelle === "bild") ? "bild" : read[0].draft!.textquelle,
    extractor: read[0].draft!.extractor,
    gescannt: merged.gescannt,
    felder: merged.felder,
    hinweise: [...failed, ...merged.hinweise],
  };
}

function NewProjectDialog({ onClose, draftId, request }: { onClose: () => void; draftId: string | null; request: boolean }) {
  const { data, mutate, today, repo, reload } = useData();
  const { user } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  // Stammdaten anlegen und Verträge ablegen dürfen Admin und Mitarbeiter (die Datenbank prüft das ebenfalls)
  const canCreate = user.role !== "freiberufler";
  // Pilot: keine Aufgaben, Rechnungen und Prüfliste; Hinweise darauf entfallen bzw. zeigen auf die Projektliste
  const pilot = isPilot();
  const companies = data?.companies ?? [];
  const team = data?.team ?? [];
  const projects = data?.projects ?? [];
  const architects = team.filter((t) => t.role === "architekt");
  const planers = team.filter((t) => t.role === "planer");
  const resumed = draftId ? (data?.projectDrafts.find((d) => d.id === draftId && d.status === "offen") ?? null) : null;

  const [v, setV] = useState<NewProject>(
    () =>
      // Ältere Entwürfe kennen nur den ganzen Namen: Vorname und Nachname daraus vorschlagen
      (resumed ? { ...resumed.form.project, bauherr: resumed.form.project.bauherr && namenTeilen(resumed.form.project.bauherr, resumed.form.project.bauherrLabel) } : null) ?? {
        kind: "neubau",
        abmNr: null,
        hausbauNr: null,
        bauherrLabel: "",
        location: null,
        companyId: null,
        salespersonId: null,
        architectId: architects[0]?.id ?? null,
        planerId: null,
        intakeMonth: monthStart(today),
        ...(request ? { status: "anfrage" as const, anfrageText: null } : {}),
        baubegleitung: true,
        vermesser: null,
        flurstueck: null,
        gemarkung: null,
        bauherr: { phone: null, email: null, address: null, buildingAddress: null },
        createFolders: true,
      },
  );
  /** Leeres Formular: Ausgangspunkt für jedes neu gelesene Dokument (Werte eines früheren Dokuments bleiben nicht stehen) */
  const blank = useRef<NewProject>({ ...v, ...(resumed ? { bauherrLabel: "", bauherr: { phone: null, email: null, address: null, buildingAddress: null } } : {}) });
  /** Vermesser, die in diesem Dialog neu eingetragen wurden (gespeichert werden sie erst mit dem Projekt) */
  const [newSurveyors, setNewSurveyors] = useState<string[]>(resumed?.form.project.vermesser ? [resumed.form.project.vermesser] : []);
  const [touched, setTouched] = useState(Boolean(resumed));
  const [busy, setBusy] = useState(false);
  /** Dokument, das gerade (erneut) gelesen wird: eigene Anzeige an seiner Kachel */
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  // Vertrag ablegen dürfen nur Admin und Mitarbeiter; alle anderen sehen direkt das Formular
  const [step, setStep] = useState<Step>(resumed || !canCreate ? "form" : "start");
  /** Zusammengeführter Entwurf aller ausgelesenen Dokumente (speist die Prüfmaske) */
  const [draft, setDraft] = useState<ProjectDraft | null>(resumed?.draft ?? null);
  /** ID des gespeicherten Entwurfs (zum Fortsetzen und Abschließen); als Ref, damit mehrere Dateien denselben Entwurf nutzen */
  const [savedId, setSavedIdState] = useState<string | null>(resumed?.id ?? null);
  const savedRef = useRef<string | null>(resumed?.id ?? null);
  const setSavedId = (id: string | null) => {
    savedRef.current = id;
    setSavedIdState(id);
  };
  /** Dokumente des Entwurfs mit Zustand, Ergebnis und Inhalt */
  const [docs, setDocs] = useState<DocEntry[]>(() => (resumed ? docsOfDraft(resumed) : []));
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const [activeKey, setActiveKey] = useState<string | null>(() => docsOfDraft(resumed)[0]?.key ?? null);
  /** Vorschau: angezeigte Seite und Seitenzahl des Dokuments (die Vorschau rendert Seiten erst beim Anzeigen) */
  const [viewPage, setViewPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [unmatched, setUnmatched] = useState<AppliedDraft["unmatched"]>({});
  /** Abweichende Werte aus mehreren Dokumenten und die Felder, für die schon gewählt wurde */
  const [conflicts, setConflicts] = useState<MergedDraft["conflicts"]>(() => (resumed ? mergeOf(docsOfDraft(resumed)).conflicts : {}));
  const [resolved, setResolved] = useState<ReadonlySet<string>>(new Set(resumed?.form.resolved ?? []));
  /** Felder, die der Mensch nach dem Vorbefüllen selbst geändert hat (gelten als geprüft) */
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set(resumed?.form.edited ?? []));
  /** Weitere Bauherren, für die Felder angefordert wurden (Bauherr 2 bis 4; Bauherr 2 steht immer da) */
  const [weitereAngefordert, setWeitereAngefordert] = useState(1);
  const [dropActive, setDropActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  /** Hineingezogene Mails; sie liegen nur im Dialog (nicht im Entwurf) und werden beim Anlegen abgelegt */
  const [mails, setMails] = useState<MailEntry[]>([]);
  const mailsRef = useRef(mails);
  mailsRef.current = mails;
  const fileInput = useRef<HTMLInputElement>(null);
  const active = docs.find((d) => d.key === activeKey) ?? docs.find((d) => d.phase !== "abgelehnt") ?? null;
  const updateDoc = (key: string, patch: Partial<DocEntry>) => setDocs((old) => old.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  // Fortgesetzter Entwurf bzw. Wechsel des Dokuments: Inhalt für Vorschau und Ablage erst bei Bedarf nachladen
  useEffect(() => {
    if (!active || active.blob || (!active.fileId && !active.legacy)) return;
    let alive = true;
    void (async () => {
      const file = await (active.legacy ? repo.draftFile(savedRef.current ?? "") : repo.draftFileBlob(active.fileId!)).catch(() => null);
      if (alive && file) updateDoc(active.key, { blob: file });
    })();
    return () => {
      alive = false;
    };
    // nur beim Wechsel des angezeigten Dokuments
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, active?.blob]);

  // Prüfmaske von oben zeigen: der Dialog setzt den Fokus ins erste Feld, auf dem Handy läge die Vorschau sonst außer Sicht
  useEffect(() => {
    if (step === "form" && draft) document.querySelector(".dialog-xwide .dialog-body")?.scrollTo(0, 0);
  }, [step, draft]);

  /** Anfrage statt Projekt (bleibt auch beim Fortsetzen eines gespeicherten Entwurfs erhalten) */
  const isRequest = v.status === "anfrage";
  const noun = isRequest ? "Anfrage" : "Projekt";
  const dialogTitle = isRequest ? "Neue Anfrage" : "Neues Projekt";
  /** Anfrage ohne Bauherr: Name ist dann der Bauort (Migration 0026); der Nachname von Bauherr 1 bleibt leer */
  const named = anfrageOhneBauherr(v, { today, company: companies.find((c) => c.id === v.companyId)?.name });
  const errors = validateNewProject(named, projects);
  const show = (k: keyof ProjectFormErrors) => (touched ? errors[k] : undefined);
  const markEdited = (keys: string[]) => draft && setEdited((old) => new Set([...old, ...keys]));
  const set = (patch: Partial<NewProject>) => {
    markEdited(Object.keys(patch));
    setV((old) => ({ ...old, ...patch }));
  };
  const salespeople = (data?.salespeople ?? []).filter((s) => s.companyId === v.companyId);
  const surveyors = [...new Set([...(data?.parties ?? []).filter((p) => p.role === "vermesser").map((p) => p.name), ...newSurveyors])].sort((a, b) => a.localeCompare(b, "de"));
  const company = companies.find((c) => c.id === v.companyId);
  // Anfragen bekommen eine eigene Nummer A-<Kürzel>-<Nummer> (Migration 0027), Projekte die ABM-Nr. des Nummernkreises
  const suggestion = v.kind === "neubau" ? suggestNummer(company, projects, v.status === "anfrage") : "";
  /** Firma gewählt: ist die ABM-Nr. leer (oder noch der letzte Vorschlag), wird die nächste Nummer der Firma eingetragen */
  const chooseCompany = (id: string) => {
    const next = companies.find((c) => c.id === id);
    const auto = !v.abmNr || v.abmNr === suggestion;
    set({ companyId: id || null, salespersonId: null, ...(auto ? { abmNr: suggestNummer(next, projects, v.status === "anfrage") || null } : {}) });
  };
  /** ABM-Nr. eingegeben: ist noch keine Firma gewählt, wird die Firma des Nummernkreises vorgeschlagen (änderbar) */
  const typeAbm = (value: string) => {
    const match = !v.companyId ? companyForAbm(value, companies) : null;
    set({ abmNr: value || null, ...(match ? { companyId: match.id, salespersonId: null } : {}) });
  };
  // Bauvoranfrage: weder ABM-Nr. noch Firma
  // Bundesland: solange nicht selbst gewählt, Vorschlag aus dem Bauort (Land oder PLZ beim Bauherrn, sonst PLZ im Bauort)
  const blSuggestion = suggestBundesland({ siteState: v.bauherr?.siteState, sitePostalCode: v.bauherr?.sitePostalCode, location: v.location });
  const bundesland = v.bundesland === undefined ? blSuggestion : v.bundesland;
  const effective: NewProject = {
    ...(v.kind === "bauvoranfrage" ? { ...named, abmNr: null, companyId: null, salespersonId: null } : named),
    bundesland: bundesland || null,
    // Der Nachname von Bauherr 1 ist der Projektname; der Name des Bauherrn wird beim Speichern aus beidem gebildet
    bauherr: { phone: null, email: null, address: null, buildingAddress: null, ...v.bauherr, nachname: v.bauherrLabel },
  };
  const missing = missingProjectInfo(infoStateOfNew(effective));
  const setContact = (patch: Partial<NonNullable<NewProject["bauherr"]>>) => {
    markEdited(Object.keys(patch).map(namensFormKey));
    setV((old) => {
      const before = { phone: null, email: null, address: null, buildingAddress: null, ...old.bauherr };
      const after = { ...before, ...patch };
      // Anschrift bzw. Bauadresse geändert: abgeleitete getrennte Felder (Planungsprotokoll) mitziehen
      return { ...old, bauherr: { ...after, ...folgeAnschrift(before, after) } };
    });
  };
  const weitere = weitereSichtbar(v.bauherr, weitereAngefordert);
  const similar = draft
    ? similarProjects({ bauherrLabel: v.bauherrLabel, buildingAddress: v.bauherr?.buildingAddress ?? null, flurstueck: v.flurstueck, gemarkung: v.gemarkung }, projects, data?.bauherren ?? [])
    : [];
  const formState = (): DraftFormState => ({ project: v, meta: {}, edited: [...edited], resolved: [...resolved] });
  const extractorEnv = { demo: repo.mode === "demo", call: repo.extractProject ? (r: Parameters<NonNullable<typeof repo.extractProject>>[0]) => repo.extractProject!(r) : undefined };
  const edge = extractorKind() === "edge" && repo.mode !== "demo";
  const running = docs.some((d) => d.phase === "wartet" || d.phase === "speichert" || d.phase === "liest") || mails.some((m) => m.phase === "liest");
  const stored = docs.filter((d) => d.fileId || d.legacy);
  /** Konflikte, für die noch niemand gewählt hat (und deren Feld nicht von Hand geändert wurde) */
  const openConflicts = (Object.keys(conflicts) as DraftFieldKey[]).filter((k) => !resolved.has(k) && !FORM_KEYS_OF[k].some((f) => edited.has(f)));
  // Weitere Seite des angezeigten Dokuments lesen: nur über den KI-Dienst und wenn das Dokument mehr Seiten hat als gelesen
  const canReadMore = Boolean(active?.draft && active.draft.extractor === "edge" && active.draft.textquelle === "bild" && pageCount > (active.draft.seiten?.gelesen.length ?? 1));
  const pageRead = Boolean(active?.draft?.seiten?.gelesen.includes(viewPage));

  async function createVia<T extends { id: string }>(fn: Parameters<typeof mutate<T>>[0]): Promise<string> {
    const res = await mutate(fn);
    if (!res.ok) throw new Error(res.error);
    return res.value.id;
  }

  /** Datei einer Kachel als File (für erneutes Auslesen). */
  const fileOf = (d: DocEntry) => (d.blob ? new File([d.blob], d.name, { type: d.type }) : null);

  /** Dateien hinzufügen: prüfen, speichern (legt den Entwurf an), je Datei auslesen. */
  async function addFiles(list: FileList | File[] | null | undefined) {
    const all = [...(list ?? [])];
    if (!all.length) return;
    setFileError(null);
    // Mails (.eml): Nachricht und Absender übernehmen, die Anhänge laufen wie hineingezogene Dokumente weiter
    const problems: string[] = [];
    const fromMails: File[] = [];
    for (const f of all.filter(isEmlFile)) {
      if (mailsRef.current.some((m) => m.file.name === f.name && m.file.size === f.size)) continue;
      try {
        const mail = await readEml(f);
        addMail(f, mail);
        fromMails.push(...mail.readable);
      } catch (e) {
        problems.push(`${f.name}: ${e instanceof Error ? e.message : "nicht gelesen"}`);
      }
    }
    for (const f of all.filter((x) => extension(x.name) === "msg")) problems.push(`${f.name}: Outlook-Format .msg wird nicht gelesen. Bitte die Mail als .eml speichern (z. B. im Browser-Postfach „Herunterladen“).`);
    if (problems.length) setFileError(problems.join(" "));
    // Dieselbe Datei nicht doppelt (z. B. dieselbe Mail nach dem Fortsetzen eines Entwurfs noch einmal hineingezogen)
    const files = [...all.filter((f) => !isEmlFile(f) && extension(f.name) !== "msg"), ...fromMails].filter((f) => !docsRef.current.some((d) => d.phase !== "abgelehnt" && d.name === f.name && d.size === f.size));
    if (!files.length) return;
    const jobs = files.map((f, i) => ({ ...initialJob(f, `${Date.now()}-${docs.length + i}`), blob: f as Blob }) as DocEntry);
    setDocs((old) => [...old, ...jobs]);
    if (!activeKey) setActiveKey(jobs.find((j) => j.phase !== "abgelehnt")?.key ?? null);
    const readable = jobs.filter((j) => j.phase !== "abgelehnt");
    if (!readable.length) return;
    const datei = (f: File) => ({ name: f.name, size: f.size, type: f.type });
    await readDocuments(
      readable.map((j) => files[jobs.indexOf(j)]),
      readable,
      {
        // die erste Datei legt den Entwurf an; die Oberfläche lädt erst am Ende neu (nicht nach jeder Datei)
        save: async (file) => {
          const res = await repo.addDraftFile({ draftId: savedRef.current, file: datei(file), blob: file, form: formState() });
          setSavedId(res.draft.id);
          return { fileId: res.file.id };
        },
        extract: (file, opts) => extractProjectFromDocument(file, extractorEnv, opts),
        record: (fileId, patch) => repo.updateDraftFile(fileId, patch),
        onUpdate: (state) => updateDoc(state.key, state),
      },
    );
    await reload();
  }

  /**
   * Mail übernehmen: Nachricht ins Feld "Nachricht des Verkäufers" (bei Anfragen), Eingangsmonat aus dem Sendedatum,
   * Hausbaufirma und Verkäufer aus dem Absender (nur wenn noch keine Firma gewählt ist). Gilt auch für das leere Formular,
   * damit die Prüfmaske die Werte beim Zusammenführen der Dokumente nicht wieder verwirft.
   */
  function addMail(file: File, mail: ParsedMail) {
    const match = matchSender({ name: mail.fromName, email: mail.fromEmail }, data?.salespeople ?? [], companies);
    const first = mailsRef.current.length === 0;
    const text = anfrageTextOf(mail);
    const day = mail.date ? berlinDay(mail.date) : null;
    const sender: MailEntry["sender"] = match && v.kind === "neubau" && !v.companyId ? (match.salespersonId ? "verkaeufer" : "firma") : null;
    const withMail = (old: NewProject): NewProject => {
      const next = { ...old };
      if (old.status === "anfrage" && !old.anfrageText?.includes(text)) next.anfrageText = old.anfrageText?.trim() ? `${old.anfrageText.trim()}\n\n---\n\n${text}` : text;
      if (first && day && day <= today) next.intakeMonth = monthStart(day);
      if (match && old.kind === "neubau" && !old.companyId) {
        next.companyId = match.companyId;
        next.salespersonId = match.salespersonId;
        if (!old.abmNr) next.abmNr = suggestNummer(companies.find((c) => c.id === match.companyId), projects, old.status === "anfrage") || null;
      }
      return next;
    };
    blank.current = withMail(blank.current);
    setV(withMail);
    const entry: MailEntry = { key: `mail-${Date.now()}-${mailsRef.current.length}`, file, mail, sender, match, phase: mail.text ? "liest" : "ohne", draft: null, error: null };
    mailsRef.current = [...mailsRef.current, entry];
    setMails(mailsRef.current);
    if (mail.text) void readMailText(entry);
  }

  function updateMail(key: string, patch: Partial<MailEntry>) {
    mailsRef.current = mailsRef.current.map((m) => (m.key === key ? { ...m, ...patch } : m));
    setMails(mailsRef.current);
  }

  /** Bauherr und Baugrundstück aus dem Mailtext (läuft neben der Auslesung der Anhänge). */
  async function readMailText(m: MailEntry) {
    try {
      const draft = await extractProjectFromMail({ file: m.file, mail: m.mail }, extractorEnv);
      updateMail(m.key, { phase: "fertig", draft, error: null });
    } catch (e) {
      updateMail(m.key, { phase: "fehler", error: e instanceof Error ? e.message : "Der Text ließ sich nicht auslesen." });
    }
  }

  /** Verkäufer aus dem Absender anlegen und wählen (Firma wurde am Absender erkannt, der Verkäufer fehlte). */
  const salesSuggestion = v.companyId && !v.salespersonId ? (mails.map((m) => m.match).find((x) => x?.newSalesperson && x.companyId === v.companyId)?.newSalesperson ?? null) : null;
  async function createSuggestedSalesperson(name: string) {
    try {
      const id = await createVia((r) => r.createSalesperson(v.companyId!, name));
      set({ salespersonId: id });
      toast(`Verkäufer ${name} angelegt`, "ok");
    } catch (e) {
      toast("Verkäufer nicht angelegt", "danger", e instanceof Error ? e.message : undefined);
    }
  }

  function removeMail(m: MailEntry) {
    mailsRef.current = mailsRef.current.filter((x) => x.key !== m.key);
    setMails(mailsRef.current);
  }

  /** Alle ausgelesenen Dokumente zusammenführen und die Prüfmaske füllen; selbst Geändertes bleibt stehen. */
  function toReview(list: DocEntry[] = docsRef.current) {
    const merged = mergeOf(list, mailsRef.current);
    const display = displayDraft(list, merged, mailsRef.current);
    const applied = applyDraft(display, blank.current, { companies });
    const form = draft ? preserveEdited(v, applied.form, edited) : applied.form;
    setDraft(display);
    setUnmatched(applied.unmatched);
    setV(form);
    setConflicts(merged.conflicts);
    // Vermesser sind keine Stammliste: der erkannte Name wird wählbar und erst mit dem Projekt gespeichert
    if (form.vermesser) setNewSurveyors((old) => [...new Set([...old, form.vermesser!])]);
    // Prüfmaske: leere Pflichtfelder sofort zeigen
    setTouched(true);
    setStep("form");
    if (savedRef.current) void repo.saveProjectDraft({ id: savedRef.current, draft: display, form: { ...formState(), project: form }, docType: list.find((d) => d.phase === "fertig")?.art ?? "sonstiges", file: display.datei }).catch(() => undefined);
  }

  /** Art einer Datei ändern: Schema der neuen Art anwenden (nicht Erlaubtes fällt weg), Ordner folgt der Art. */
  function changeArt(d: DocEntry, art: Vertragsart) {
    const next: DocEntry = { ...d, art, artTouched: true, draft: d.draft ? { ...d.draft, felder: restrictToType(d.draft.felder, art) } : null };
    const list = docsRef.current.map((x) => (x.key === d.key ? next : x));
    setDocs(list);
    if (d.fileId) void repo.updateDraftFile(d.fileId, { docType: art, ...(next.draft ? { draft: next.draft } : {}) }).catch(() => undefined);
    if (step === "form") toReview(list);
  }

  function changeMeta(d: DocEntry, k: keyof ContractMeta, value: string) {
    markEdited([`${d.key}.${k}`]);
    updateDoc(d.key, { meta: { ...d.meta, [k]: value } });
  }

  /**
   * Eine Datei (erneut) auslesen: mit der gewählten Art, oder nur eine weitere Seite (dann kommen nur bisher leere Felder
   * dazu). Zählt als weitere Auslesung.
   */
  async function reread(d: DocEntry, pages?: number[]) {
    const file = fileOf(d) ?? (d.fileId ? await repo.draftFileBlob(d.fileId).then((b) => (b ? new File([b], d.name, { type: d.type }) : null)) : null);
    if (!file) return toast("Datei nicht verfügbar", "danger", "Die Datei ließ sich nicht laden.");
    setReadingKey(d.key);
    try {
      const again = await extractProjectFromDocument(file, extractorEnv, { art: d.artTouched || d.draft ? d.art : undefined, draftFileId: d.fileId ?? undefined, pages });
      let next = again;
      if (pages && d.draft) {
        const felder = { ...d.draft.felder };
        for (const k of Object.keys(felder) as DraftFieldKey[]) if (!felder[k].wert && again.felder[k].wert) felder[k] = again.felder[k];
        next = { ...d.draft, felder, seiten: { gelesen: [...new Set([...(d.draft.seiten?.gelesen ?? []), ...(again.seiten?.gelesen ?? [])])], gesamt: again.seiten?.gesamt ?? d.draft.seiten?.gesamt ?? null } };
        const neu = (Object.keys(felder) as DraftFieldKey[]).filter((k) => !d.draft!.felder[k].wert && felder[k].wert).length;
        toast(neu ? `Seite ${pages.join(", ")} gelesen: ${neu} ${neu === 1 ? "Angabe" : "Angaben"} ergänzt` : `Auf Seite ${pages.join(", ")} kam nichts Neues dazu`, neu ? "ok" : undefined);
      }
      const art = (next.felder.vertragsart.wert as Vertragsart | null) ?? d.art;
      const meta = { ...metaOf(next), ...Object.fromEntries(Object.entries(d.meta).filter(([, x]) => x)) };
      const updated: DocEntry = { ...d, phase: "fertig", error: null, errorCode: null, draft: next, art, meta };
      const list = docsRef.current.map((x) => (x.key === d.key ? updated : x));
      setDocs(list);
      if (d.fileId) void repo.updateDraftFile(d.fileId, { status: "ausgelesen", error: null, draft: next, docType: art, meta }).catch(() => undefined);
      if (step === "form") toReview(list);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Die Datei ließ sich nicht auslesen.";
      if (!pages) updateDoc(d.key, { phase: "fehler", error: message, errorCode: e instanceof ExtractUnavailable ? e.code : null });
      toast(`${d.name} nicht ausgelesen`, "danger", message);
    }
    setReadingKey(null);
  }

  async function removeDoc(d: DocEntry) {
    if (d.fileId) {
      const res = await repo.removeDraftFile(d.fileId).then(() => null, (e: unknown) => (e instanceof Error ? e.message : "Fehler"));
      if (res) return toast("Datei nicht entfernt", "danger", res);
    }
    const list = docsRef.current.filter((x) => x.key !== d.key);
    setDocs(list);
    if (activeKey === d.key) setActiveKey(list.find((x) => x.phase !== "abgelehnt")?.key ?? null);
  }

  /** Wert aus einem der abweichenden Dokumente übernehmen. */
  function chooseConflict(key: DraftFieldKey, o: ConflictOption) {
    const patch = formPatchFor(key, o.wert, companies, v.bauherrLabel);
    setV((old) => ({ ...old, ...patch.project, bauherr: patch.bauherr ? { phone: null, email: null, address: null, buildingAddress: null, ...old.bauherr, ...patch.bauherr } : old.bauherr }));
    setUnmatched((old) => (key === "company" ? (patch.unmatchedCompany ? { company: patch.unmatchedCompany } : {}) : old));
    setDraft((old) => (old ? { ...old, felder: { ...old.felder, [key]: o.feld } } : old));
    setResolved((old) => new Set([...old, key]));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    void addFiles(e.dataTransfer.files);
  }

  /** Schließen mit offenem Entwurf: den Stand der Prüfmaske und die Angaben je Dokument sichern. */
  async function closeDialog() {
    if (savedId && stored.length && !busy && !running) {
      const merged = draft ?? displayDraft(docs, mergeOf(docs, mails), mails);
      for (const d of docs) if (d.fileId) await repo.updateDraftFile(d.fileId, { docType: d.art, meta: d.meta }).catch(() => undefined);
      const res = await mutate((r) => r.saveProjectDraft({ id: savedId, draft: merged, form: formState(), docType: docs.find((d) => d.phase === "fertig")?.art ?? "sonstiges", file: merged.datei }));
      const mailHint = mails.length ? " Die Mail selbst ist nicht im Entwurf gespeichert: beim Fortsetzen die .eml noch einmal hineinziehen, damit sie mit abgelegt wird." : "";
      if (res.ok) toast("Entwurf gespeichert", "ok", `${pilot ? "Weiter über die Projektliste: „Angefangene Projekte“." : "Weiter über die Prüfliste: „Neues Projekt vorgeschlagen“."}${mailHint}`);
    }
    onClose();
  }

  async function discardDraft() {
    if (savedId) {
      const res = await mutate((r) => r.discardProjectDraft(savedId));
      if (!res.ok) return toast(res.error, "danger");
      toast("Entwurf verworfen");
    }
    onClose();
  }

  /**
   * Alle Dateien im Projekt ablegen (auch die, deren Auslesung scheiterte) und den Entwurf abschließen.
   * Liefert die Fehlermeldungen je Datei.
   */
  async function fileInto(projectId: string): Promise<{ filed: string[]; errors: string[]; mailErrors: string[] }> {
    const filed: string[] = [];
    const errors: string[] = [];
    const mailErrors: string[] = [];
    for (const d of stored) {
      const res = await mutate((r) =>
        r.fileContract({ projectId, docType: d.art, meta: cleanMeta(d.meta), file: { name: d.name, size: d.size, type: d.type }, blob: d.blob ?? undefined, draftId: d.legacy ? savedId : null, draftFileId: d.fileId }),
      );
      if (res.ok) filed.push(`${d.name} als ${VERTRAGSART_LABEL[d.art]}`);
      else errors.push(`${d.name}: ${res.error}`);
    }
    if (!errors.length && savedId && !stored.some((d) => d.legacy)) {
      const res = await mutate((r) => r.completeProjectDraft(savedId, projectId));
      if (!res.ok) errors.push(res.error);
    }
    // Mails und ihre nicht auslesbaren Anhänge: in den Schriftverkehr mit der Hausbaufirma (nicht Teil des Entwurfs)
    const extra = mails.flatMap((m) => [m.file, ...m.mail.other]);
    for (const f of extra) {
      const res = await mutate((r) => r.uploadDocument({ projectId, folderPath: MAIL_FOLDER, file: { name: f.name, size: f.size, type: f.type }, blob: f }));
      if (!res.ok) mailErrors.push(`${f.name}: ${res.error}`);
    }
    const mailsFiled = extra.length - mailErrors.length;
    if (mailsFiled > 0) filed.push(`${mailsFiled === 1 ? "eine Datei" : `${mailsFiled} Dateien`} aus der Mail im Schriftverkehr mit der Hausbaufirma`);
    return { filed, errors, mailErrors };
  }

  /** Mail nicht abgelegt: die Datei ist nur im Dialog, also von Hand im Projekt hochladen. */
  function toastMailErrors(mailErrors: string[]) {
    if (mailErrors.length)
      toast(
        mailErrors.length === 1 ? "Eine Datei aus der Mail nicht abgelegt" : `${mailErrors.length} Dateien aus der Mail nicht abgelegt`,
        "danger",
        `${mailErrors.join(" ")} Bitte im Projekt unter Dokumente in „${MAIL_FOLDER}“ hochladen.`,
      );
  }

  async function createProject() {
    setBusy(true);
    const res = await mutate((r) => r.createProject(effective));
    if (!res.ok) {
      setBusy(false);
      setStep("form");
      return setServerError(res.error);
    }
    const notes = [v.createFolders ? "Projektordner aus der Vorlage angelegt." : "Ohne Projektordner angelegt."];
    // Beteiligte, die das Formular nicht kennt: Kellerbauer „Bauseits“ laut Werkvertrag, Kontakt des Vermessers
    const beteiligte = beteiligteNachAnlage(draft, effective.vermesser);
    if (beteiligte) {
      const extra = await mutate((r) => r.updateProject(res.value.id, { parties: beteiligte }));
      if (!extra.ok) notes.push(`Beteiligte nicht ergänzt: ${extra.error}`);
      else if (beteiligte.kellerbauer) notes.push(`Kellerbauer: „${KELLER_BAUSEITS}“ (laut Werkvertrag).`);
    }
    if (missing.length && !pilot) notes.push(`Aufgabe angelegt: ${missing.length === 1 ? "eine Angabe" : `${missing.length} Angaben`} nachfragen.`);
    const { filed, errors: filingErrors, mailErrors } = await fileInto(res.value.id);
    setBusy(false);
    toastMailErrors(mailErrors);
    if (filed.length) notes.push(`Abgelegt: ${filed.join(", ")}.`);
    toast(`${noun} ${res.value.bauherrLabel} angelegt`, "ok", notes.join(" "));
    if (filingErrors.length)
      toast(
        filingErrors.length === 1 ? "Ein Dokument nicht abgelegt" : `${filingErrors.length} Dokumente nicht abgelegt`,
        "danger",
        `${filingErrors.join(" ")} Der Entwurf bleibt ${pilot ? "in der Projektliste unter „Angefangene Projekte“" : "in der Prüfliste"}; von dort lässt sich das Dokument dem Projekt hinzufügen.`,
      );
    onClose();
    navigate(`/projekte/${res.value.id}`);
  }

  /** Duplikat: kein neues Projekt, die Dokumente kommen zum bestehenden. */
  async function addToExisting(p: Project) {
    setBusy(true);
    const { filed, errors: filingErrors, mailErrors } = await fileInto(p.id);
    setBusy(false);
    if (filingErrors.length) return setServerError(filingErrors.join(" "));
    toastMailErrors(mailErrors);
    toast(`${filed.length === 1 ? "Dokument" : "Dokumente"} zu ${projectTitle(p)} hinzugefügt`, "ok", `${filed.join(", ")} abgelegt. Es wurde kein neues Projekt angelegt.`);
    onClose();
    navigate(`/projekte/${p.id}?tab=dokumente`);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (openConflicts.length) {
      setServerError(`Bitte zuerst wählen, welcher Wert gilt: ${openConflicts.map((k) => CONFLICT_LABEL[k]).join(", ")} (abweichende Angaben in den Dokumenten).`);
      setTimeout(() => document.querySelector<HTMLElement>("#new-project .conflict-option")?.focus(), 0);
      return;
    }
    if (Object.keys(errors).length) {
      // ersten fehlerhaften Wert fokussieren (nach dem Rendern, erst dann trägt das Feld aria-invalid)
      setTimeout(() => document.querySelector<HTMLElement>("#new-project [aria-invalid=true]")?.focus(), 0);
      return;
    }
    // Duplikatprüfung vor dem Speichern: der Mensch entscheidet
    if (similar.length) return setStep("duplicates");
    void createProject();
  }

  // Feste Funktionen für den Dialog: er setzt den Fokus neu, sobald sich onClose ändert. Eine bei jedem Rendern neue
  // Funktion würde den Fokus beim Tippen ins erste Feld zurückwerfen.
  const closeRef = useRef(closeDialog);
  closeRef.current = closeDialog;
  const closeStable = useCallback(() => void closeRef.current(), []);
  const backToForm = useCallback(() => setStep("form"), []);

  const invalid = (k: keyof ProjectFormErrors) => (show(k) ? { "aria-invalid": true as const, "aria-describedby": `np-err-${k}` } : {});
  const Err = ({ k }: { k: keyof ProjectFormErrors }) =>
    show(k) ? (
      <span className="field-error" id={`np-err-${k}`} role="alert">
        {show(k)}
      </span>
    ) : null;

  const docName = (id: string | undefined) => docs.find((d) => d.fileId === id || d.key === id)?.name ?? null;
  const sameType = (art: Vertragsart | undefined) => docs.filter((d) => d.phase === "fertig" && d.art === art).length;

  /**
   * Herkunft und Sicherheit eines vorbefüllten Felds, bei mehreren Dokumenten mit Quelle ("aus Werkvertrag").
   * Hervorgehoben (gelb) wird bei niedriger Sicherheit und, bei Scans und Handschrift, immer bei Telefon und E-Mail,
   * jeweils bis der Mensch das Feld geändert hat. Abweichende Werte: Auswahl mit beiden Quellen.
   */
  const Src = ({ k }: { k: FormKey }) => {
    if (!draft) return null;
    const key = FORM_SOURCE[k];
    const f = draft.felder[key];
    const options = conflicts[key];
    const changed = edited.has(k === "companyId" ? "companyId" : k);
    if (options && !changed) {
      const done = resolved.has(key);
      return (
        <span className="field-conflict" role="group" aria-label={`Abweichende Werte für ${CONFLICT_LABEL[key]}`} data-open={!done || undefined}>
          <span className="field-conflict-title">{done ? "Gewählt aus abweichenden Werten:" : "Abweichende Werte in den Dokumenten, bitte wählen:"}</span>
          {options.map((o) => (
            <button
              key={o.dokumentId}
              type="button"
              className="conflict-option"
              aria-pressed={done && f.wert === o.wert}
              onClick={() => chooseConflict(key, o)}
              title={o.feld.quelle?.text ? `${o.feld.quelle.seite ? `S. ${o.feld.quelle.seite}: ` : ""}„${o.feld.quelle.text}“` : undefined}
            >
              „{o.wert}“ <span className="muted">{isMailSource(o.dokumentId) ? "aus der Mail" : sourceLabel(o.art, docName(o.dokumentId), sameType(o.art))}</span>
            </button>
          ))}
        </span>
      );
    }
    const notFound = k === "companyId" ? unmatched.company : undefined;
    if (!f.wert) return null;
    const mustCheck = draft.gescannt && ALWAYS_CHECK.includes(k);
    const level: Sicherheit = notFound ? "niedrig" : f.sicherheit;
    const flag = level === "niedrig" || mustCheck;
    // Klick auf die Textstelle zeigt das Dokument und springt in der Vorschau auf ihre Seite
    const fromDoc = isMailSource(f.quelle?.dokumentId)
      ? "aus der Mail · "
      : f.quelle?.dokumentArt && docs.length + mails.length > 1
        ? `${sourceLabel(f.quelle.dokumentArt, docName(f.quelle.dokumentId), sameType(f.quelle.dokumentArt))} · `
        : "";
    const sourceKey = docs.find((d) => d.fileId === f.quelle?.dokumentId || d.key === f.quelle?.dokumentId)?.key ?? null;
    const jump = sourcePage(f.quelle?.seite, sourceKey && sourceKey !== active?.key ? Number.MAX_SAFE_INTEGER : pageCount);
    const text = `${fromDoc}${notFound ? `Im Dokument: „${notFound}“, nicht in den Stammdaten. ` : ""}${f.quelle?.text ? `${f.quelle.seite ? `S. ${f.quelle.seite}: ` : ""}„${f.quelle.text}“` : "ohne Textstelle"}`;
    return (
      <span className="field-src" data-check={flag && !changed ? true : undefined}>
        <Pill tone={changed ? "neutral" : flag ? "warn" : SICHERHEIT_TONE[level]}>{changed ? "geändert" : mustCheck ? `bitte kontrollieren · ${SICHERHEIT_LABEL[level]}` : `Sicherheit ${SICHERHEIT_LABEL[level]}`}</Pill>
        {jump ? (
          <button
            type="button"
            className="field-src-text field-src-jump"
            title={`Seite ${jump} in der Vorschau zeigen: ${f.quelle?.text ?? ""}`}
            onClick={() => {
              if (sourceKey) setActiveKey(sourceKey);
              setViewPage(jump);
            }}
          >
            {text}
          </button>
        ) : (
          <span className="field-src-text" title={f.quelle?.text}>
            {text}
          </span>
        )}
      </span>
    );
  };

  if (step === "start") {
    // Mit Mail geht es auch ohne auslesbaren Anhang weiter (dann das Formular mit der übernommenen Nachricht)
    const ready = (stored.length > 0 || mails.length > 0) && !running;
    const next = () => (stored.length || mails.some((m) => m.draft) ? toReview() : setStep("form"));
    return (
      <Dialog
        title={dialogTitle}
        wide
        keepOpenOnOutsideClick
        onClose={closeStable}
        footer={
          <>
            <Button onClick={() => void closeDialog()} disabled={running}>
              {savedId && stored.length ? "Später weitermachen" : "Abbrechen"}
            </Button>
            {(docs.length > 0 || mails.length > 0) && (
              <Button variant="primary" onClick={next} disabled={!ready}>
                {running ? "Wird gelesen …" : `Weiter zur Prüfung${stored.length > 1 ? ` (${stored.length} Dokumente)` : ""}`}
              </Button>
            )}
          </>
        }
      >
        <div className="contract-start" data-has-files={docs.length > 0 || mails.length > 0 || undefined}>
          <div
            className="contract-drop"
            data-drop={dropActive}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={onDrop}
          >
            <FileUp size={28} aria-hidden />
            <p className="contract-drop-title">
              {docs.length || mails.length ? "Weitere Dokumente hierher ziehen oder auswählen" : isRequest ? "Anfrage-Mail (.eml) oder Dokumente hierher ziehen" : "Dokumente hierher ziehen oder auswählen"}
            </p>
            <p className="muted">
              {isRequest
                ? "Am einfachsten die Mail des Verkäufers als .eml: die App übernimmt die Nachricht, erkennt Firma und Verkäufer am Absender und liest die Anhänge aus. "
                : "Zum Beispiel Werkvertrag und Vermesservertrag zusammen, oder eine Mail (.eml) mit Anhängen. "}
              PDF, DOCX oder Bild, höchstens 30 MB je Datei. Jede Datei wird gespeichert und einzeln ausgelesen; die App füllt die Felder vor, du prüfst und
              bestätigst.
              {edge && " Zum Auslesen gehen je Dokument die ersten zwei Seiten als Bild an den KI-Dienst; jedes Dokument zählt einzeln gegen das Tageslimit."}
            </p>
            <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={running}>
              Dateien auswählen
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept={`${CONTRACT_ACCEPT},${MAIL_ACCEPT}`}
              multiple
              hidden
              aria-label="Dokumente auswählen"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <MailList mails={mails} request={isRequest} onRemove={removeMail} />
          <UploadList docs={docs} onArt={changeArt} onRemove={(d) => void removeDoc(d)} onRetry={(d) => void reread(d)} />
          {fileError && (
            <p className="form-error" role="alert">
              {fileError}
            </p>
          )}
          {repo.mode === "demo" && (
            <p className="contract-samples">
              Zum Ausprobieren (erfundene Beispiele):{" "}
              <button type="button" className="hint-action" onClick={() => void addFiles([demoAnfrageEml()])} disabled={running}>
                Anfrage-Mail vom Verkäufer (.eml)
              </button>{" "}
              ·{" "}
              <button type="button" className="hint-action" onClick={async () => void addFiles([await scanWerkvertragFile(), vermesservertragFile()])} disabled={running}>
                Werkvertrag und Vermesservertrag
              </button>{" "}
              ·{" "}
              <button type="button" className="hint-action" onClick={async () => void addFiles([await scanWerkvertragFile()])} disabled={running}>
                gescannter Werkvertrag
              </button>{" "}
              ·{" "}
              <button type="button" className="hint-action" onClick={() => void addFiles([vorlageVermessungFile()])} disabled={running}>
                leere Vorlage Vermessungsauftrag
              </button>
            </p>
          )}
          {!docs.length && !mails.length && (
            <button type="button" className="hint-action contract-manual" onClick={() => setStep("form")}>
              Ohne Dokument manuell anlegen
            </button>
          )}
        </div>
      </Dialog>
    );
  }

  if (step === "duplicates") {
    return (
      <Dialog
        title="Gibt es dieses Projekt schon?"
        wide
        keepOpenOnOutsideClick
        onClose={backToForm}
        footer={
          <>
            <Button onClick={backToForm} disabled={busy}>
              Zurück zur Prüfung
            </Button>
            <Button variant="primary" onClick={() => void createProject()} disabled={busy}>
              {busy ? "Wird angelegt …" : "Trotzdem neu anlegen"}
            </Button>
          </>
        }
      >
        <div className="dialog-form">
          <p>
            {similar.length === 1 ? "Ein ähnliches Projekt gibt es schon." : `${similar.length} ähnliche Projekte gibt es schon.`} Du kannst das Dokument einem davon hinzufügen (es entsteht kein neues Projekt) oder trotzdem ein neues
            anlegen.
          </p>
          <ul className="dup-list">
            {similar.map((x) => (
              <li key={x.project.id}>
                <span className="dup-main">
                  <Link to={`/projekte/${x.project.id}`} target="_blank" rel="noreferrer" className="dup-title">
                    {projectTitle(x.project)}
                  </Link>
                  <span className="muted">
                    {x.gruende.map((g) => SIMILAR_LABEL[g]).join(", ")}
                    {x.project.location ? ` · ${x.project.location}` : ""}
                    {x.project.status !== "aktiv" ? ` · ${x.project.status}` : ""}
                  </span>
                </span>
                <Button size="sm" onClick={() => void addToExisting(x.project)} disabled={busy}>
                  Zu bestehendem Projekt hinzufügen
                </Button>
              </li>
            ))}
          </ul>
          {serverError && (
            <p className="form-error" role="alert">
              {serverError}
            </p>
          )}
        </div>
      </Dialog>
    );
  }


  return (
    <Dialog
      title={draft ? `${dialogTitle} prüfen` : dialogTitle}
      wide={!draft || !active}
      xwide={Boolean(draft && active)}
      keepOpenOnOutsideClick
      onClose={closeStable}
      footer={
        <>
          {draft && savedId && (
            <Button variant="ghost" className="dialog-foot-left" onClick={() => void discardDraft()} disabled={busy}>
              Entwurf verwerfen
            </Button>
          )}
          <Button onClick={() => void closeDialog()} disabled={busy}>
            {draft && savedId ? "Später weitermachen" : "Abbrechen"}
          </Button>
          <Button variant="primary" type="submit" form="new-project" disabled={busy}>
            {busy ? "Wird angelegt …" : draft ? "Bestätigen und anlegen" : `${noun} anlegen`}
          </Button>
        </>
      }
    >
      <div className={draft && active ? "review-layout" : undefined}>
        {draft && active && (
          <aside className="review-doc" aria-label="Dokument">
            {docs.filter((d) => d.phase !== "abgelehnt").length > 1 && (
              <div className="draft-doc-tabs" role="tablist" aria-label="Dokumente">
                {docs
                  .filter((d) => d.phase !== "abgelehnt")
                  .map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      role="tab"
                      aria-selected={d.key === active.key}
                      className="draft-doc-tab"
                      title={d.name}
                      onClick={() => {
                        setActiveKey(d.key);
                        setViewPage(1);
                      }}
                    >
                      {VERTRAGSART_LABEL[d.art]}
                    </button>
                  ))}
              </div>
            )}
            <div className="contract-file">
              <FileText size={18} aria-hidden />
              <span className="contract-file-name" title={active.name}>
                {active.name}
              </span>
              <span className="muted">{formatBytes(active.size)}</span>
            </div>
            <DocumentPreview key={active.key} file={active.blob} kind={KIND_OF(active.name, active.type)} page={viewPage} onPage={setViewPage} onPageCount={setPageCount} />
            {canReadMore && (
              <div className="review-plan">
                <Field
                  label="Angaben auf einer weiteren Seite? Hinblättern und lesen"
                  htmlFor="np-plan"
                  hint={`${pagesText(active) ?? ""}. Sendet genau diese eine Seite zusätzlich als Bild an den KI-Dienst (zählt als weitere Auslesung); ergänzt nur leere Felder, z. B. den Haustyp von der Plan-Seite.`}
                >
                  <span className="review-plan-row">
                    <Input
                      id="np-plan"
                      type="number"
                      min={1}
                      max={pageCount}
                      value={viewPage}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= pageCount) setViewPage(n);
                      }}
                      aria-label="Angezeigte Seite"
                    />
                    <Button size="sm" onClick={() => void reread(active, [viewPage])} disabled={busy || readingKey !== null || pageRead}>
                      {pageRead ? "Seite schon gelesen" : "Diese Seite lesen"}
                    </Button>
                    {readingKey === active.key && <AiSpinner size="sm" label="KI liest …" />}
                  </span>
                </Field>
              </div>
            )}
          </aside>
        )}

        <form id="new-project" className="dialog-form" data-review={draft ? true : undefined} onSubmit={submit} noValidate>
          {draft && (
            <section className="contract-summary" aria-label="Hinweise zu den Dokumenten">
              <p className="muted">
                {draft.textquelle === "ohne"
                  ? "Ohne Vorschläge aus den Dokumenten."
                  : mails.some((m) => m.draft)
                    ? stored.length
                      ? `Vorschläge aus ${stored.length === 1 ? "dem Dokument" : `${stored.length} Dokumenten`} und dem Mailtext, je Feld mit Quelle.`
                      : "Vorschläge aus dem Mailtext."
                    : stored.length > 1
                      ? `Vorschläge aus ${stored.length} Dokumenten, je Feld mit Quelle.`
                      : "Vorschläge aus dem Dokument."} Bitte jedes Feld prüfen;
                gelb markierte Felder sind unsicher{draft.gescannt ? ", Telefon und E-Mail bei Scans immer" : ""}. {isRequest ? "Pflichtfelder gibt es bei Anfragen keine." : "Pflicht ist nur der Bauherr."}
              </p>
              {openConflicts.length > 0 && (
                <p className="form-note" role="status">
                  {openConflicts.length === 1 ? "Ein Feld weicht" : `${openConflicts.length} Felder weichen`} zwischen den Dokumenten ab ({openConflicts.map((k) => CONFLICT_LABEL[k]).join(", ")}). Bitte am Feld wählen, welcher Wert gilt.
                </p>
              )}
              {draft.hinweise.map((h) => (
                <p key={h} className="form-note">
                  {h}
                </p>
              ))}
            </section>
          )}

          {similar.length > 0 && (
            <p className="form-note" role="status">
              {similar.length === 1 ? "Ein ähnliches Projekt gibt es schon" : `${similar.length} ähnliche Projekte gibt es schon`} ({similar
                .slice(0, 3)
                .map((x) => projectTitle(x.project))
                .join(", ")}
              {similar.length > 3 ? " …" : ""}). Vor dem Anlegen kannst du wählen, ob das Dokument dorthin soll.
            </p>
          )}

          {mails.length > 0 && (
            <p className="form-note" role="status">
              {mails.length === 1 ? `Aus der Mail „${mails[0].mail.subject ?? mails[0].file.name}“` : `Aus ${mails.length} Mails`} übernommen:{" "}
              {[isRequest && "Nachricht", "Eingangsmonat", mails.some((m) => m.sender) && "Hausbaufirma am Absender", mails.some((m) => m.draft && mailFound(m).length) && "Angaben aus dem Text (je Feld mit Quelle)"].filter(Boolean).join(", ")}. Beim Anlegen
              kommt die Mail{mails.some((m) => m.mail.other.length) ? " mit den übrigen Anhängen" : ""} in „{MAIL_FOLDER}“.
            </p>
          )}

          {isRequest && (
            <Field label="Nachricht des Verkäufers" htmlFor="np-anfrage" hint={mails.length ? "Aus der Mail übernommen, änderbar." : "Zum Beispiel die Mail mit den Terminvorschlägen hier einfügen oder oben die .eml hineinziehen. Optional."}>
              <textarea id="np-anfrage" className="input textarea" rows={6} value={v.anfrageText ?? ""} onChange={(e) => set({ anfrageText: e.target.value || null })} />
            </Field>
          )}

          <div className="dialog-row">
            <Field label="Art" htmlFor="np-kind">
              <Select
                id="np-kind"
                value={v.kind}
                onChange={(e) => set({ kind: e.target.value as Project["kind"] })}
                options={[
                  { value: "neubau", label: "Neubau" },
                  { value: "bauvoranfrage", label: "Bauvoranfrage" },
                ]}
              />
            </Field>
            <Field label="Eingangsmonat" htmlFor="np-month">
              <Input
                id="np-month"
                type="month"
                value={v.intakeMonth?.slice(0, 7) ?? ""}
                max={today.slice(0, 7)}
                onChange={(e) => set({ intakeMonth: e.target.value ? `${e.target.value}-01` : null })}
                {...invalid("intakeMonth")}
              />
              <Err k="intakeMonth" />
            </Field>
          </div>

          <fieldset className="form-group">
            <legend>Bauherren</legend>
            <div className="bauherr-block" role="group" aria-labelledby="np-bh1">
              <h3 className="bauherr-titel" id="np-bh1">
                Bauherr 1
              </h3>
              <div className="dialog-row">
                <Field label="Vorname" htmlFor="np-vorname">
                  <Input id="np-vorname" value={v.bauherr?.vorname ?? ""} onChange={(e) => setContact({ vorname: e.target.value || null })} placeholder="z. B. Jonas" autoFocus={!draft} autoComplete="off" />
                  <Src k="bauherrName" />
                </Field>
                <Field
                  label={isRequest ? "Nachname" : "Nachname *"}
                  htmlFor="np-bauherr"
                  hint={
                    show("bauherrLabel")
                      ? undefined
                      : named.bauherrOffen
                        ? `Freiwillig. Leer gelassen heißt die Anfrage „${named.bauherrLabel}“, bis der Bauherr feststeht.`
                        : "Wird zum Projektnamen."
                  }
                >
                  <Input id="np-bauherr" value={v.bauherrLabel} onChange={(e) => set({ bauherrLabel: e.target.value })} placeholder="z. B. Hoffmann" autoComplete="off" {...invalid("bauherrLabel")} />
                  <Err k="bauherrLabel" />
                  <Src k="bauherrLabel" />
                </Field>
              </div>
              <div className="dialog-row">
                <Field label="Telefon" htmlFor="np-tel">
                  <Input id="np-tel" type="tel" value={v.bauherr?.phone ?? ""} onChange={(e) => setContact({ phone: e.target.value || null })} autoComplete="off" />
                  <Src k="phone" />
                </Field>
                <Field label="E-Mail" htmlFor="np-mail">
                  <Input id="np-mail" type="email" value={v.bauherr?.email ?? ""} onChange={(e) => setContact({ email: e.target.value || null })} autoComplete="off" {...invalid("email")} />
                  <Err k="email" />
                  <Src k="email" />
                </Field>
              </div>
            </div>
            {WEITERE_BAUHERREN.slice(0, weitere).map((b) => (
              <div key={b.nr} className="bauherr-block" role="group" aria-labelledby={`np-bh${b.nr}`}>
                <h3 className="bauherr-titel" id={`np-bh${b.nr}`}>
                  {b.label}
                </h3>
                <div className="dialog-row">
                  <Field label="Vorname" htmlFor={`np-vorname${b.nr}`}>
                    <Input id={`np-vorname${b.nr}`} value={v.bauherr?.[b.vorname] ?? ""} onChange={(e) => setContact({ [b.vorname]: e.target.value || null })} autoComplete="off" />
                  </Field>
                  <Field label="Nachname" htmlFor={`np-nachname${b.nr}`}>
                    <Input id={`np-nachname${b.nr}`} value={v.bauherr?.[b.nachname] ?? ""} onChange={(e) => setContact({ [b.nachname]: e.target.value || null })} autoComplete="off" />
                    {b.nr === 2 && <Src k="name2" />}
                  </Field>
                </div>
                <div className="dialog-row">
                  <Field label="Telefon" htmlFor={`np-tel${b.nr}`}>
                    <Input id={`np-tel${b.nr}`} type="tel" value={v.bauherr?.[b.phone] ?? ""} onChange={(e) => setContact({ [b.phone]: e.target.value || null })} autoComplete="off" />
                    {b.nr === 2 && <Src k="phone2" />}
                  </Field>
                  <Field label="E-Mail" htmlFor={`np-mail${b.nr}`}>
                    <Input id={`np-mail${b.nr}`} type="email" value={v.bauherr?.[b.email] ?? ""} onChange={(e) => setContact({ [b.email]: e.target.value || null })} autoComplete="off" />
                    {b.nr === 2 && <Src k="email2" />}
                  </Field>
                </div>
              </div>
            ))}
            {weitere < WEITERE_BAUHERREN.length && (
              <button type="button" className="hint-action form-more" onClick={() => setWeitereAngefordert(weitere + 1)}>
                {WEITERE_BAUHERREN[weitere].hinzufuegen}
              </button>
            )}
          </fieldset>

          {v.kind === "neubau" && (
            <div className="dialog-row">
              <Field label="Hausbaufirma" htmlFor="np-company">
                <SelectOrCreate
                  id="np-company"
                  value={v.companyId ?? ""}
                  emptyLabel="Noch offen"
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  // Firma gewechselt: der Verkäufer passt sonst nicht mehr; die ABM-Nr. folgt dem Nummernkreis
                  onChange={chooseCompany}
                  onCreate={(name) => createVia((r) => r.createCompany(name))}
                  canCreate={canCreate}
                  createPlaceholder="Name der Hausbaufirma"
                />
                <Src k="companyId" />
              </Field>
              <Field label="Verkäufer" htmlFor="np-sales">
                <SelectOrCreate
                  id="np-sales"
                  value={v.salespersonId ?? ""}
                  emptyLabel={v.companyId ? "Noch offen" : "Erst Hausbaufirma wählen"}
                  disabled={!v.companyId}
                  options={salespeople.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(id) => set({ salespersonId: id || null })}
                  onCreate={(name) => createVia((r) => r.createSalesperson(v.companyId!, name))}
                  canCreate={canCreate}
                  createPlaceholder="Name des Verkäufers"
                />
                {salesSuggestion && canCreate && (
                  <span className="field-hint">
                    Absender der Mail:{" "}
                    <button type="button" className="hint-action" onClick={() => void createSuggestedSalesperson(salesSuggestion)}>
                      „{salesSuggestion}“ als Verkäufer anlegen
                    </button>
                  </span>
                )}
              </Field>
            </div>
          )}

          <div className="dialog-row">
            {v.kind === "neubau" && (
              <Field label={isRequest ? "Anfrage-Nr." : "ABM-Nr."} htmlFor="np-abm">
                <Input
                  id="np-abm"
                  value={v.abmNr ?? ""}
                  onChange={(e) => typeAbm(e.target.value)}
                  placeholder={isRequest ? "z. B. A-SH-12" : "z. B. 8161-1588"}
                  inputMode={isRequest ? "text" : "numeric"}
                  autoComplete="off"
                  {...invalid("abmNr")}
                />
                <Err k="abmNr" />
                <AbmHinweise abmNr={v.abmNr} companyId={v.companyId} companies={companies} onUseCompany={(c) => chooseCompany(c.id)} />
                {!show("abmNr") && (!v.abmNr || v.abmNr === suggestion) && (
                  <span className="field-hint">
                    {v.abmNr
                      ? `Vorschlag: nächste freie ${isRequest ? "Anfrage-Nummer" : "Nummer"} dieser Hausbaufirma, änderbar.`
                      : isRequest && company && !company.kuerzel
                        ? `Für ${company.name} ist noch kein Kürzel eingetragen (Einstellungen, Hausbaufirmen). Optional, lässt sich nachtragen.`
                        : "Optional, lässt sich nachtragen."}
                    {suggestion && !v.abmNr && (
                      <>
                        {" "}
                        <button type="button" className="hint-action" onClick={() => set({ abmNr: suggestion })}>
                          Nächste freie Nummer {suggestion} übernehmen
                        </button>
                      </>
                    )}
                  </span>
                )}
              </Field>
            )}
            <Field label="Hausbau-Nr." htmlFor="np-hb" hint={show("hausbauNr") ? undefined : "Auftragsnummer der Hausbaufirma, optional."}>
              <Input id="np-hb" value={v.hausbauNr ?? ""} onChange={(e) => set({ hausbauNr: e.target.value || null })} placeholder="HB-26118" {...invalid("hausbauNr")} />
              <Err k="hausbauNr" />
            </Field>
          </div>

          <div className="dialog-row">
            <Field label="Bauort" htmlFor="np-ort">
              <Input id="np-ort" value={v.location ?? ""} onChange={(e) => set({ location: e.target.value || null })} placeholder="z. B. Ulm" />
              <Src k="location" />
            </Field>
            <Field label="Bundesland" htmlFor="np-bl" hint={v.bundesland === undefined && blSuggestion ? "Vorschlag aus der PLZ bzw. dem Land des Bauorts, änderbar." : "Optional."}>
              <BundeslandSelect id="np-bl" value={bundesland ?? ""} onChange={(x) => set({ bundesland: x })} />
            </Field>
          </div>

          <BaubegleitungField name="np-baubegleitung" value={v.baubegleitung ?? true} onChange={(baubegleitung) => set({ baubegleitung })} />

          <div className="dialog-row">
            <Field label="Architekt" htmlFor="np-arch">
              <SelectOrCreate
                id="np-arch"
                value={v.architectId ?? ""}
                emptyLabel="Noch offen"
                options={architects.map((t) => ({ value: t.id, label: t.code ? `${t.code} (${t.name})` : t.name }))}
                onChange={(id) => set({ architectId: id || null })}
                onCreate={(name) => createVia((r) => r.createTeamMember(name, "architekt"))}
                canCreate={canCreate}
                createPlaceholder="Name des Architekten"
              />
            </Field>
            <Field label="Planer" htmlFor="np-planer">
              <Select id="np-planer" value={v.planerId ?? ""} onChange={(e) => set({ planerId: e.target.value || null })} options={[{ value: "", label: "Noch offen" }, ...planers.map((t) => ({ value: t.id, label: t.name }))]} />
            </Field>
          </div>

          <div className="dialog-row">
            <Field label="Vermesser" htmlFor="np-vermesser">
              <SelectOrCreate
                id="np-vermesser"
                value={v.vermesser ?? ""}
                emptyLabel="Noch offen"
                options={surveyors.map((n) => ({ value: n, label: n }))}
                onChange={(name) => set({ vermesser: name || null })}
                // Vermesser sind Projektbeteiligte, keine eigene Stammliste: der Name wird mit dem Projekt gespeichert
                onCreate={async (name) => {
                  setNewSurveyors((old) => [...old, name]);
                  return name;
                }}
                canCreate={canCreate}
                createPlaceholder="Name des Vermessungsbüros"
              />
              <Src k="vermesser" />
            </Field>
            <Field label="Bauadresse" htmlFor="np-bauadresse">
              <Input id="np-bauadresse" value={v.bauherr?.buildingAddress ?? ""} onChange={(e) => setContact({ buildingAddress: e.target.value || null })} placeholder="Straße, PLZ Ort oder Flurstück" autoComplete="off" />
              <Src k="buildingAddress" />
              {draft && !v.bauherr?.buildingAddress && stored.length > 0 && stored.every((d) => d.art === "werkvertrag") && <span className="field-hint">{NO_SITE_HINT}</span>}
            </Field>
          </div>

          <div className="dialog-row">
            <Field label="Flurstück" htmlFor="np-flst">
              <Input id="np-flst" value={v.flurstueck ?? ""} onChange={(e) => set({ flurstueck: e.target.value || null })} placeholder="z. B. 412/3" autoComplete="off" />
              <Src k="flurstueck" />
            </Field>
            <Field label="Gemarkung" htmlFor="np-gemarkung">
              <Input id="np-gemarkung" value={v.gemarkung ?? ""} onChange={(e) => set({ gemarkung: e.target.value || null })} placeholder="z. B. Blaustein" autoComplete="off" />
              <Src k="gemarkung" />
            </Field>
          </div>

          <fieldset className="form-group">
            <legend>Anschrift Bauherr</legend>
            <Field label="Wohnanschrift (Bauherr 1)" htmlFor="np-anschrift">
              <Input id="np-anschrift" value={v.bauherr?.address ?? ""} onChange={(e) => setContact({ address: e.target.value || null })} placeholder="Straße, PLZ Ort" autoComplete="off" />
              <Src k="address" />
            </Field>
            <details className="form-details" open={Boolean(v.bauherr?.street || v.bauherr?.siteStreet || v.bauherr?.siteDistrict || v.bauherr?.mobile || v.flur) || undefined}>
              <summary>Anschrift und Bauort getrennt (fürs Planungsprotokoll, optional)</summary>
              <p className="field-hint">Aus den Zeilen oben aufgeteilt, wenn sie die Form „Straße, PLZ Ort“ haben. Leere Felder ergänzt das Protokoll später selbst aus diesen Zeilen.</p>
              <div className="dialog-row">
                <Field label="Straße (Bauherr)" htmlFor="np-street">
                  <Input id="np-street" value={v.bauherr?.street ?? ""} onChange={(e) => setContact({ street: e.target.value || null })} autoComplete="off" />
                  <Src k="address" />
                </Field>
                <Field label="Mobil (Bauherr)" htmlFor="np-mobil">
                  <Input id="np-mobil" type="tel" value={v.bauherr?.mobile ?? ""} onChange={(e) => setContact({ mobile: e.target.value || null })} autoComplete="off" />
                </Field>
              </div>
              <div className="dialog-row">
                <Field label="PLZ (Bauherr)" htmlFor="np-plz">
                  <Input id="np-plz" value={v.bauherr?.postalCode ?? ""} onChange={(e) => setContact({ postalCode: e.target.value || null })} inputMode="numeric" autoComplete="off" />
                </Field>
                <Field label="Ort (Bauherr)" htmlFor="np-city">
                  <Input id="np-city" value={v.bauherr?.city ?? ""} onChange={(e) => setContact({ city: e.target.value || null })} autoComplete="off" />
                </Field>
              </div>
              <div className="dialog-row">
                <Field label="Bauort Straße/Baugebiet" htmlFor="np-sstreet">
                  <Input id="np-sstreet" value={v.bauherr?.siteStreet ?? ""} onChange={(e) => setContact({ siteStreet: e.target.value || null })} autoComplete="off" />
                  <Src k="buildingAddress" />
                </Field>
                <Field label="Bauort PLZ" htmlFor="np-splz">
                  <Input id="np-splz" value={v.bauherr?.sitePostalCode ?? ""} onChange={(e) => setContact({ sitePostalCode: e.target.value || null })} inputMode="numeric" autoComplete="off" />
                </Field>
              </div>
              <div className="dialog-row">
                <Field label="Bauort Ort" htmlFor="np-scity">
                  <Input id="np-scity" value={v.bauherr?.siteCity ?? ""} onChange={(e) => setContact({ siteCity: e.target.value || null })} placeholder={v.location ?? ""} autoComplete="off" />
                </Field>
                <Field label="Ortsteil/Gemeindeteil" htmlFor="np-sdistrict">
                  <Input id="np-sdistrict" value={v.bauherr?.siteDistrict ?? ""} onChange={(e) => setContact({ siteDistrict: e.target.value || null })} autoComplete="off" />
                </Field>
              </div>
              <div className="dialog-row">
                <Field label="Bundesland" htmlFor="np-sstate">
                  <Input id="np-sstate" value={v.bauherr?.siteState ?? ""} onChange={(e) => setContact({ siteState: e.target.value || null })} list="np-laender" placeholder="z. B. Baden-Württemberg" autoComplete="off" />
                  <datalist id="np-laender">
                    <option value="Baden-Württemberg" />
                    <option value="Bayern" />
                  </datalist>
                </Field>
                <Field label="Flur" htmlFor="np-flur">
                  <Input id="np-flur" value={v.flur ?? ""} onChange={(e) => set({ flur: e.target.value || null })} autoComplete="off" />
                  <Src k="flur" />
                </Field>
              </div>
            </details>
          </fieldset>

          {draft && stored.length > 0 && (
            <DocumentCards
              docs={docs}
              activeKey={active?.key ?? null}
              readingKey={readingKey}
              pilot={pilot}
              onShow={(d) => {
                setActiveKey(d.key);
                setViewPage(1);
              }}
              onArt={changeArt}
              onMeta={changeMeta}
              onReread={(d) => void reread(d)}
              onEditDocuments={canCreate && !stored.some((d) => d.legacy) ? () => setStep("start") : undefined}
            />
          )}

          <Checkbox label="Projektordner aus der Vorlage anlegen" checked={v.createFolders} onChange={(e) => set({ createFolders: e.target.checked })} />

          {missing.length > 0 && (
            <p className="form-note" aria-live="polite">
              Noch offen: {missing.join(", ")}. {pilot ? "Lässt sich später in der Projektübersicht nachtragen." : "Dafür wird eine Aufgabe „Fehlende Angaben nachfragen“ angelegt."}
            </p>
          )}

          {serverError && (
            <p className="form-error" role="alert">
              {serverError}
            </p>
          )}
        </form>
      </div>
    </Dialog>
  );
}
