import { useState, type FormEvent, type ReactNode } from "react";
import { Lock, Pencil } from "lucide-react";
import { SelectOrCreate } from "../../components/SelectOrCreate";
import { useToast } from "../../components/Toast";
import { Button, Card, CardBody, CardHead, Field, IconButton, Input, Select } from "../../components/ui";
import { formatMonth } from "../../lib/format";
import { PARTY_LABEL, planProjectUpdate } from "../../lib/projectEdit";
import { followupKey, missingProjectInfo } from "../../lib/projectForm";
import type { ProjectPatch } from "../../lib/repo";
import { useData } from "../../lib/store";
import { CLASSIC_PARTY_ROLES, type BauherrContact, type Dataset, type PartyRole, type Project } from "../../lib/types";

/** Rollen aus Liste.docx. Die weiteren Rollen (Kellerbauer, Ämter, Versorger, Sachbearbeiter) pflegt der Reiter "Planungsprotokoll". */
const ROLES = CLASSIC_PARTY_ROLES as PartyRole[];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dl-row">
      <dt>{label}</dt>
      <dd>{children || <span className="muted">–</span>}</dd>
    </div>
  );
}

/**
 * Speichert eine Änderung an den Projektdaten. Prüft vorher mit denselben Regeln wie das Repo und meldet,
 * wenn sich dadurch die Aufgabe "Fehlende Angaben nachfragen" erledigt.
 */
function useProjectSave(project: Project, data: Dataset) {
  const { mutate, today } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: ProjectPatch, onDone: () => void) {
    setError(null);
    const plan = planProjectUpdate(data, project.id, patch, today);
    const first = Object.values(plan.errors)[0];
    if (first) return setError(first);
    if (!plan.changed.length) return onDone();
    const openTask = data.tasks.some((t) => t.sourceKey === followupKey(project.id) && t.status === "offen");
    setBusy(true);
    const res = await mutate((r) => r.updateProject(project.id, patch));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast("Gespeichert", "ok", openTask && !plan.followup ? "Alle Angaben sind da: Aufgabe „Fehlende Angaben nachfragen“ erledigt." : `Geändert: ${plan.changed.join(", ")}`);
    onDone();
  }
  return { save, busy, error, clearError: () => setError(null) };
}

/** Kachel, die sich für Admin und Mitarbeiter in ein Formular umschalten lässt. */
function EditableCard({
  title,
  sub,
  canEdit,
  view,
  form,
}: {
  title: string;
  sub?: string;
  canEdit: boolean;
  view: ReactNode;
  form: (close: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHead
        title={title}
        sub={sub}
        actions={
          canEdit && !editing ? (
            <IconButton size="sm" label={`${title} bearbeiten`} onClick={() => setEditing(true)}>
              <Pencil size={14} />
            </IconButton>
          ) : undefined
        }
      />
      <CardBody>{editing ? form(() => setEditing(false)) : view}</CardBody>
    </Card>
  );
}

function EditForm({ onSubmit, onCancel, onEdit, busy, error, children }: { onSubmit: () => void; onCancel: () => void; onEdit: () => void; busy: boolean; error: string | null; children: ReactNode }) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <form className="edit-form" onSubmit={submit} noValidate onChange={onEdit} onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}>
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="edit-actions">
        <Button size="sm" onClick={onCancel} disabled={busy}>
          Abbrechen
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={busy}>
          {busy ? "Speichert …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}

/** Übersicht: Projektdaten und Projektbeteiligte (Felder wie in Liste.docx). Für Admin und Mitarbeiter bearbeitbar. */
export function OverviewTab({ project, data, contact, staff }: { project: Project; data: Dataset; contact: BauherrContact | null; staff: boolean }) {
  const company = data.companies.find((c) => c.id === project.companyId);
  const sales = data.salespeople.find((s) => s.id === project.salespersonId);
  const member = (id: string | null) => data.team.find((t) => t.id === id);
  const architect = member(project.architectId);
  const planer = member(project.planerId);
  const parties = data.parties.filter((p) => p.projectId === project.id);
  const missing = staff
    ? missingProjectInfo({
        kind: project.kind,
        companyId: project.companyId,
        salespersonId: project.salespersonId,
        phone: contact?.phone ?? null,
        email: contact?.email ?? null,
        buildingAddress: contact?.buildingAddress ?? null,
        vermesser: parties.find((x) => x.role === "vermesser")?.name ?? null,
      })
    : [];

  return (
    <div className="stack">
      {missing.length > 0 && (
        <p className="form-note" role="status">
          Noch offen: {missing.join(", ")}. Sobald alles eingetragen ist, erledigt sich die Aufgabe „Fehlende Angaben nachfragen“ von selbst.
        </p>
      )}
      <div className="grid-2 grid-top">
        <div className="stack">
          <EditableCard
            title="Projektbeteiligte"
            canEdit={staff}
            form={(close) => <PartiesForm project={project} data={data} contact={contact} onClose={close} />}
            view={
              <>
                <dl className="dl">
                  {/* ABM-Nr., Hausbau-Nr. und Bauherr stehen im Seitenkopf; hier nur, wenn die Hausbau-Nr. noch fehlt */}
                  {!project.hausbauNr && project.kind === "neubau" && <Row label="Hausbau-Nr.">{null}</Row>}
                  <Row label="Bauadresse">
                    {staff ? (
                      contact?.buildingAddress
                    ) : (
                      <span className="muted locked">
                        <Lock size={12} aria-hidden /> nur für Mitarbeiter
                      </span>
                    )}
                  </Row>
                  <Row label="Verkäufer">{sales ? `${sales.name}${company ? ` (${company.name})` : ""}` : null}</Row>
                </dl>
                <details className="dl-more">
                  <summary>
                    Weitere Beteiligte · {parties.filter((x) => ROLES.includes(x.role)).length} von {ROLES.length} eingetragen
                    {parties.some((x) => !ROLES.includes(x.role)) ? ` (+${parties.filter((x) => !ROLES.includes(x.role)).length} fürs Planungsprotokoll)` : ""}
                  </summary>
                  <dl className="dl">
                    {[...ROLES, ...parties.filter((x) => !ROLES.includes(x.role)).map((x) => x.role)].map((role) => {
                      const p = parties.find((x) => x.role === role);
                      return (
                        <Row key={role} label={PARTY_LABEL[role]}>
                          {p && (
                            <>
                              {p.name}
                              {(p.contact || p.phone || p.email) && <span className="cell-sub">{[p.contact, p.phone, p.email].filter((x, i, a) => x && a.indexOf(x) === i && !(i > 0 && p.contact?.includes(x))).join(" · ")}</span>}
                            </>
                          )}
                        </Row>
                      );
                    })}
                  </dl>
                </details>
              </>
            }
          />
          <EditableCard
            title="Kontakt Bauherr"
            canEdit={staff}
            form={(close) => <ContactForm project={project} data={data} contact={contact} onClose={close} />}
            view={
              // Admin und Mitarbeiter sehen die Kontaktdaten (oder dass noch keine eingetragen sind). Der Sperrhinweis gilt nur für Freiberufler.
              !staff ? (
                <p className="muted locked">
                  <Lock size={13} aria-hidden /> Kontaktdaten der Bauherren sind nur für Mitarbeiter sichtbar.
                </p>
              ) : contact ? (
                <dl className="dl">
                  <Row label="Name">{contact.name}</Row>
                  <Row label="Anschrift">{contact.address}</Row>
                  <Row label="Telefon">{contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>}</Row>
                  <Row label="E-Mail">{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}</Row>
                  {(contact.name2 || contact.phone2 || contact.email2) && (
                    <>
                      <Row label="Zweiter Bauherr">{contact.name2}</Row>
                      <Row label="Telefon (2)">{contact.phone2 && <a href={`tel:${contact.phone2.replace(/[^\d+]/g, "")}`}>{contact.phone2}</a>}</Row>
                      <Row label="E-Mail (2)">{contact.email2 && <a href={`mailto:${contact.email2}`}>{contact.email2}</a>}</Row>
                    </>
                  )}
                </dl>
              ) : (
                <p className="muted">Noch keine Kontaktdaten eingetragen. Über den Stift oben rechts lassen sie sich nachtragen.</p>
              )
            }
          />
        </div>
        <EditableCard
          title="Projektdaten"
          canEdit={staff}
          form={(close) => <ProjectDataForm project={project} data={data} onClose={close} />}
          view={
            <>
            <dl className="dl">
              <Row label="Art">{project.kind === "bauvoranfrage" ? "Bauvoranfrage" : "Neubau"}</Row>
              <Row label="Hausbaufirma">{company?.name}</Row>
              <Row label="Bauort">{project.location}</Row>
              <Row label="Architekt">{architect ? `${architect.name}${architect.code ? ` (${architect.code})` : ""}` : null}</Row>
              <Row label="Planer">{planer?.name}</Row>
              <Row label="Eingang">{project.intakeMonth ? formatMonth(project.intakeMonth) : null}</Row>
              <Row label="Baubetreuung">{project.baubetreuung}</Row>
            </dl>
            <details className="dl-more">
              <summary>Weitere Angaben{project.flurstueck || project.gemarkung ? "" : " · noch leer"}</summary>
              <dl className="dl">
                <Row label="Flurstück">{project.flurstueck}</Row>
                <Row label="Gemarkung">{project.gemarkung}</Row>
              </dl>
            </details>
            </>
          }
        />
      </div>
    </div>
  );
}

const contactOf = (c: BauherrContact | null) => ({ name: c?.name ?? null, phone: c?.phone ?? null, email: c?.email ?? null, address: c?.address ?? null, buildingAddress: c?.buildingAddress ?? null });

function PartiesForm({ project, data, contact, onClose }: { project: Project; data: Dataset; contact: BauherrContact | null; onClose: () => void }) {
  const { mutate } = useData();
  const { save, busy, error, clearError } = useProjectSave(project, data);
  const current = data.parties.filter((p) => p.projectId === project.id);
  const [v, setV] = useState({
    abmNr: project.abmNr ?? "",
    hausbauNr: project.hausbauNr ?? "",
    bauherrLabel: project.bauherrLabel,
    buildingAddress: contact?.buildingAddress ?? "",
    salespersonId: project.salespersonId ?? "",
  });
  const [parties, setParties] = useState(() => Object.fromEntries(ROLES.map((r) => [r, { name: current.find((x) => x.role === r)?.name ?? "", contact: current.find((x) => x.role === r)?.contact ?? "" }])) as Record<PartyRole, { name: string; contact: string }>);
  const salespeople = data.salespeople.filter((s) => s.companyId === project.companyId);
  const surveyors = [...new Set(data.parties.filter((p) => p.role === "vermesser").map((p) => p.name))].sort((a, b) => a.localeCompare(b, "de"));
  const id = `pf-${project.id}`;

  function submit() {
    void save(
      {
        project: { abmNr: v.abmNr, hausbauNr: v.hausbauNr, bauherrLabel: v.bauherrLabel, salespersonId: v.salespersonId || null },
        // Die Bauadresse gehört zu den Kontaktdaten: die übrigen Felder bleiben, wie sie sind
        bauherr: { ...contactOf(contact), buildingAddress: v.buildingAddress },
        parties: Object.fromEntries(ROLES.map((r) => [r, parties[r].name.trim() ? { name: parties[r].name, contact: parties[r].contact || null } : null])),
      },
      onClose,
    );
  }

  return (
    <EditForm onSubmit={submit} onCancel={onClose} onEdit={clearError} busy={busy} error={error}>
      <div className="dialog-row">
        {project.kind === "neubau" && (
          <Field label="ABM-Nr." htmlFor={`${id}-abm`}>
            <Input id={`${id}-abm`} value={v.abmNr} onChange={(e) => setV({ ...v, abmNr: e.target.value })} placeholder="z. B. 8161-123" autoFocus />
          </Field>
        )}
        <Field label="Hausbau-Nr." htmlFor={`${id}-hb`}>
          <Input id={`${id}-hb`} value={v.hausbauNr} onChange={(e) => setV({ ...v, hausbauNr: e.target.value })} placeholder="HB-26118" />
        </Field>
      </div>
      <Field label="Bauherr (Nachname) *" htmlFor={`${id}-bh`}>
        <Input id={`${id}-bh`} value={v.bauherrLabel} onChange={(e) => setV({ ...v, bauherrLabel: e.target.value })} />
      </Field>
      <Field label="Bauadresse" htmlFor={`${id}-ba`}>
        <Input id={`${id}-ba`} value={v.buildingAddress} onChange={(e) => setV({ ...v, buildingAddress: e.target.value })} placeholder="Straße, PLZ Ort oder Flurstück" autoComplete="off" />
      </Field>
      {project.kind === "neubau" && (
        <Field label="Verkäufer" htmlFor={`${id}-sales`} hint={project.companyId ? undefined : "Erst unter „Projektdaten“ die Hausbaufirma wählen."}>
          <SelectOrCreate
            id={`${id}-sales`}
            value={v.salespersonId}
            emptyLabel={project.companyId ? "Noch offen" : "Erst Hausbaufirma wählen"}
            disabled={!project.companyId}
            options={salespeople.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(x) => setV((old) => ({ ...old, salespersonId: x }))}
            onCreate={async (name) => {
              const res = await mutate((r) => r.createSalesperson(project.companyId!, name));
              if (!res.ok) throw new Error(res.error);
              return res.value.id;
            }}
            canCreate
            createPlaceholder="Name des Verkäufers"
          />
        </Field>
      )}
      <datalist id={`${id}-surveyors`}>
        {surveyors.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {ROLES.map((role) => (
        <div className="dialog-row" key={role}>
          <Field label={PARTY_LABEL[role]} htmlFor={`${id}-${role}`}>
            <Input
              id={`${id}-${role}`}
              value={parties[role].name}
              list={role === "vermesser" ? `${id}-surveyors` : undefined}
              onChange={(e) => setParties({ ...parties, [role]: { ...parties[role], name: e.target.value } })}
              placeholder="Firma"
              autoComplete="off"
            />
          </Field>
          <Field label={`Kontakt ${PARTY_LABEL[role]}`} htmlFor={`${id}-${role}-k`}>
            <Input
              id={`${id}-${role}-k`}
              value={parties[role].contact}
              onChange={(e) => setParties({ ...parties, [role]: { ...parties[role], contact: e.target.value } })}
              placeholder="Telefon oder E-Mail der Firma"
              autoComplete="off"
            />
          </Field>
        </div>
      ))}
    </EditForm>
  );
}

function ProjectDataForm({ project, data, onClose }: { project: Project; data: Dataset; onClose: () => void }) {
  const { mutate, today } = useData();
  const { save, busy, error, clearError } = useProjectSave(project, data);
  const [v, setV] = useState({
    companyId: project.companyId ?? "",
    location: project.location ?? "",
    architectId: project.architectId ?? "",
    planerId: project.planerId ?? "",
    intakeMonth: project.intakeMonth?.slice(0, 7) ?? "",
    baubetreuung: project.baubetreuung ?? "",
    flurstueck: project.flurstueck ?? "",
    gemarkung: project.gemarkung ?? "",
  });
  const architects = data.team.filter((t) => t.role === "architekt");
  const planers = data.team.filter((t) => t.role === "planer");
  const id = `pd-${project.id}`;
  const create = async <T extends { id: string }>(fn: Parameters<typeof mutate<T>>[0]) => {
    const res = await mutate(fn);
    if (!res.ok) throw new Error(res.error);
    return res.value.id;
  };

  function submit() {
    void save(
      {
        project: {
          ...(project.kind === "neubau" ? { companyId: v.companyId || null } : {}),
          location: v.location,
          architectId: v.architectId || null,
          planerId: v.planerId || null,
          intakeMonth: v.intakeMonth ? `${v.intakeMonth}-01` : null,
          baubetreuung: v.baubetreuung,
          flurstueck: v.flurstueck,
          gemarkung: v.gemarkung,
        },
      },
      onClose,
    );
  }

  return (
    <EditForm onSubmit={submit} onCancel={onClose} onEdit={clearError} busy={busy} error={error}>
      {project.kind === "neubau" && (
        <Field label="Hausbaufirma" htmlFor={`${id}-company`} hint={v.companyId !== (project.companyId ?? "") && project.salespersonId ? "Der bisherige Verkäufer wird ausgetragen, weil er zur alten Firma gehört." : undefined}>
          <SelectOrCreate
            id={`${id}-company`}
            value={v.companyId}
            emptyLabel="Noch offen"
            options={data.companies.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(x) => setV((old) => ({ ...old, companyId: x }))}
            onCreate={(name) => create((r) => r.createCompany(name))}
            canCreate
            createPlaceholder="Name der Hausbaufirma"
          />
        </Field>
      )}
      <div className="dialog-row">
        <Field label="Bauort" htmlFor={`${id}-ort`}>
          <Input id={`${id}-ort`} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="z. B. Ulm" />
        </Field>
        <Field label="Eingangsmonat" htmlFor={`${id}-month`}>
          <Input id={`${id}-month`} type="month" value={v.intakeMonth} max={today.slice(0, 7)} onChange={(e) => setV({ ...v, intakeMonth: e.target.value })} />
        </Field>
      </div>
      <div className="dialog-row">
        <Field label="Architekt" htmlFor={`${id}-arch`}>
          <SelectOrCreate
            id={`${id}-arch`}
            value={v.architectId}
            emptyLabel="Noch offen"
            options={architects.map((t) => ({ value: t.id, label: t.code ? `${t.code} (${t.name})` : t.name }))}
            onChange={(x) => setV((old) => ({ ...old, architectId: x }))}
            onCreate={(name) => create((r) => r.createTeamMember(name, "architekt"))}
            canCreate
            createPlaceholder="Name des Architekten"
          />
        </Field>
        <Field label="Planer" htmlFor={`${id}-planer`}>
          <Select id={`${id}-planer`} value={v.planerId} onChange={(e) => setV({ ...v, planerId: e.target.value })} options={[{ value: "", label: "Noch offen" }, ...planers.map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
      </div>
      <Field label="Baubetreuung" htmlFor={`${id}-bb`} hint="Freitext wie in der Projektliste, z. B. 3.1+3.2">
        <Input id={`${id}-bb`} value={v.baubetreuung} onChange={(e) => setV({ ...v, baubetreuung: e.target.value })} />
      </Field>
      <div className="dialog-row">
        <Field label="Flurstück" htmlFor={`${id}-flst`}>
          <Input id={`${id}-flst`} value={v.flurstueck} onChange={(e) => setV({ ...v, flurstueck: e.target.value })} placeholder="z. B. 412/3" autoComplete="off" />
        </Field>
        <Field label="Gemarkung" htmlFor={`${id}-gem`}>
          <Input id={`${id}-gem`} value={v.gemarkung} onChange={(e) => setV({ ...v, gemarkung: e.target.value })} autoComplete="off" />
        </Field>
      </div>
    </EditForm>
  );
}

function ContactForm({ project, data, contact, onClose }: { project: Project; data: Dataset; contact: BauherrContact | null; onClose: () => void }) {
  const { save, busy, error, clearError } = useProjectSave(project, data);
  const [v, setV] = useState({
    name: contact?.name ?? "",
    address: contact?.address ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    name2: contact?.name2 ?? "",
    phone2: contact?.phone2 ?? "",
    email2: contact?.email2 ?? "",
  });
  const id = `pc-${project.id}`;

  function submit() {
    // Die Bauadresse steht in der Kachel "Projektbeteiligte" und bleibt hier unverändert
    void save({ bauherr: { name: v.name, address: v.address, phone: v.phone, email: v.email, buildingAddress: contact?.buildingAddress ?? null, name2: v.name2, phone2: v.phone2, email2: v.email2 } }, onClose);
  }

  return (
    <EditForm onSubmit={submit} onCancel={onClose} onEdit={clearError} busy={busy} error={error}>
      <Field label="Name" htmlFor={`${id}-name`} hint={`Leer lassen für „${project.bauherrLabel}“.`}>
        <Input id={`${id}-name`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={`z. B. Familie ${project.bauherrLabel}`} autoComplete="off" autoFocus />
      </Field>
      <Field label="Anschrift" htmlFor={`${id}-addr`}>
        <Input id={`${id}-addr`} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder="Straße, PLZ Ort" autoComplete="off" />
      </Field>
      <div className="dialog-row">
        <Field label="Telefon" htmlFor={`${id}-tel`}>
          <Input id={`${id}-tel`} type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="E-Mail" htmlFor={`${id}-mail`}>
          <Input id={`${id}-mail`} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="off" />
        </Field>
      </div>
      <Field label="Zweiter Bauherr (Name)" htmlFor={`${id}-name2`}>
        <Input id={`${id}-name2`} value={v.name2} onChange={(e) => setV({ ...v, name2: e.target.value })} autoComplete="off" />
      </Field>
      <div className="dialog-row">
        <Field label="Telefon (zweiter Bauherr)" htmlFor={`${id}-tel2`}>
          <Input id={`${id}-tel2`} type="tel" value={v.phone2} onChange={(e) => setV({ ...v, phone2: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="E-Mail (zweiter Bauherr)" htmlFor={`${id}-mail2`}>
          <Input id={`${id}-mail2`} type="email" value={v.email2} onChange={(e) => setV({ ...v, email2: e.target.value })} autoComplete="off" />
        </Field>
      </div>
    </EditForm>
  );
}
