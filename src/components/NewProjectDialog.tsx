import { createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, FileUp } from "lucide-react";
import { ALWAYS_CHECK, applyDraft, cleanMeta, FORM_SOURCE, SIMILAR_LABEL, similarProjects, type AppliedDraft, type FormKey } from "../lib/extract/applyDraft";
import {
  checkContractFile,
  CONTRACT_ACCEPT,
  emptyDraft,
  ExtractUnavailable,
  extractorKind,
  extractProjectFromDocument,
  FOERDER_FRIST_MONATE,
  foerderFrist,
  NO_SITE_HINT,
  SICHERHEIT_LABEL,
  VERTRAGSART_LABEL,
  type ProjectDraft,
  type Sicherheit,
  type Vertragsart,
} from "../lib/extract";
import { scanWerkvertragFile, vorlageVermessungFile } from "../lib/extract/fixtures";
import { renderPages, type DocumentPages } from "../lib/extract/pageImage";
import { formatBytes, formatDate, monthStart } from "../lib/format";
import { compareAbm } from "../lib/projectFilters";
import { infoStateOfNew, missingProjectInfo, validateNewProject, type ProjectFormErrors } from "../lib/projectForm";
import { projectTitle } from "../lib/projects";
import type { NewProject } from "../lib/repo";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { ContractMeta, Project } from "../lib/types";
import { useToast } from "./Toast";
import { SelectOrCreate } from "./SelectOrCreate";
import { Button, Checkbox, Dialog, Field, Input, Pill, Select, Skeleton, type Tone } from "./ui";

/** Öffnet den Dialog "Neues Projekt"; mit der ID eines Entwurfs wird dieser fortgesetzt. */
// Als Klick-Handler bekommt die Funktion ein Ereignis statt einer ID, deshalb "unknown": nur Zeichenketten zählen
const NewProjectContext = createContext<(draftId?: unknown) => void>(() => {});

/** Stellt den Dialog "Neues Projekt" bereit (Kopfzeile, Projektliste, leere Zustände, Prüfliste). */
export function NewProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; draftId: string | null }>({ open: false, draftId: null });
  const openDialog = useCallback((draftId?: unknown) => setState({ open: true, draftId: typeof draftId === "string" ? draftId : null }), []);
  return (
    <NewProjectContext.Provider value={openDialog}>
      {children}
      {state.open && <NewProjectDialog key={state.draftId ?? "neu"} draftId={state.draftId} onClose={() => setState({ open: false, draftId: null })} />}
    </NewProjectContext.Provider>
  );
}

export function useNewProject() {
  return useContext(NewProjectContext);
}

/** Vorschlag für die nächste freie ABM-Nr. einer Firma (Präfix + höchste Nummer + 1). */
export function suggestAbmNr(prefix: string | null, projects: Project[]): string {
  if (!prefix) return "";
  const nums = projects
    .map((p) => p.abmNr)
    .filter((n): n is string => Boolean(n?.startsWith(`${prefix}-`)))
    .sort(compareAbm);
  const last = nums[nums.length - 1];
  const next = last ? Number(last.split("-")[1]) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

const SICHERHEIT_TONE: Record<Sicherheit, Tone> = { hoch: "ok", mittel: "neutral", niedrig: "warn" };
const KIND_OF = (name: string, type: string) => {
  const c = checkContractFile({ name, size: 1, type });
  return c.ok ? c.kind : null;
};

/** Schritte im Dialog: Ablagefläche, Lesen des Dokuments, Formular (manuell oder als Prüfmaske), Duplikate. */
type Step = "start" | "loading" | "form" | "duplicates";

function NewProjectDialog({ onClose, draftId }: { onClose: () => void; draftId: string | null }) {
  const { data, mutate, today, repo } = useData();
  const { user } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  // Stammdaten anlegen und Verträge ablegen dürfen Admin und Mitarbeiter (die Datenbank prüft das ebenfalls)
  const canCreate = user.role !== "freiberufler";
  const companies = data?.companies ?? [];
  const team = data?.team ?? [];
  const projects = data?.projects ?? [];
  const architects = team.filter((t) => t.role === "architekt");
  const planers = team.filter((t) => t.role === "planer");
  const resumed = draftId ? (data?.projectDrafts.find((d) => d.id === draftId && d.status === "offen") ?? null) : null;

  const [v, setV] = useState<NewProject>(
    () =>
      resumed?.form.project ?? {
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
  const [serverError, setServerError] = useState<string | null>(null);
  // Vertrag ablegen dürfen nur Admin und Mitarbeiter; alle anderen sehen direkt das Formular
  const [step, setStep] = useState<Step>(resumed || !canCreate ? "form" : "start");
  const [draft, setDraft] = useState<ProjectDraft | null>(resumed?.draft ?? null);
  /** ID des gespeicherten Entwurfs (zum Fortsetzen und Abschließen) */
  const [savedId, setSavedId] = useState<string | null>(resumed?.id ?? null);
  /** Inhalt des Dokuments: für die Vorschau und die Ablage im Projekt */
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<DocumentPages | null>(null);
  const [unmatched, setUnmatched] = useState<AppliedDraft["unmatched"]>({});
  const [docType, setDocType] = useState<Vertragsart>(resumed?.docType ?? "sonstiges");
  const [meta, setMeta] = useState<ContractMeta>(resumed?.form.meta ?? {});
  /** Felder, die der Mensch nach dem Vorbefüllen selbst geändert hat (gelten als geprüft) */
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set(resumed?.form.edited ?? []));
  const [showSecond, setShowSecond] = useState(false);
  const [planPage, setPlanPage] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Fortgesetzter Entwurf: Datei für Vorschau und spätere Ablage nachladen
  useEffect(() => {
    if (!resumed) return;
    let alive = true;
    void (async () => {
      const file = await repo.draftFile(resumed.id).catch(() => null);
      if (!alive || !file) return;
      setBlob(file);
      const kind = KIND_OF(resumed.file.name, resumed.file.type);
      if (kind) setPreview(await renderPages(new File([file], resumed.file.name, { type: resumed.file.type }), kind));
    })();
    return () => {
      alive = false;
    };
    // nur beim Öffnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prüfmaske von oben zeigen: der Dialog setzt den Fokus ins erste Feld, auf dem Handy läge die Vorschau sonst außer Sicht
  useEffect(() => {
    if (step === "form" && draft) document.querySelector(".dialog-xwide .dialog-body")?.scrollTo(0, 0);
  }, [step, draft]);

  const errors = validateNewProject(v, projects);
  const show = (k: keyof ProjectFormErrors) => (touched ? errors[k] : undefined);
  const markEdited = (keys: string[]) => draft && setEdited((old) => new Set([...old, ...keys]));
  const set = (patch: Partial<NewProject>) => {
    markEdited(Object.keys(patch));
    setV((old) => ({ ...old, ...patch }));
  };
  const salespeople = (data?.salespeople ?? []).filter((s) => s.companyId === v.companyId);
  const surveyors = [...new Set([...(data?.parties ?? []).filter((p) => p.role === "vermesser").map((p) => p.name), ...newSurveyors])].sort((a, b) => a.localeCompare(b, "de"));
  const company = companies.find((c) => c.id === v.companyId);
  const suggestion = v.kind === "neubau" ? suggestAbmNr(company?.numberPrefix ?? null, projects) : "";
  // Bauvoranfrage: weder ABM-Nr. noch Firma
  const effective: NewProject = v.kind === "bauvoranfrage" ? { ...v, abmNr: null, companyId: null, salespersonId: null } : v;
  const missing = missingProjectInfo(infoStateOfNew(effective));
  const setContact = (patch: Partial<NonNullable<NewProject["bauherr"]>>) => {
    markEdited(Object.keys(patch).map((k) => (k === "name" ? "bauherrName" : k)));
    setV((old) => ({ ...old, bauherr: { phone: null, email: null, address: null, buildingAddress: null, ...old.bauherr, ...patch } }));
  };
  const setMetaField = (k: keyof ContractMeta, value: string) => {
    markEdited([k]);
    setMeta((old) => ({ ...old, [k]: value }));
  };
  const second = showSecond || Boolean(v.bauherr?.name2 || v.bauherr?.phone2 || v.bauherr?.email2);
  const similar = draft
    ? similarProjects({ bauherrLabel: v.bauherrLabel, buildingAddress: v.bauherr?.buildingAddress ?? null, flurstueck: v.flurstueck, gemarkung: v.gemarkung }, projects, data?.bauherren ?? [])
    : [];
  const formState = () => ({ project: v, meta, edited: [...edited] });
  const extractorEnv = { demo: repo.mode === "demo", call: repo.extractProject ? (r: Parameters<NonNullable<typeof repo.extractProject>>[0]) => repo.extractProject!(r) : undefined };
  const canReadPlan = Boolean(draft && draft.extractor === "edge" && draft.textquelle === "bild" && (preview?.pageCount ?? 1) > 1 && !meta.haustyp);

  async function createVia<T extends { id: string }>(fn: Parameters<typeof mutate<T>>[0]): Promise<string> {
    const res = await mutate(fn);
    if (!res.ok) throw new Error(res.error);
    return res.value.id;
  }

  /** Vertrag lesen, das Formular vorbefüllen und den Entwurf speichern. */
  async function readContract(file: File | undefined) {
    if (!file) return;
    const check = checkContractFile(file);
    if (!check.ok) return setFileError(check.reason);
    setFileError(null);
    setStep("loading");
    const datei = { name: file.name, size: file.size, type: file.type };
    const pages = renderPages(file, check.kind);
    let d: ProjectDraft;
    try {
      d = await extractProjectFromDocument(file, extractorEnv);
    } catch (e) {
      if (!(e instanceof ExtractUnavailable)) {
        setFileError(e instanceof Error ? e.message : "Das Dokument ließ sich nicht lesen.");
        return setStep("start");
      }
      // Auslesung nicht möglich (nicht freigeschaltet, Limit, Fehler): von Hand weiter, das Dokument bleibt dabei
      d = emptyDraft(datei, "edge", [`${e.message} Bitte die Felder von Hand ausfüllen; das Dokument wird trotzdem im Projekt abgelegt.`]);
    }
    const applied = applyDraft(d, blank.current, { companies });
    const type = (d.felder.vertragsart.wert as Vertragsart | null) ?? "sonstiges";
    setDraft(d);
    setBlob(file);
    setPreview(await pages);
    setUnmatched(applied.unmatched);
    setV(applied.form);
    setMeta(applied.meta);
    setDocType(type);
    setEdited(new Set());
    // Vermesser sind keine Stammliste: der erkannte Name wird wählbar und erst mit dem Projekt gespeichert
    if (applied.form.vermesser) setNewSurveyors((old) => [...new Set([...old, applied.form.vermesser!])]);
    // Prüfmaske: leere Pflichtfelder sofort zeigen
    setTouched(true);
    setStep("form");
    // Entwurf sofort sichern, damit man abbrechen und später weitermachen kann
    const saved = await mutate((r) => r.saveProjectDraft({ draft: d, form: { project: applied.form, meta: applied.meta, edited: [] }, docType: type, file: datei, blob: file }));
    if (saved.ok) setSavedId(saved.value.id);
    else toast("Entwurf nicht gespeichert", "danger", saved.error);
  }

  /** Haustyp von der Plan-Seite nachlesen (zweites Bild); alle anderen Felder bleiben, wie sie sind. */
  async function readPlanPage() {
    const page = Number(planPage);
    if (!draft || !blob || !Number.isInteger(page) || page < 2 || page > (preview?.pageCount ?? 1)) return;
    setBusy(true);
    try {
      const again = await extractProjectFromDocument(new File([blob], draft.datei.name, { type: draft.datei.type }), extractorEnv, { planPage: page });
      const haustyp = again.felder.haustyp;
      if (haustyp.wert) {
        setDraft({ ...draft, felder: { ...draft.felder, haustyp } });
        setMeta((old) => ({ ...old, haustyp: haustyp.wert! }));
      } else toast("Auf dieser Seite wurde kein Haustyp gefunden", "danger");
    } catch (e) {
      toast("Plan-Seite nicht gelesen", "danger", e instanceof Error ? e.message : undefined);
    }
    setBusy(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    void readContract(e.dataTransfer.files[0]);
  }

  /** Schließen mit offenem Entwurf: den Stand der Prüfmaske sichern. */
  async function closeDialog() {
    if (draft && savedId && !busy) {
      const res = await mutate((r) => r.saveProjectDraft({ id: savedId, draft, form: formState(), docType, file: draft.datei }));
      if (res.ok) toast("Entwurf gespeichert", "ok", "Weiter über die Prüfliste: „Neues Projekt vorgeschlagen“.");
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

  /** Vertrag im Projekt ablegen und den Entwurf abschließen. Liefert eine Fehlermeldung oder null. */
  async function fileInto(projectId: string): Promise<string | null> {
    if (!draft) return null;
    const res = await mutate((r) => r.fileContract({ projectId, docType, meta: cleanMeta(meta), file: draft.datei, blob: blob ?? undefined, draftId: savedId }));
    return res.ok ? null : res.error;
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
    if (missing.length) notes.push(`Aufgabe angelegt: ${missing.length === 1 ? "eine Angabe" : `${missing.length} Angaben`} nachfragen.`);
    const filingError = await fileInto(res.value.id);
    setBusy(false);
    if (draft && !filingError) notes.push(`${draft.datei.name} als ${VERTRAGSART_LABEL[docType]} abgelegt.`);
    toast(`Projekt ${res.value.bauherrLabel} angelegt`, "ok", notes.join(" "));
    if (filingError) toast("Dokument nicht abgelegt", "danger", `${filingError} Der Entwurf bleibt in der Prüfliste; von dort lässt sich das Dokument dem Projekt hinzufügen.`);
    onClose();
    navigate(`/projekte/${res.value.id}`);
  }

  /** Duplikat: kein neues Projekt, das Dokument kommt zum bestehenden. */
  async function addToExisting(p: Project) {
    setBusy(true);
    const error = await fileInto(p.id);
    setBusy(false);
    if (error) return setServerError(error);
    toast(`Dokument zu ${projectTitle(p)} hinzugefügt`, "ok", `${draft?.datei.name} als ${VERTRAGSART_LABEL[docType]} abgelegt. Es wurde kein neues Projekt angelegt.`);
    onClose();
    navigate(`/projekte/${p.id}?tab=dokumente`);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
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

  /**
   * Herkunft und Sicherheit eines vorbefüllten Felds. Hervorgehoben (gelb) wird bei niedriger Sicherheit und,
   * bei Scans und Handschrift, immer bei Telefon und E-Mail, jeweils bis der Mensch das Feld geändert hat.
   */
  const Src = ({ k }: { k: FormKey }) => {
    if (!draft) return null;
    const f = draft.felder[FORM_SOURCE[k]];
    const notFound = k === "companyId" ? unmatched.company : undefined;
    if (!f.wert) return null;
    const changed = edited.has(k === "companyId" ? "companyId" : k);
    const mustCheck = draft.gescannt && ALWAYS_CHECK.includes(k);
    const level: Sicherheit = notFound ? "niedrig" : f.sicherheit;
    const flag = level === "niedrig" || mustCheck;
    return (
      <span className="field-src" data-check={flag && !changed ? true : undefined}>
        <Pill tone={changed ? "neutral" : flag ? "warn" : SICHERHEIT_TONE[level]}>{changed ? "geändert" : mustCheck ? `bitte kontrollieren · ${SICHERHEIT_LABEL[level]}` : `Sicherheit ${SICHERHEIT_LABEL[level]}`}</Pill>
        <span className="field-src-text" title={f.quelle?.text}>
          {notFound && `Im Vertrag: „${notFound}“, nicht in den Stammdaten. `}
          {f.quelle ? `${f.quelle.seite ? `S. ${f.quelle.seite}: ` : ""}„${f.quelle.text}“` : "ohne Textstelle"}
        </span>
      </span>
    );
  };

  if (step === "start" || step === "loading") {
    return (
      <Dialog title="Neues Projekt" wide onClose={onClose} footer={<Button onClick={onClose}>Abbrechen</Button>}>
        {step === "loading" ? (
          <div className="contract-loading" role="status" aria-live="polite">
            <p>Vertrag wird gelesen …</p>
            <Skeleton h={36} />
            <Skeleton h={36} />
            <Skeleton h={36} />
          </div>
        ) : (
          <div className="contract-start">
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
              <p className="contract-drop-title">Vertrag hierher ziehen oder auswählen</p>
              <p className="muted">
                PDF, DOCX oder Bild, höchstens 10 MB. Die App füllt die Projektfelder vor, du prüfst und bestätigst.
                {extractorKind() === "edge" && repo.mode !== "demo" && " Zum Auslesen geht nur die erste Seite als Bild an den KI-Dienst."}
              </p>
              <Button variant="primary" onClick={() => fileInput.current?.click()}>
                Datei auswählen
              </Button>
              <input ref={fileInput} type="file" accept={CONTRACT_ACCEPT} hidden aria-label="Vertrag auswählen" onChange={(e) => void readContract(e.target.files?.[0])} />
            </div>
            {fileError && (
              <p className="form-error" role="alert">
                {fileError}
              </p>
            )}
            {repo.mode === "demo" && (
              <p className="contract-samples">
                Zum Ausprobieren (erfundene Beispiele):{" "}
                <button type="button" className="hint-action" onClick={async () => void readContract(await scanWerkvertragFile())}>
                  gescannter Werkvertrag
                </button>{" "}
                ·{" "}
                <button type="button" className="hint-action" onClick={() => void readContract(vorlageVermessungFile())}>
                  leere Vorlage Vermessungsauftrag
                </button>
              </p>
            )}
            <button type="button" className="hint-action contract-manual" onClick={() => setStep("form")}>
              Ohne Dokument manuell anlegen
            </button>
          </div>
        )}
      </Dialog>
    );
  }

  if (step === "duplicates") {
    return (
      <Dialog
        title="Gibt es dieses Projekt schon?"
        wide
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

  const page1 = preview?.pages[0];

  return (
    <Dialog
      title={draft ? "Neues Projekt prüfen" : "Neues Projekt"}
      wide={!draft}
      xwide={Boolean(draft)}
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
            {busy ? "Wird angelegt …" : draft ? "Bestätigen und anlegen" : "Projekt anlegen"}
          </Button>
        </>
      }
    >
      <div className={draft ? "review-layout" : undefined}>
        {draft && (
          <aside className="review-doc" aria-label="Dokument">
            <div className="contract-file">
              <FileText size={18} aria-hidden />
              <span className="contract-file-name" title={draft.datei.name}>
                {draft.datei.name}
              </span>
              <span className="muted">{formatBytes(draft.datei.size)}</span>
            </div>
            {page1 ? (
              <img className="review-page" src={page1.dataUrl} width={page1.width} height={page1.height} alt={`Seite 1 von ${preview!.pageCount} des Dokuments`} />
            ) : (
              <p className="review-nopage muted">{KIND_OF(draft.datei.name, draft.datei.type) === "docx" ? "Für DOCX gibt es keine Vorschau." : "Vorschau wird geladen oder ist für diese Datei nicht möglich."}</p>
            )}
            {page1 && <span className="muted review-pages">Seite 1 von {preview!.pageCount}</span>}
            {canReadPlan && (
              <div className="review-plan">
                <Field label="Haustyp fehlt? Plan-Seite lesen" htmlFor="np-plan" hint="Sendet zusätzlich diese eine Seite als Bild an den KI-Dienst.">
                  <span className="review-plan-row">
                    <Input id="np-plan" type="number" min={2} max={preview!.pageCount} value={planPage} onChange={(e) => setPlanPage(e.target.value)} placeholder="Seite" />
                    <Button size="sm" onClick={() => void readPlanPage()} disabled={busy || !planPage}>
                      Lesen
                    </Button>
                  </span>
                </Field>
              </div>
            )}
          </aside>
        )}

        <form id="new-project" className="dialog-form" data-review={draft ? true : undefined} onSubmit={submit} noValidate>
          {draft && (
            <section className="contract-summary" aria-label="Hinweise zum Dokument">
              <p className="muted">
                {draft.textquelle === "ohne" ? "Dokument ohne Vorschläge." : "Vorschläge aus dem Dokument."} Bitte jedes Feld prüfen; gelb markierte Felder sind unsicher
                {draft.gescannt ? ", Telefon und E-Mail bei Scans immer" : ""}. Pflicht ist nur der Bauherr.
              </p>
              {draft.hinweise.map((h) => (
                <p key={h} className="form-note">
                  {h}
                </p>
              ))}
              <Field label="Dokumenttyp (bestimmt den Ablageordner)" htmlFor="np-doctype">
                <Select
                  id="np-doctype"
                  value={docType}
                  onChange={(e) => {
                    setDocType(e.target.value as Vertragsart);
                    markEdited(["vertragsart"]);
                  }}
                  options={(Object.keys(VERTRAGSART_LABEL) as Vertragsart[]).map((k) => ({ value: k, label: VERTRAGSART_LABEL[k] }))}
                />
                <Src k="vertragsart" />
              </Field>
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
            <Field label="Bauherr (Nachname) *" htmlFor="np-bauherr">
              <Input id="np-bauherr" value={v.bauherrLabel} onChange={(e) => set({ bauherrLabel: e.target.value })} placeholder="z. B. Hoffmann" autoFocus={!draft} {...invalid("bauherrLabel")} />
              <Err k="bauherrLabel" />
              <Src k="bauherrLabel" />
            </Field>
          </div>

          {v.kind === "neubau" && (
            <div className="dialog-row">
              <Field label="Hausbaufirma" htmlFor="np-company">
                <SelectOrCreate
                  id="np-company"
                  value={v.companyId ?? ""}
                  emptyLabel="Noch offen"
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  // Firma gewechselt: der Verkäufer passt sonst nicht mehr
                  onChange={(id) => set({ companyId: id || null, salespersonId: null })}
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
              </Field>
            </div>
          )}

          <div className="dialog-row">
            {v.kind === "neubau" && (
              <Field label="ABM-Nr." htmlFor="np-abm">
                <Input id="np-abm" value={v.abmNr ?? ""} onChange={(e) => set({ abmNr: e.target.value || null })} placeholder="z. B. 8161-123" {...invalid("abmNr")} />
                <Err k="abmNr" />
                {!show("abmNr") && (
                  <span className="field-hint">
                    Optional, lässt sich nachtragen.
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
              {draft && docType === "werkvertrag" && !v.bauherr?.buildingAddress && <span className="field-hint">{NO_SITE_HINT}</span>}
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
            <legend>Kontakt Bauherr</legend>
            {draft && (
              <Field label="Name (Vorname Nachname)" htmlFor="np-name" hint={draft.felder.bauherrName.wert ? undefined : `Leer lassen für „${v.bauherrLabel || "Nachname"}“.`}>
                <Input id="np-name" value={v.bauherr?.name ?? ""} onChange={(e) => setContact({ name: e.target.value || null })} autoComplete="off" />
                <Src k="bauherrName" />
              </Field>
            )}
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
            <Field label="Anschrift des Bauherrn (Wohnanschrift)" htmlFor="np-anschrift">
              <Input id="np-anschrift" value={v.bauherr?.address ?? ""} onChange={(e) => setContact({ address: e.target.value || null })} placeholder="Straße, PLZ Ort" autoComplete="off" />
              <Src k="address" />
            </Field>
            {second ? (
              <>
                <Field label="Zweiter Bauherr (Name)" htmlFor="np-name2">
                  <Input id="np-name2" value={v.bauherr?.name2 ?? ""} onChange={(e) => setContact({ name2: e.target.value || null })} autoComplete="off" />
                  <Src k="name2" />
                </Field>
                <div className="dialog-row">
                  <Field label="Telefon (zweiter Bauherr)" htmlFor="np-tel2">
                    <Input id="np-tel2" type="tel" value={v.bauherr?.phone2 ?? ""} onChange={(e) => setContact({ phone2: e.target.value || null })} autoComplete="off" />
                    <Src k="phone2" />
                  </Field>
                  <Field label="E-Mail (zweiter Bauherr)" htmlFor="np-mail2">
                    <Input id="np-mail2" type="email" value={v.bauherr?.email2 ?? ""} onChange={(e) => setContact({ email2: e.target.value || null })} autoComplete="off" />
                    <Src k="email2" />
                  </Field>
                </div>
              </>
            ) : (
              <button type="button" className="hint-action form-more" onClick={() => setShowSecond(true)}>
                Zweiten Bauherrn hinzufügen
              </button>
            )}
          </fieldset>

          {draft && (
            <fieldset className="form-group">
              <legend>Weitere Angaben aus dem Vertrag</legend>
              <p className="field-hint">Werden mit dem Dokument gespeichert, nicht als Projektfelder. Der Vertragspreis belegt keine Rechnungsbeträge vor.</p>
              <div className="dialog-row">
                <Field label="Vertragsdatum" htmlFor="np-vdatum">
                  <Input id="np-vdatum" type="date" value={meta.vertragsdatum ?? ""} onChange={(e) => setMetaField("vertragsdatum", e.target.value)} />
                  <Src k="vertragsdatum" />
                </Field>
                <Field label="Vertragspreis" htmlFor="np-vpreis">
                  <Input id="np-vpreis" value={meta.vertragspreis ?? ""} onChange={(e) => setMetaField("vertragspreis", e.target.value)} autoComplete="off" />
                  <Src k="vertragspreis" />
                </Field>
              </div>
              <div className="dialog-row">
                <Field label="Angebotsnummer" htmlFor="np-angebot">
                  <Input id="np-angebot" value={meta.angebotsnummer ?? ""} onChange={(e) => setMetaField("angebotsnummer", e.target.value)} autoComplete="off" />
                  <Src k="angebotsnummer" />
                </Field>
                <Field label="Haustyp" htmlFor="np-haustyp">
                  <Input id="np-haustyp" value={meta.haustyp ?? ""} onChange={(e) => setMetaField("haustyp", e.target.value)} autoComplete="off" />
                  <Src k="haustyp" />
                </Field>
              </div>
              {(draft.felder.rechtsform.wert || draft.felder.foerderung.wert) && (
                <ul className="contract-notes">
                  {draft.felder.rechtsform.wert && <li>Rechtsform laut Vertrag: {draft.felder.rechtsform.wert}</li>}
                  {draft.felder.foerderung.wert && (
                    <li>
                      KfW/WEF-Förderung angekreuzt. Frist {FOERDER_FRIST_MONATE} Monate ab Vertragsdatum
                      {foerderFrist(meta.vertragsdatum) ? `: bis ${formatDate(foerderFrist(meta.vertragsdatum)!)}` : " (Vertragsdatum fehlt)"}. Nur als Hinweis, es entsteht keine Aufgabe.
                    </li>
                  )}
                </ul>
              )}
            </fieldset>
          )}

          <Checkbox label="Projektordner aus der Vorlage anlegen" checked={v.createFolders} onChange={(e) => set({ createFolders: e.target.checked })} />

          {missing.length > 0 && (
            <p className="form-note" aria-live="polite">
              Noch offen: {missing.join(", ")}. Dafür wird eine Aufgabe „Fehlende Angaben nachfragen“ angelegt.
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
