import { createContext, useCallback, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { monthStart } from "../lib/format";
import { compareAbm } from "../lib/projectFilters";
import { infoStateOfNew, missingProjectInfo, validateNewProject, type ProjectFormErrors } from "../lib/projectForm";
import type { NewProject } from "../lib/repo";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";
import { useToast } from "./Toast";
import { SelectOrCreate } from "./SelectOrCreate";
import { Button, Checkbox, Dialog, Field, Input, Select } from "./ui";

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
  /** Vermesser, die in diesem Dialog neu eingetragen wurden (gespeichert werden sie erst mit dem Projekt) */
  const [newSurveyors, setNewSurveyors] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validateNewProject(v, projects);
  const show = (k: keyof ProjectFormErrors) => (touched ? errors[k] : undefined);
  const set = (patch: Partial<NewProject>) => setV((old) => ({ ...old, ...patch }));
  const salespeople = (data?.salespeople ?? []).filter((s) => s.companyId === v.companyId);
  const surveyors = [...new Set([...(data?.parties ?? []).filter((p) => p.role === "vermesser").map((p) => p.name), ...newSurveyors])].sort((a, b) => a.localeCompare(b, "de"));
  const company = companies.find((c) => c.id === v.companyId);
  const suggestion = v.kind === "neubau" ? suggestAbmNr(company?.numberPrefix ?? null, projects) : "";
  // Bauvoranfrage: weder ABM-Nr. noch Firma
  const effective: NewProject = v.kind === "bauvoranfrage" ? { ...v, abmNr: null, companyId: null, salespersonId: null } : v;
  const missing = missingProjectInfo(infoStateOfNew(effective));
  const setContact = (patch: Partial<NonNullable<NewProject["bauherr"]>>) => setV((old) => ({ ...old, bauherr: { phone: null, email: null, address: null, buildingAddress: null, ...old.bauherr, ...patch } }));

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

  return (
    <Dialog
      title="Neues Projekt"
      wide
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" type="submit" form="new-project" disabled={busy}>
            {busy ? "Wird angelegt …" : "Projekt anlegen"}
          </Button>
        </>
      }
    >
      <form id="new-project" className="dialog-form" onSubmit={submit} noValidate>
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
          </Field>
          <Field label="Bauadresse" htmlFor="np-bauadresse">
            <Input id="np-bauadresse" value={v.bauherr?.buildingAddress ?? ""} onChange={(e) => setContact({ buildingAddress: e.target.value || null })} placeholder="Straße, PLZ Ort oder Flurstück" autoComplete="off" />
          </Field>
        </div>

        <fieldset className="form-group">
          <legend>Kontakt Bauherr</legend>
          <div className="dialog-row">
            <Field label="Telefon" htmlFor="np-tel">
              <Input id="np-tel" type="tel" value={v.bauherr?.phone ?? ""} onChange={(e) => setContact({ phone: e.target.value || null })} autoComplete="off" />
            </Field>
            <Field label="E-Mail" htmlFor="np-mail">
              <Input id="np-mail" type="email" value={v.bauherr?.email ?? ""} onChange={(e) => setContact({ email: e.target.value || null })} autoComplete="off" {...invalid("email")} />
              <Err k="email" />
            </Field>
          </div>
          <Field label="Anschrift des Bauherrn" htmlFor="np-anschrift">
            <Input id="np-anschrift" value={v.bauherr?.address ?? ""} onChange={(e) => setContact({ address: e.target.value || null })} placeholder="Straße, PLZ Ort" autoComplete="off" />
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
