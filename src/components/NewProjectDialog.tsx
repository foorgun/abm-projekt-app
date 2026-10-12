import { createContext, useCallback, useContext, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, FileUp } from "lucide-react";
import { applyDraft, FORM_SOURCE, similarProjects, type AppliedDraft, type FormKey } from "../lib/extract/applyDraft";
import { checkContractFile, CONTRACT_ACCEPT, extractProjectFromDocument, SICHERHEIT_LABEL, VERTRAGSART_LABEL, type ProjectDraft, type Sicherheit, type Vertragsart } from "../lib/extract";
import { formatBytes, formatDate } from "../lib/format";
import { projectTitle } from "../lib/projects";
import { monthStart } from "../lib/format";
import { compareAbm } from "../lib/projectFilters";
import { infoStateOfNew, missingProjectInfo, validateNewProject, type ProjectFormErrors } from "../lib/projectForm";
import type { NewProject } from "../lib/repo";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";
import { useToast } from "./Toast";
import { SelectOrCreate } from "./SelectOrCreate";
import { Button, Checkbox, Dialog, Field, Input, Pill, Select, Skeleton, type Tone } from "./ui";

const NewProjectContext = createContext<() => void>(() => {});

/** Stellt den Dialog "Neues Projekt" bereit (Kopfzeile, Projektliste, leere Zustände). */
export function NewProjectProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  return (
    <NewProjectContext.Provider value={openDialog}>
      {children}
      {open && <NewProjectDialog onClose={() => setOpen(false)} />}
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

/** Schritte im Dialog: Ablagefläche, Lesen des Dokuments, Formular (manuell oder als Prüfmaske mit Vorschlägen). */
type Step = "start" | "loading" | "form";

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { data, mutate, today } = useData();
  const { user } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  // Stammdaten anlegen dürfen Admin und Mitarbeiter (die Datenbank prüft das ebenfalls)
  const canCreate = user.role !== "freiberufler";
  const companies = data?.companies ?? [];
  const team = data?.team ?? [];
  const projects = data?.projects ?? [];
  const architects = team.filter((t) => t.role === "architekt");
  const planers = team.filter((t) => t.role === "planer");

  const [v, setV] = useState<NewProject>(() => ({
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
    bauherr: { phone: null, email: null, address: null, buildingAddress: null },
    createFolders: true,
  }));
  /** Leeres Formular: Ausgangspunkt für jedes neu gelesene Dokument (Werte eines früheren Dokuments bleiben nicht stehen) */
  const blank = useRef(v);
  /** Vermesser, die in diesem Dialog neu eingetragen wurden (gespeichert werden sie erst mit dem Projekt) */
  const [newSurveyors, setNewSurveyors] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Vertrag ablegen dürfen nur Admin und Mitarbeiter; alle anderen sehen direkt das Formular
  const [step, setStep] = useState<Step>(canCreate ? "start" : "form");
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [unmatched, setUnmatched] = useState<AppliedDraft["unmatched"]>({});
  const [docType, setDocType] = useState<Vertragsart>("sonstiges");
  /** Felder, die der Mensch nach dem Vorbefüllen selbst geändert hat (gelten als geprüft) */
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [dropActive, setDropActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
  const similar = draft ? similarProjects({ bauherrLabel: v.bauherrLabel, buildingAddress: v.bauherr?.buildingAddress ?? null }, projects, data?.bauherren ?? []) : [];

  /** Vertrag lesen und das Formular vorbefüllen. Die Datei bleibt im Browser. */
  async function readContract(file: File | undefined) {
    if (!file) return;
    const check = checkContractFile(file);
    if (!check.ok) return setFileError(check.reason);
    setFileError(null);
    setStep("loading");
    try {
      const d = await extractProjectFromDocument(file);
      const applied = applyDraft(d, blank.current, { companies, salespeople: data?.salespeople ?? [] });
      setDraft(d);
      setUnmatched(applied.unmatched);
      setV(applied.form);
      // Vermesser sind keine Stammliste: der erkannte Name wird wählbar und erst mit dem Projekt gespeichert
      if (applied.form.vermesser) setNewSurveyors((old) => [...new Set([...old, applied.form.vermesser!])]);
      setDocType((d.felder.vertragsart.wert as Vertragsart | null) ?? "sonstiges");
      setEdited(new Set());
      // Prüfmaske: leere Pflichtfelder sofort zeigen
      setTouched(true);
      setStep("form");
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Das Dokument ließ sich nicht lesen.");
      setStep("start");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    void readContract(e.dataTransfer.files[0]);
  }

  async function createVia<T extends { id: string }>(fn: Parameters<typeof mutate<T>>[0]): Promise<string> {
    const res = await mutate(fn);
    if (!res.ok) throw new Error(res.error);
    return res.value.id;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (Object.keys(errors).length) {
      // ersten fehlerhaften Wert fokussieren (nach dem Rendern, erst dann trägt das Feld aria-invalid)
      setTimeout(() => document.querySelector<HTMLElement>("#new-project [aria-invalid=true]")?.focus(), 0);
      return;
    }
    setBusy(true);
    const res = await mutate((r) => r.createProject(effective));
    setBusy(false);
    if (!res.ok) return setServerError(res.error);
    const notes = [v.createFolders ? "Projektordner aus der Vorlage angelegt." : "Ohne Projektordner angelegt."];
    if (missing.length) notes.push(`Aufgabe angelegt: ${missing.length === 1 ? "eine Angabe" : `${missing.length} Angaben`} nachfragen.`);
    // Ablage des Vertrags im Projekt folgt mit dem Datenbank-Teil (Entwürfe, Dokumenttyp)
    if (draft) notes.push(`${draft.datei.name} wird noch nicht im Projekt abgelegt.`);
    toast(`Projekt ${res.value.bauherrLabel} angelegt`, "ok", notes.join(" "));
    onClose();
    navigate(`/projekte/${res.value.id}`);
  }

  const invalid = (k: keyof ProjectFormErrors) => (show(k) ? { "aria-invalid": true as const, "aria-describedby": `np-err-${k}` } : {});
  const Err = ({ k }: { k: keyof ProjectFormErrors }) =>
    show(k) ? (
      <span className="field-error" id={`np-err-${k}`} role="alert">
        {show(k)}
      </span>
    ) : null;

  /** Herkunft und Sicherheit eines vorbefüllten Felds; niedrige Sicherheit hebt das Feld hervor, bis es geändert wurde. */
  const Src = ({ k }: { k: FormKey }) => {
    if (!draft) return null;
    const f = draft.felder[FORM_SOURCE[k]];
    const notFound = k === "companyId" ? unmatched.company : k === "salespersonId" ? unmatched.salesperson : undefined;
    if (!f.wert) return null;
    const changed = edited.has(k);
    const level: Sicherheit = notFound ? "niedrig" : f.sicherheit;
    return (
      <span className="field-src" data-level={level} data-edited={changed || undefined}>
        <Pill tone={changed ? "neutral" : SICHERHEIT_TONE[level]}>{changed ? "geändert" : `Sicherheit ${SICHERHEIT_LABEL[level]}`}</Pill>
        <span className="field-src-text" title={f.quelle?.text}>
          {notFound && `Im Vertrag: „${notFound}“, nicht in den Stammdaten. `}
          {f.quelle ? `${f.quelle.seite ? `S. ${f.quelle.seite}: ` : ""}„${f.quelle.text}“` : "ohne Textstelle"}
        </span>
      </span>
    );
  };

  if (step !== "form") {
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
              <p className="muted">PDF, DOCX oder Bild, höchstens 10 MB. Die App füllt die Projektfelder vor, du prüfst und bestätigst.</p>
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
            <button type="button" className="hint-action contract-manual" onClick={() => setStep("form")}>
              Ohne Dokument manuell anlegen
            </button>
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      title={draft ? "Neues Projekt prüfen" : "Neues Projekt"}
      wide
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" type="submit" form="new-project" disabled={busy}>
            {busy ? "Wird angelegt …" : draft ? "Bestätigen und anlegen" : "Projekt anlegen"}
          </Button>
        </>
      }
    >
      <form id="new-project" className="dialog-form" data-review={draft ? true : undefined} onSubmit={submit} noValidate>
        {draft && (
          <section className="contract-summary" aria-label="Dokument">
            <div className="contract-file">
              <FileText size={18} aria-hidden />
              <span className="contract-file-name">{draft.datei.name}</span>
              <span className="muted">{formatBytes(draft.datei.size)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setV(blank.current);
                  setTouched(false);
                  setStep("start");
                }}
              >
                Anderes Dokument
              </Button>
            </div>
            <p className="muted">Vorschläge aus dem Dokument. Bitte jedes Feld prüfen; gelb markierte Felder sind unsicher. Pflicht ist nur der Bauherr.</p>
            {draft.hinweise.map((h) => (
              <p key={h} className="form-note">
                {h}
              </p>
            ))}
            <div className="dialog-row">
              <Field label="Dokumenttyp" htmlFor="np-doctype">
                <Select
                  id="np-doctype"
                  value={docType}
                  onChange={(e) => {
                    setDocType(e.target.value as Vertragsart);
                    markEdited(["vertragsart"]);
                  }}
                  options={(Object.keys(VERTRAGSART_LABEL) as Vertragsart[]).map((k) => ({ value: k, label: VERTRAGSART_LABEL[k] }))}
                />
                <span className="field-src" data-level={draft.felder.vertragsart.sicherheit} data-edited={edited.has("vertragsart") || undefined}>
                  <Pill tone={edited.has("vertragsart") ? "neutral" : SICHERHEIT_TONE[draft.felder.vertragsart.sicherheit]}>
                    {edited.has("vertragsart") ? "geändert" : `Sicherheit ${SICHERHEIT_LABEL[draft.felder.vertragsart.sicherheit]}`}
                  </Pill>
                  <span className="field-src-text">{draft.felder.vertragsart.quelle ? `„${draft.felder.vertragsart.quelle.text}“` : "nicht erkannt"}</span>
                </span>
              </Field>
              <div className="field">
                <span className="field-label">Im Vertrag erkannt, im Projekt noch ohne Feld</span>
                <dl className="contract-extra">
                  <div>
                    <dt>Vertragsdatum</dt>
                    <dd>{draft.felder.vertragsdatum.wert ? formatDate(draft.felder.vertragsdatum.wert) : "–"}</dd>
                  </div>
                  <div>
                    <dt>Honorar</dt>
                    <dd>{draft.felder.honorar.wert ?? "–"}</dd>
                  </div>
                </dl>
                <span className="field-hint">Wird noch nicht gespeichert.</span>
              </div>
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <div className="form-note contract-similar" role="status">
            <strong>{similar.length === 1 ? "Ein ähnliches Projekt gibt es schon:" : `${similar.length} ähnliche Projekte gibt es schon:`}</strong>
            <ul>
              {similar.slice(0, 4).map((x) => (
                <li key={x.project.id}>
                  <Link to={`/projekte/${x.project.id}`} target="_blank" rel="noreferrer">
                    {projectTitle(x.project)}
                  </Link>{" "}
                  ({x.grund === "bauherr" ? "gleicher Bauherr" : x.grund === "adresse" ? "gleiche Bauadresse" : "gleicher Bauherr und gleiche Bauadresse"}
                  {x.project.location ? `, ${x.project.location}` : ""})
                </li>
              ))}
            </ul>
          </div>
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
            <Input id="np-bauherr" value={v.bauherrLabel} onChange={(e) => set({ bauherrLabel: e.target.value })} placeholder="z. B. Hoffmann" autoFocus {...invalid("bauherrLabel")} />
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
              <Src k="salespersonId" />
            </Field>
          </div>
        )}

        <div className="dialog-row">
          {v.kind === "neubau" && (
            <Field label="ABM-Nr." htmlFor="np-abm">
              <Input id="np-abm" value={v.abmNr ?? ""} onChange={(e) => set({ abmNr: e.target.value || null })} placeholder="z. B. 8161-123" {...invalid("abmNr")} />
              <Err k="abmNr" />
              <Src k="abmNr" />
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
            <Src k="hausbauNr" />
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
          </Field>
        </div>

        <fieldset className="form-group">
          <legend>Kontakt Bauherr</legend>
          {draft && (
            <Field label="Name (vollständig)" htmlFor="np-name" hint={draft.felder.bauherrName.wert ? undefined : `Leer lassen für „${v.bauherrLabel || "Nachname"}“.`}>
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
          <Field label="Anschrift des Bauherrn" htmlFor="np-anschrift">
            <Input id="np-anschrift" value={v.bauherr?.address ?? ""} onChange={(e) => setContact({ address: e.target.value || null })} placeholder="Straße, PLZ Ort" autoComplete="off" />
            <Src k="address" />
          </Field>
        </fieldset>

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
    </Dialog>
  );
}
