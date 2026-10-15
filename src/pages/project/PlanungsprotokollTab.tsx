import { useMemo, useState, type FormEvent } from "react";
import { Download, FileCheck2, FilePen, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { Button, Card, CardBody, CardHead, DataTable, EmptyState, Field, Input, Pill, Select, type Column } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { protokollDaten, splitAnschrift } from "../../lib/planungsprotokoll/daten";
import { dateiSpeichern, protokollErzeugen } from "../../lib/planungsprotokoll/erzeugen";
import { PROTOKOLL_ORDNER, VARIANTE_LABEL, VORLAGEN, VORLAGEN_LISTE, vorlageFuerFirma } from "../../lib/planungsprotokoll/vorlagen";
import { feldStand, nochLeer } from "../../lib/planungsprotokoll/zuordnung";
import { PARTY_LABEL } from "../../lib/projectEdit";
import type { PartyInput, ProjectPatch } from "../../lib/repo";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import type { BauherrContact, Dataset, PartyRole, Planungsprotokoll, Project, ProtokollVariante, ProtokollVorlage } from "../../lib/types";

/** Beteiligte, die das Protokoll auf Seite 1 abfragt, in der Reihenfolge der Vorlagen. */
const ROLLEN: PartyRole[] = ["vermesser", "baugrundgutachter", "erdbauer", "kellerbauer", "gemeinde", "bauamt", "schornsteinfeger", "strom", "gas", "fernwaerme", "wasser", "abwasser", "sonstige"];
/** Fax fragt nur Schwabenhaus ab, und nur bei Gemeinde und Bauamt. */
const MIT_FAX: PartyRole[] = ["gemeinde", "bauamt"];

type Kontaktfelder = { name: string; address: string; phone: string; mobile: string; email: string; fax: string };
const LEER: Kontaktfelder = { name: "", address: "", phone: "", mobile: "", email: "", fax: "" };

/**
 * Reiter "Planungsprotokoll" (nur Admin und Mitarbeiter): Seite 1 der Vorlage der Hausbaufirma automatisch befüllen,
 * als bearbeitbare oder flache Fassung im Projektordner ablegen, Fassungen auflisten. Darunter die Angaben, die nur das
 * Protokoll braucht (weitere Beteiligte, Sachbearbeiter, getrennte Anschrift und Bauort), alles optional.
 */
export function PlanungsprotokollTab({ project, data, contact }: { project: Project; data: Dataset; contact: BauherrContact | null }) {
  const { repo, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const company = data.companies.find((c) => c.id === project.companyId);
  const auto = vorlageFuerFirma(company?.name);
  const versionen = data.planungsprotokolle.filter((p) => p.projectId === project.id);
  const [wahl, setWahl] = useState<ProtokollVorlage | "">(versionen[0]?.vorlage ?? "");
  const vorlage: ProtokollVorlage | null = auto ?? (wahl || null);
  const [busy, setBusy] = useState<ProtokollVariante | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const daten = useMemo(() => protokollDaten(data, project.id), [data, project.id]);
  const stand = vorlage ? feldStand(vorlage, daten) : null;
  const leer = vorlage ? nochLeer(vorlage, daten) : [];

  async function erzeugen(variante: ProtokollVariante) {
    if (!vorlage || busy) return;
    setBusy(variante);
    setFehler(null);
    try {
      const datei = await protokollErzeugen(repo, data, project, vorlage, variante);
      const res = await mutate((r) => r.savePlanungsprotokoll({ projectId: project.id, vorlage, variante, fileName: datei.fileName, blob: datei.blob }));
      if (!res.ok) setFehler(res.error);
      else toast(variante === "flach" ? "Flache Fassung erzeugt" : "Planungsprotokoll erzeugt", "ok", `${datei.fileName} liegt im Ordner „${PROTOKOLL_ORDNER}“.`);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <Card>
        <CardHead title="Planungsprotokoll" sub="Seite 1 wird aus den Projektdaten befüllt. Alles Weitere füllt ihr wie bisher im PDF aus." icon={<FileText size={16} />} />
        <CardBody>
          <div className="pp-start">
            {auto ? (
              <p className="pp-vorlage">
                Vorlage: <strong>{VORLAGEN[auto].label}</strong> <span className="muted">(nach Hausbaufirma)</span>
              </p>
            ) : (
              <Field label="Vorlage" htmlFor="pp-vorlage" hint={company ? `Zu „${company.name}“ gibt es keine Vorlage: bitte wählen.` : "Keine Hausbaufirma eingetragen: bitte wählen."}>
                <Select
                  id="pp-vorlage"
                  value={wahl}
                  onChange={(e) => setWahl(e.target.value as ProtokollVorlage | "")}
                  options={[{ value: "", label: "Vorlage wählen" }, ...VORLAGEN_LISTE.map((v) => ({ value: v.key, label: v.label }))]}
                />
              </Field>
            )}
            {stand && (
              <p className="pp-stand" role="status">
                Seite 1: <strong>{stand.gefuellt}</strong> von {stand.gesamt} Feldern bekommen einen Wert.
                {leer.length > 0 && <span className="muted"> Noch leer: {leer.join(", ")}.</span>}
                {!data.buero?.name && (
                  <span className="muted">
                    {" "}
                    Die Bürodaten fehlen noch{user.role === "admin" ? (
                      <>
                        {" "}
                        (<Link to="/einstellungen">Einstellungen</Link>)
                      </>
                    ) : (
                      " (trägt ein Admin in den Einstellungen ein)"
                    )}
                    .
                  </span>
                )}
              </p>
            )}
            <div className="pp-actions">
              <Button variant="primary" icon={<FilePen size={15} />} disabled={!vorlage || !!busy} onClick={() => void erzeugen("bearbeitbar")}>
                {busy === "bearbeitbar" ? "Wird erzeugt …" : "Planungsprotokoll erzeugen"}
              </Button>
              <Button icon={<FileCheck2 size={15} />} disabled={!vorlage || !!busy} onClick={() => void erzeugen("flach")}>
                {busy === "flach" ? "Wird erzeugt …" : "Flache Fassung erzeugen"}
              </Button>
            </div>
            <p className="field-hint">
              „Bearbeitbar“: die Felder bleiben im PDF ausfüllbar. „Flache Fassung“: die Werte sind eingebrannt, zum Versand. Jede Fassung wird neu im Ordner „{PROTOKOLL_ORDNER}“ abgelegt, nichts wird überschrieben.
            </p>
            {fehler && (
              <p className="form-error" role="alert">
                {fehler}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <Versionen versionen={versionen} data={data} />

      <AngabenForm project={project} data={data} contact={contact} />
    </div>
  );
}

function stempel(at: string): string {
  return `${formatDate(at.slice(0, 10))}, ${at.slice(11, 16)} Uhr`;
}

function Versionen({ versionen, data }: { versionen: Planungsprotokoll[]; data: Dataset }) {
  const { repo } = useData();
  const toast = useToast();
  const name = (p: Planungsprotokoll) => data.documents.find((d) => d.id === p.dokumentId)?.name ?? "Planungsprotokoll.pdf";

  async function laden(p: Planungsprotokoll) {
    try {
      dateiSpeichern(await repo.planungsprotokollDatei(p), name(p));
    } catch (e) {
      toast("Download nicht möglich", "danger", e instanceof Error ? e.message : String(e));
    }
  }

  const columns: Column<Planungsprotokoll>[] = [
    { key: "am", header: "Erzeugt", strong: true, render: (p) => stempel(p.erstelltAm), sortValue: (p) => p.erstelltAm },
    { key: "variante", header: "Fassung", render: (p) => <Pill tone={p.variante === "flach" ? "info" : "neutral"}>{p.variante === "flach" ? "Flach" : "Bearbeitbar"}</Pill> },
    { key: "vorlage", header: "Vorlage", render: (p) => VORLAGEN[p.vorlage].firma },
    { key: "von", header: "Erstellt von", render: (p) => p.erstelltVon ?? "–" },
    {
      key: "dl",
      header: <span className="sr-only">Download</span>,
      align: "right",
      render: (p) => (
        <Button size="sm" icon={<Download size={14} />} onClick={() => void laden(p)} aria-label={`${VARIANTE_LABEL[p.variante]} vom ${stempel(p.erstelltAm)} herunterladen`}>
          Download
        </Button>
      ),
    },
  ];
  return (
    <Card>
      <CardHead title="Erzeugte Fassungen" sub={versionen.length ? `${versionen.length} ${versionen.length === 1 ? "Fassung" : "Fassungen"}, neueste zuerst` : undefined} />
      {versionen.length ? <DataTable rows={versionen} columns={columns} rowKey={(p) => p.id} label="Erzeugte Planungsprotokolle" initialSort={{ key: "am", dir: "desc" }} compact /> : <EmptyState title="Noch kein Planungsprotokoll erzeugt" text="Die Fassungen erscheinen hier und im Reiter Dokumente." />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Angaben, die nur das Protokoll braucht
// ---------------------------------------------------------------------------

function AngabenForm({ project, data, contact }: { project: Project; data: Dataset; contact: BauherrContact | null }) {
  const { mutate } = useData();
  const toast = useToast();
  const parties = data.parties.filter((p) => p.projectId === project.id);
  const start = () => {
    const party = (r: PartyRole): Kontaktfelder => {
      const p = parties.find((x) => x.role === r);
      return p ? { name: p.name, address: p.address ?? "", phone: p.phone ?? "", mobile: p.mobile ?? "", email: p.email ?? "", fax: p.fax ?? "" } : { ...LEER };
    };
    return {
      bauherr: {
        street: contact?.street ?? "",
        postalCode: contact?.postalCode ?? "",
        city: contact?.city ?? "",
        mobile: contact?.mobile ?? "",
        siteStreet: contact?.siteStreet ?? "",
        sitePostalCode: contact?.sitePostalCode ?? "",
        siteCity: contact?.siteCity ?? "",
        siteDistrict: contact?.siteDistrict ?? "",
        siteState: contact?.siteState ?? "",
        flur: project.flur ?? "",
      },
      rollen: Object.fromEntries([...ROLLEN, "sachbearbeiter"].map((r) => [r, party(r as PartyRole)])) as Record<PartyRole, Kontaktfelder>,
    };
  };
  const [v, setV] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const id = `pp-${project.id}`;
  // Vorschläge aus den einzeiligen Feldern (wie das Protokoll sie ohne getrennte Angaben aufteilt)
  const altWohn = splitAnschrift(contact?.address);
  const altBau = splitAnschrift(contact?.buildingAddress);
  const setB = (patch: Partial<typeof v.bauherr>) => {
    setV((o) => ({ ...o, bauherr: { ...o.bauherr, ...patch } }));
    setDirty(true);
  };
  const setR = (r: PartyRole, patch: Partial<Kontaktfelder>) => {
    setV((o) => ({ ...o, rollen: { ...o.rollen, [r]: { ...o.rollen[r], ...patch } } }));
    setDirty(true);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const rollen = [...ROLLEN, "sachbearbeiter" as PartyRole];
    const ohneName = rollen.filter((r) => !v.rollen[r].name.trim() && Object.entries(v.rollen[r]).some(([k, x]) => k !== "name" && x.trim()));
    if (ohneName.length) return setError(`Bitte einen Namen eintragen bei: ${ohneName.map((r) => PARTY_LABEL[r]).join(", ")}.`);
    const b = v.bauherr;
    const patch: ProjectPatch = {
      project: { flur: b.flur },
      // Die einzeiligen Kontaktfelder bleiben, wie sie sind; nur die getrennten Felder kommen hier dazu
      bauherr: {
        phone: contact?.phone ?? null,
        email: contact?.email ?? null,
        address: contact?.address ?? null,
        buildingAddress: contact?.buildingAddress ?? null,
        street: b.street,
        postalCode: b.postalCode,
        city: b.city,
        mobile: b.mobile,
        siteStreet: b.siteStreet,
        sitePostalCode: b.sitePostalCode,
        siteCity: b.siteCity,
        siteDistrict: b.siteDistrict,
        siteState: b.siteState,
      },
      parties: Object.fromEntries(
        rollen.map((r) => {
          const x = v.rollen[r];
          const input: PartyInput = { name: x.name, address: x.address, phone: x.phone, mobile: x.mobile, email: x.email, ...(MIT_FAX.includes(r) ? { fax: x.fax } : {}) };
          return [r, x.name.trim() ? input : parties.some((p) => p.role === r) ? null : undefined];
        }).filter(([, x]) => x !== undefined),
      ),
    };
    setBusy(true);
    const res = await mutate((r) => r.updateProject(project.id, patch));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDirty(false);
    toast("Angaben gespeichert", "ok");
  }

  const filled = (r: PartyRole) => parties.find((p) => p.role === r);
  const zusammenfassung = (r: PartyRole) => {
    const p = filled(r);
    return p ? [p.name, p.phone, p.email].filter(Boolean).join(" · ") : "noch leer";
  };
  const input = (key: string, label: string, value: string, onChange: (x: string) => void, extra: { placeholder?: string; type?: string; list?: string } = {}) => (
    <Field label={label} htmlFor={`${id}-${key}`}>
      <Input id={`${id}-${key}`} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" {...extra} />
    </Field>
  );
  const buero = data.buero;

  return (
    <Card>
      <CardHead title="Angaben für Seite 1" sub="Alles optional. Was fehlt, bleibt im Protokoll leer." />
      <CardBody>
        <form className="edit-form pp-form" onSubmit={(e) => void submit(e)} noValidate>
          <details className="pp-group">
            <summary>
              <span>Bauherr und Bauort</span>
              <span className="muted">{[contact?.street || altWohn.strasse, contact?.siteCity || altBau.ort || project.location].filter(Boolean).join(" · ") || "noch leer"}</span>
            </summary>
            <div className="pp-group-body">
              <p className="field-hint">Leer gelassen, teilt das Protokoll die einzeilige Anschrift bzw. Bauadresse auf (Vorschläge in den Feldern).</p>
              <div className="pp-grid">
                {input("street", "Straße (Bauherr)", v.bauherr.street, (x) => setB({ street: x }), { placeholder: altWohn.strasse ?? "" })}
                {input("plz", "PLZ", v.bauherr.postalCode, (x) => setB({ postalCode: x }), { placeholder: altWohn.plz ?? "" })}
                {input("ort", "Ort", v.bauherr.city, (x) => setB({ city: x }), { placeholder: altWohn.ort ?? "" })}
                {input("mobil", "Mobil (Bauherr)", v.bauherr.mobile, (x) => setB({ mobile: x }), { type: "tel", placeholder: contact?.phone ?? "" })}
              </div>
              <div className="pp-grid">
                {input("sstreet", "Bauort Straße/Baugebiet", v.bauherr.siteStreet, (x) => setB({ siteStreet: x }), { placeholder: altBau.strasse ?? (altBau.plz ? "" : (contact?.buildingAddress ?? "")) })}
                {input("splz", "Bauort PLZ", v.bauherr.sitePostalCode, (x) => setB({ sitePostalCode: x }), { placeholder: altBau.plz ?? "" })}
                {input("sort", "Bauort Ort", v.bauherr.siteCity, (x) => setB({ siteCity: x }), { placeholder: altBau.ort ?? project.location ?? "" })}
                {input("steil", "Ortsteil/Gemeindeteil", v.bauherr.siteDistrict, (x) => setB({ siteDistrict: x }))}
                {input("sland", "Bundesland", v.bauherr.siteState, (x) => setB({ siteState: x }), { list: `${id}-laender`, placeholder: "z. B. Baden-Württemberg" })}
                {input("flur", "Flur", v.bauherr.flur, (x) => setB({ flur: x }), { placeholder: project.flurstueck ? `Flurstück: ${project.flurstueck}` : "" })}
              </div>
              <datalist id={`${id}-laender`}>
                <option value="Baden-Württemberg" />
                <option value="Bayern" />
              </datalist>
            </div>
          </details>

          <details className="pp-group">
            <summary>
              <span>Sachbearbeiter (ABM)</span>
              <span className="muted">{filled("sachbearbeiter")?.name ?? "Bürodaten"}</span>
            </summary>
            <div className="pp-group-body">
              <p className="field-hint">Steht beim Architekten neben dem Büronamen. Tel., Mobil und E-Mail ersetzen die Bürodaten, soweit eingetragen.</p>
              <datalist id={`${id}-team`}>
                {data.team.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
              <div className="pp-grid">
                {input("sb-name", "Name", v.rollen.sachbearbeiter.name, (x) => setR("sachbearbeiter", { name: x }), { list: `${id}-team` })}
                {input("sb-tel", "Tel.", v.rollen.sachbearbeiter.phone, (x) => setR("sachbearbeiter", { phone: x }), { type: "tel", placeholder: buero?.tel ?? "" })}
                {input("sb-mobil", "Mobil", v.rollen.sachbearbeiter.mobile, (x) => setR("sachbearbeiter", { mobile: x }), { type: "tel", placeholder: buero?.mobil ?? "" })}
                {input("sb-mail", "E-Mail", v.rollen.sachbearbeiter.email, (x) => setR("sachbearbeiter", { email: x }), { type: "email", placeholder: buero?.email ?? "" })}
              </div>
            </div>
          </details>

          <div className="pp-rollen" role="group" aria-label="Beteiligte">
            {ROLLEN.map((r) => (
              <details className="pp-group" key={r}>
                <summary>
                  <span>{PARTY_LABEL[r]}</span>
                  <span className="muted">{zusammenfassung(r)}</span>
                </summary>
                <div className="pp-group-body">
                  <div className="pp-grid">
                    {input(`${r}-name`, "Name", v.rollen[r].name, (x) => setR(r, { name: x }), { placeholder: "Firma bzw. Behörde" })}
                    {input(`${r}-adr`, "Anschrift", v.rollen[r].address, (x) => setR(r, { address: x }), { placeholder: "Straße, PLZ Ort" })}
                    {input(`${r}-tel`, "Tel.", v.rollen[r].phone, (x) => setR(r, { phone: x }), { type: "tel" })}
                    {input(`${r}-mobil`, "Mobil", v.rollen[r].mobile, (x) => setR(r, { mobile: x }), { type: "tel" })}
                    {input(`${r}-mail`, "E-Mail", v.rollen[r].email, (x) => setR(r, { email: x }), { type: "email" })}
                    {MIT_FAX.includes(r) && input(`${r}-fax`, "Fax", v.rollen[r].fax, (x) => setR(r, { fax: x }), { type: "tel" })}
                  </div>
                  {filled(r)?.contact && <p className="field-hint">Alte Kontaktzeile (bleibt erhalten): {filled(r)!.contact}</p>}
                </div>
              </details>
            ))}
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="edit-actions">
            <Button
              size="sm"
              disabled={busy || !dirty}
              onClick={() => {
                setV(start());
                setDirty(false);
                setError(null);
              }}
            >
              Zurücksetzen
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy || !dirty}>
              {busy ? "Speichert …" : "Angaben speichern"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
