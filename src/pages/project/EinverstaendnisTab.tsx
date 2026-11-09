import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Download, FileSignature, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { Button, Card, CardBody, CardHead, DataTable, EmptyState, Field, Input, Pill, Select, type Column } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { BAUVORHABEN_VORSCHLAEGE, EINVERSTAENDNIS_ORDNER, ENTWURFSVERFASSER_REGEL, einverstaendnisDaten, fehlendeAngaben, vollmachtText } from "../../lib/einverstaendnis/daten";
import { einverstaendnisErzeugen } from "../../lib/einverstaendnis/erzeugen";
import { dateiSpeichern } from "../../lib/planungsprotokoll/erzeugen";
import { useData } from "../../lib/store";
import type { Dataset, Einverstaendnis, Project, TeamMember } from "../../lib/types";

/**
 * Reiter "Einverständnis" (nur Admin und Mitarbeiter): Einverständniserklärung / Vollmacht für den Bauantrag aus den
 * Projektdaten erzeugen, im Ordner "08 Bauantrag" ablegen, Fassungen auflisten. Fehlt etwas, steht im PDF eine Linie.
 * Hier lassen sich die Angaben ergänzen, die es nur für die Erklärung braucht: Bauvorhaben und die Angaben des Architekten.
 */
export function EinverstaendnisTab({ project, data }: { project: Project; data: Dataset }) {
  const { mutate, today } = useData();
  const toast = useToast();
  const [datum, setDatum] = useState(today);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const daten = useMemo(() => einverstaendnisDaten(data, project.id, datum || today), [data, project.id, datum, today]);
  const fehlt = fehlendeAngaben(daten);
  const versionen = (data.einverstaendnisse ?? []).filter((e) => e.projectId === project.id);
  // Entwurfsverfasser nach der Regel (MC nur in BW, sonst BE), nicht einfach der eingetragene Architekt
  const architekt = data.team.find((t) => t.id === daten.wahl.teamMemberId);

  async function erzeugen() {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      const datei = await einverstaendnisErzeugen(data, project, datum || today);
      const res = await mutate((r) => r.saveEinverstaendnis({ projectId: project.id, fileName: datei.fileName, blob: datei.blob }));
      if (!res.ok) setFehler(res.error);
      else toast("Einverständniserklärung erzeugt", "ok", `${datei.fileName} liegt im Ordner „${EINVERSTAENDNIS_ORDNER}“.`);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const e = daten.entwurfsverfasser;
  return (
    <div className="stack">
      <Card>
        <CardHead title="Einverständniserklärung / Vollmacht" sub="Für den Bauantrag. Wird aus den Projektdaten befüllt; was fehlt, steht im PDF als Linie zum Ausfüllen." icon={<FileSignature size={16} />} />
        <CardBody>
          <div className="pp-start">
            <dl className="dl ev-vorschau" aria-label="Vorschau der Angaben">
              <Zeile label="Bauherrschaft">{zeilen([daten.bauherrschaft.namen, daten.bauherrschaft.strasse, daten.bauherrschaft.plzOrt])}</Zeile>
              <Zeile label="Bauvorhaben">{daten.bauvorhaben}</Zeile>
              <Zeile label="Baugrundstück">{zeilen([daten.grundstueck.plzOrt, daten.grundstueck.strasse, daten.grundstueck.flurstueck && `Flst.-Nr.: ${daten.grundstueck.flurstueck}`])}</Zeile>
              <Zeile label="Entwurfsverfasser">
                {e.name && (
                  <>
                    {zeilen([[e.name, e.titel].filter(Boolean).join(", "), e.anschrift, e.tel && `Tel.: ${e.tel}`, e.email && `E-Mail: ${e.email}`])}
                    <span className="cell-sub">Regel: {daten.wahl.grund}</span>
                  </>
                )}
              </Zeile>
              <Zeile label="Vollmacht">
                <span className="ev-text">{vollmachtText(daten, "…")}</span>
              </Zeile>
              <Zeile label="Unterschriften">{daten.personen.length ? daten.personen.join(" · ") : null}</Zeile>
            </dl>

            <p className="pp-stand" role="status">
              {fehlt.length ? (
                <>
                  Noch leer: {fehlt.join(", ")}. <span className="muted">Bauherr, Bauort, Bundesland und Flurstück stehen unter </span>
                  <Link to={`/projekte/${project.id}`}>Übersicht</Link>
                  <span className="muted"> (getrennte Anschrift unter Planungsprotokoll, Angaben). Erzeugen geht trotzdem.</span>
                </>
              ) : (
                "Alle Angaben sind vorhanden."
              )}
            </p>

            <div className="ev-start-zeile">
              <Field label="Aufgestellt am" htmlFor="ev-datum">
                <Input id="ev-datum" type="date" value={datum} onChange={(x) => setDatum(x.target.value)} />
              </Field>
              <Button variant="primary" icon={<FileSignature size={15} />} disabled={busy} onClick={() => void erzeugen()}>
                {busy ? "Wird erzeugt …" : "Einverständniserklärung erzeugen"}
              </Button>
            </div>
            <p className="field-hint">Jede Fassung wird neu im Ordner „{EINVERSTAENDNIS_ORDNER}“ abgelegt, nichts wird überschrieben.</p>
            {fehler && (
              <p className="form-error" role="alert">
                {fehler}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <Versionen versionen={versionen} data={data} />

      <BauvorhabenForm key={`bv-${project.id}-${project.bauvorhaben ?? ""}`} project={project} />
      {architekt ? (
        <ArchitektForm key={`a-${architekt.id}-${[architekt.anrede, architekt.titel, architekt.anschrift, architekt.tel, architekt.email].join("|")}`} architekt={architekt} data={data} />
      ) : (
        <Card>
          <CardHead title="Entwurfsverfasser" />
          <CardBody>
            <p className="pp-stand">
              Im Team gibt es keinen Architekten mit dem Kürzel {ENTWURFSVERFASSER_REGEL.standard}. Er steht außer bei {ENTWURFSVERFASSER_REGEL.nurInBW} in Baden-Württemberg als Entwurfsverfasser in der Erklärung.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function zeilen(werte: (string | null | undefined | false)[]): ReactNode {
  const da = werte.filter(Boolean) as string[];
  if (!da.length) return null;
  return da.map((w, i) => (
    <span key={i} className="ev-zeile">
      {w}
    </span>
  ));
}

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  const leer = children === null || children === undefined || children === "";
  return (
    <div className="dl-row">
      <dt>{label}</dt>
      <dd>{leer ? <Pill tone="warn">fehlt</Pill> : children}</dd>
    </div>
  );
}

function stempel(at: string): string {
  return `${formatDate(at.slice(0, 10))}, ${at.slice(11, 16)} Uhr`;
}

function Versionen({ versionen, data }: { versionen: Einverstaendnis[]; data: Dataset }) {
  const { repo } = useData();
  const toast = useToast();
  const name = (x: Einverstaendnis) => data.documents.find((d) => d.id === x.dokumentId)?.name ?? "Einverstaendniserklaerung.pdf";

  async function laden(x: Einverstaendnis) {
    try {
      dateiSpeichern(await repo.einverstaendnisDatei(x), name(x));
    } catch (err) {
      toast("Download nicht möglich", "danger", err instanceof Error ? err.message : String(err));
    }
  }

  const columns: Column<Einverstaendnis>[] = [
    { key: "am", header: "Erzeugt", strong: true, render: (x) => stempel(x.erstelltAm), sortValue: (x) => x.erstelltAm },
    { key: "von", header: "Erstellt von", render: (x) => x.erstelltVon ?? "–" },
    {
      key: "dl",
      header: <span className="sr-only">Download</span>,
      align: "right",
      render: (x) => (
        <Button size="sm" icon={<Download size={14} />} onClick={() => void laden(x)} aria-label={`Fassung vom ${stempel(x.erstelltAm)} herunterladen`}>
          Download
        </Button>
      ),
    },
  ];
  return (
    <Card>
      <CardHead title="Erzeugte Fassungen" sub={versionen.length ? `${versionen.length} ${versionen.length === 1 ? "Fassung" : "Fassungen"}, neueste zuerst` : undefined} />
      {versionen.length ? (
        <DataTable rows={versionen} columns={columns} rowKey={(x) => x.id} label="Erzeugte Einverständniserklärungen" initialSort={{ key: "am", dir: "desc" }} compact />
      ) : (
        <EmptyState title="Noch keine Einverständniserklärung erzeugt" text="Die Fassungen erscheinen hier und im Reiter Dokumente." />
      )}
    </Card>
  );
}

function BauvorhabenForm({ project }: { project: Project }) {
  const { mutate } = useData();
  const toast = useToast();
  const id = useId();
  const [wert, setWert] = useState(project.bauvorhaben ?? "");
  const [busy, setBusy] = useState(false);
  const geaendert = wert.trim() !== (project.bauvorhaben ?? "");

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!geaendert || busy) return;
    setBusy(true);
    const res = await mutate((r) => r.setBauvorhaben(project.id, wert));
    setBusy(false);
    toast(res.ok ? "Bauvorhaben gespeichert" : res.error, res.ok ? "ok" : "danger");
  }

  return (
    <Card>
      <CardHead title="Bauvorhaben" sub="Steht im Kopf der Erklärung, z. B. „Neubau Einfamilienhaus mit Doppelgarage“." />
      <CardBody>
        <form className="edit-form pp-form ev-form" onSubmit={(ev) => void submit(ev)} noValidate>
          <Field label="Bezeichnung" htmlFor={`${id}-bv`} hint="Vorschläge beim Tippen; frei änderbar.">
            <Input id={`${id}-bv`} value={wert} maxLength={200} list={`${id}-vorschlaege`} onChange={(x) => setWert(x.target.value)} placeholder="Neubau Einfamilienhaus …" />
          </Field>
          <datalist id={`${id}-vorschlaege`}>
            {BAUVORHABEN_VORSCHLAEGE.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className="edit-actions">
            <Button type="submit" variant="primary" icon={<Save size={15} />} disabled={!geaendert || busy}>
              {busy ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function ArchitektForm({ architekt, data }: { architekt: TeamMember; data: Dataset }) {
  const { mutate } = useData();
  const toast = useToast();
  const id = useId();
  const start = { anrede: architekt.anrede ?? "", titel: architekt.titel ?? "", anschrift: architekt.anschrift ?? "", tel: architekt.tel ?? "", email: architekt.email ?? "" };
  const [v, setV] = useState(start);
  const [busy, setBusy] = useState(false);
  const geaendert = (Object.keys(start) as (keyof typeof start)[]).some((k) => v[k].trim() !== start[k]);
  const buero = data.buero;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!geaendert || busy) return;
    setBusy(true);
    const res = await mutate((r) =>
      r.saveArchitektAngaben(architekt.id, { anrede: v.anrede === "Herr" || v.anrede === "Frau" ? v.anrede : null, titel: v.titel, anschrift: v.anschrift, tel: v.tel, email: v.email }),
    );
    setBusy(false);
    toast(res.ok ? "Angaben des Architekten gespeichert" : res.error, res.ok ? "ok" : "danger");
  }

  const feld = (k: Exclude<keyof typeof start, "anrede">, label: string, opts: { type?: string; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={`${id}-${k}`}>
      <Input id={`${id}-${k}`} type={opts.type ?? "text"} value={v[k]} placeholder={opts.placeholder} onChange={(x) => setV({ ...v, [k]: x.target.value })} />
    </Field>
  );

  return (
    <Card>
      <CardHead title={`Entwurfsverfasser: ${architekt.name}`} sub="Gilt für alle Projekte dieses Architekten. Leere Anschrift, Tel. und E-Mail nehmen die Bürodaten (grau vorgeschlagen)." />
      <CardBody>
        <form className="edit-form pp-form ev-form" onSubmit={(ev) => void submit(ev)} noValidate>
          <div className="pp-grid">
            <Field label="Anrede" htmlFor={`${id}-anrede`} hint="Für „Herrn …“ bzw. „Frau …“ im Text">
              <Select
                id={`${id}-anrede`}
                value={v.anrede}
                onChange={(x) => setV({ ...v, anrede: x.target.value })}
                options={[
                  { value: "", label: "ohne" },
                  { value: "Herr", label: "Herr" },
                  { value: "Frau", label: "Frau" },
                ]}
              />
            </Field>
            {feld("titel", "Berufsbezeichnung", { placeholder: "z. B. Bachelor of Arts (BA), Freier Architekt" })}
            {feld("anschrift", "Anschrift", { placeholder: buero?.anschrift ?? "Straße 1, 12345 Ort" })}
            {feld("tel", "Tel.", { type: "tel", placeholder: buero?.tel ?? "" })}
            {feld("email", "E-Mail", { type: "email", placeholder: buero?.email ?? "" })}
          </div>
          <div className="edit-actions">
            <Button type="submit" variant="primary" icon={<Save size={15} />} disabled={!geaendert || busy}>
              {busy ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
