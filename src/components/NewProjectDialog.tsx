import { createContext, useCallback, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { monthStart } from "../lib/format";
import { compareAbm } from "../lib/projectFilters";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";
import { useToast } from "./Toast";
import { Button, Dialog, Field, Input, Select } from "./ui";

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
  const [kind, setKind] = useState<Project["kind"]>("neubau");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const company = companies.find((c) => c.id === companyId) ?? null;
  const [abmNr, setAbmNr] = useState(() => suggestAbmNr(company?.numberPrefix ?? null, data?.projects ?? []));
  const [bauherr, setBauherr] = useState("");
  const [location, setLocation] = useState("");
  const [architectId, setArchitectId] = useState(data?.team.find((t) => t.role === "architekt")?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function changeCompany(id: string) {
    setCompanyId(id);
    const c = companies.find((x) => x.id === id);
    setAbmNr(suggestAbmNr(c?.numberPrefix ?? null, data?.projects ?? []));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!bauherr.trim()) {
      setErr("Bitte den Bauherrn eintragen.");
      return;
    }
    setBusy(true);
    const res = await mutate((r) =>
      r.createProject({
        bauherrLabel: bauherr,
        abmNr: kind === "bauvoranfrage" ? "Bauvoranfrage" : abmNr.trim() || null,
        kind,
        companyId: kind === "bauvoranfrage" ? null : companyId || null,
        location: location.trim() || null,
        architectId: architectId || null,
        intakeMonth: monthStart(today),
      }),
    );
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    toast(`Projekt ${res.value.bauherrLabel} angelegt`);
    onClose();
    navigate(`/projekte/${res.value.id}`);
  }

  return (
    <Dialog
      title="Neues Projekt"
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
      <form id="new-project" className="dialog-form" onSubmit={submit}>
        <Field label="Bauherr (Nachname)" htmlFor="np-bauherr">
          <Input id="np-bauherr" value={bauherr} onChange={(e) => setBauherr(e.target.value)} placeholder="z. B. Hoffmann" required autoFocus />
        </Field>
        <Field label="Art" htmlFor="np-kind">
          <Select
            id="np-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Project["kind"])}
            options={[
              { value: "neubau", label: "Neubau" },
              { value: "bauvoranfrage", label: "Bauvoranfrage" },
            ]}
          />
        </Field>
        {kind === "neubau" && (
          <div className="dialog-row">
            <Field label="Hausbaufirma" htmlFor="np-company">
              <Select id="np-company" value={companyId} onChange={(e) => changeCompany(e.target.value)} options={[...companies.map((c) => ({ value: c.id, label: c.name })), { value: "", label: "Ohne Firma" }]} />
            </Field>
            <Field label="ABM-Nr." htmlFor="np-abm" hint="Vorschlag: nächste freie Nummer">
              <Input id="np-abm" value={abmNr} onChange={(e) => setAbmNr(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="dialog-row">
          <Field label="Bauort" htmlFor="np-ort">
            <Input id="np-ort" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z. B. Ulm" />
          </Field>
          <Field label="Architekt" htmlFor="np-arch">
            <Select id="np-arch" value={architectId} onChange={(e) => setArchitectId(e.target.value)} options={(data?.team ?? []).filter((t) => t.role === "architekt").map((t) => ({ value: t.id, label: t.code ?? t.name }))} />
          </Field>
        </div>
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
      </form>
    </Dialog>
  );
}
