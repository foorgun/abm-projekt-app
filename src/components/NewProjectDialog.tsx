import { createContext, useCallback, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { monthStart } from "../lib/format";
import { compareAbm } from "../lib/projectFilters";
import { validateNewProject, type ProjectFormErrors } from "../lib/projectForm";
import type { NewProject } from "../lib/repo";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";
import { useToast } from "./Toast";
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
  const navigate = useNavigate();
  const toast = useToast();
  const companies = data?.companies ?? [];
  const team = data?.team ?? [];
  const projects = data?.projects ?? [];
  const architects = team.filter((t) => t.role === "architekt");
  const planers = team.filter((t) => t.role === "planer");

  const [v, setV] = useState<NewProject>(() => {
    const companyId = companies[0]?.id ?? null;
    return {
      kind: "neubau",
      abmNr: suggestAbmNr(companies[0]?.numberPrefix ?? null, projects) || null,
      hausbauNr: null,
      bauherrLabel: "",
      location: null,
      companyId,
      salespersonId: null,
      architectId: architects[0]?.id ?? null,
      planerId: null,
      intakeMonth: monthStart(today),
      createFolders: true,
    };
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validateNewProject(v, projects);
  const show = (k: keyof ProjectFormErrors) => (touched ? errors[k] : undefined);
  const set = (patch: Partial<NewProject>) => setV((old) => ({ ...old, ...patch }));
  const salespeople = (data?.salespeople ?? []).filter((s) => s.companyId === v.companyId);

  function changeCompany(id: string) {
    const c = companies.find((x) => x.id === id);
    // Firma gewechselt: Nummernvorschlag und Verkäufer passen sonst nicht mehr
    set({ companyId: id || null, salespersonId: null, abmNr: suggestAbmNr(c?.numberPrefix ?? null, projects) || null });
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
    const res = await mutate((r) => r.createProject(v.kind === "bauvoranfrage" ? { ...v, abmNr: null, companyId: null, salespersonId: null } : v));
    setBusy(false);
    if (!res.ok) return setServerError(res.error);
    toast(`Projekt ${res.value.bauherrLabel} angelegt`, "ok", v.createFolders ? "Projektordner aus der Vorlage angelegt." : "Ohne Projektordner angelegt.");
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
            <Field label="Hausbaufirma *" htmlFor="np-company">
              <Select
                id="np-company"
                value={v.companyId ?? ""}
                onChange={(e) => changeCompany(e.target.value)}
                options={[{ value: "", label: "Bitte wählen" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
                {...invalid("companyId")}
              />
              <Err k="companyId" />
            </Field>
            <Field label="Verkäufer" htmlFor="np-sales">
              <Select
                id="np-sales"
                value={v.salespersonId ?? ""}
                onChange={(e) => set({ salespersonId: e.target.value || null })}
                disabled={!salespeople.length}
                options={[{ value: "", label: salespeople.length ? "Kein Verkäufer" : "Erst Firma wählen" }, ...salespeople.map((s) => ({ value: s.id, label: s.name }))]}
              />
            </Field>
          </div>
        )}

        <div className="dialog-row">
          {v.kind === "neubau" && (
            <Field label="ABM-Nr." htmlFor="np-abm" hint={show("abmNr") ? undefined : "Optional. Vorschlag: nächste freie Nummer."}>
              <Input id="np-abm" value={v.abmNr ?? ""} onChange={(e) => set({ abmNr: e.target.value || null })} placeholder="8161-123" {...invalid("abmNr")} />
              <Err k="abmNr" />
            </Field>
          )}
          <Field label="Hausbau-Nr." htmlFor="np-hb" hint={show("hausbauNr") ? undefined : "Auftragsnummer der Hausbaufirma, optional."}>
            <Input id="np-hb" value={v.hausbauNr ?? ""} onChange={(e) => set({ hausbauNr: e.target.value || null })} placeholder="HB-26118" {...invalid("hausbauNr")} />
            <Err k="hausbauNr" />
          </Field>
        </div>

        <div className="dialog-row">
          <Field label="Bauort *" htmlFor="np-ort">
            <Input id="np-ort" value={v.location ?? ""} onChange={(e) => set({ location: e.target.value || null })} placeholder="z. B. Ulm" {...invalid("location")} />
            <Err k="location" />
          </Field>
          <Field label="Eingangsmonat *" htmlFor="np-month">
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
            <Select id="np-arch" value={v.architectId ?? ""} onChange={(e) => set({ architectId: e.target.value || null })} options={[{ value: "", label: "Noch offen" }, ...architects.map((t) => ({ value: t.id, label: t.code ? `${t.code} (${t.name})` : t.name }))]} />
          </Field>
          <Field label="Planer" htmlFor="np-planer">
            <Select id="np-planer" value={v.planerId ?? ""} onChange={(e) => set({ planerId: e.target.value || null })} options={[{ value: "", label: "Noch offen" }, ...planers.map((t) => ({ value: t.id, label: t.name }))]} />
          </Field>
        </div>

        <Checkbox label="Projektordner aus der Vorlage anlegen" checked={v.createFolders} onChange={(e) => set({ createFolders: e.target.checked })} />

        {serverError && (
          <p className="form-error" role="alert">
            {serverError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
