import { useMemo, useState, type ReactNode } from "react";
import { Download, Drill } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { Button, Card, CardBody, CardHead, DataTable, EmptyState, Pill, type Column } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { BAUGRUND_ORDNER, bauadresse, baugrundDaten, fehlendeAngaben, kontaktZeile } from "../../lib/baugrundauftrag/daten";
import { baugrundauftragErzeugen } from "../../lib/baugrundauftrag/erzeugen";
import { brauchtBaugrundauftrag } from "../../lib/baugrundauftrag/vorlagen";
import { dateiSpeichern } from "../../lib/planungsprotokoll/erzeugen";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import type { Baugrundauftrag, Dataset, Project } from "../../lib/types";

/**
 * Karte "Baugrundauftrag Clayton" im Reiter Planungsprotokoll, nur bei Schwabenhaus (bei Bien-Zenker und Living Haus ist
 * das Gutachten im Hauspreis) und nur für Admin und Mitarbeiter (das PDF enthält Kontaktdaten der Bauherren).
 * Füllt das Auftragsformular und die Anlage A aus den Projektdaten, legt das PDF ab und listet die Fassungen.
 * Die App versendet nichts: der Kunde unterschreibt, ABM schickt den Auftrag selbst an Clayton.
 */
export function ClaytonAuftrag({ project, data }: { project: Project; data: Dataset }) {
  const { user } = useSession();
  const firma = data.companies.find((c) => c.id === project.companyId)?.name;
  if (user.role === "freiberufler" || !brauchtBaugrundauftrag(firma)) return null;
  return <Karte project={project} data={data} />;
}

function Karte({ project, data }: { project: Project; data: Dataset }) {
  const { repo, mutate } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const d = useMemo(() => baugrundDaten(data, project.id), [data, project.id]);
  const fehlt = fehlendeAngaben(d);
  const versionen = (data.baugrundauftraege ?? []).filter((x) => x.projectId === project.id);

  async function erzeugen() {
    if (busy) return;
    setBusy(true);
    setFehler(null);
    try {
      const datei = await baugrundauftragErzeugen(repo, data, project);
      const res = await mutate((r) => r.saveBaugrundauftrag({ projectId: project.id, fileName: datei.fileName, blob: datei.blob }));
      if (!res.ok) setFehler(res.error);
      else toast("Baugrundauftrag erzeugt", "ok", `${datei.fileName} liegt im Ordner „${BAUGRUND_ORDNER}“.`);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const a = d.auftraggeber;
  const h = d.hersteller;
  return (
    <Card>
      <CardHead
        title="Baugrundauftrag Clayton"
        sub="Bei Schwabenhaus beauftragt ABM das Baugrundgutachten für den Kunden. Auftragsformular und Anlage A werden aus den Projektdaten befüllt; ankreuzen und unterschreiben macht der Kunde."
        icon={<Drill size={16} />}
      />
      <CardBody>
        <div className="pp-start">
          <dl className="dl ev-vorschau" aria-label="Vorschau Baugrundauftrag">
            <Zeile label="Auftraggeber">{zeilen([a.namen, a.strasse, a.plzOrt])}</Zeile>
            <Zeile label="Kontakt Bauherr">{kontaktZeile(d)}</Zeile>
            <Zeile label="Haushersteller">{zeilen([h.firma, h.projektNr && `Projektnummer: ${h.projektNr}`, h.ansprechpartner && `Ansprechpartner: ${h.ansprechpartner}`, h.email])}</Zeile>
            <Zeile label="Planer">{zeilen([d.planer.name, d.planer.tel && `Tel.: ${d.planer.tel}`, d.planer.email && `E-Mail: ${d.planer.email}`])}</Zeile>
            <Zeile label="Bauort">{zeilen([bauadresse(d), d.bauort.gemarkung && `Gemarkung ${d.bauort.gemarkung}`, d.bauort.flurstueck && `Flurstück: ${d.bauort.flurstueck}`])}</Zeile>
            <Zeile label="Keller/Bodenplatte">{d.keller}</Zeile>
            <Zeile label="Versand Gutachten">{a.email ? "per E-Mail (angekreuzt)" : null}</Zeile>
          </dl>

          <p className="pp-stand" role="status">
            {fehlt.length ? (
              <>
                Noch leer: {fehlt.join(", ")}. <span className="muted">Bauherr, Bauort und Hausbau-Nr. stehen unter </span>
                <Link to={`/projekte/${project.id}`}>Übersicht</Link>
                <span className="muted">, Kellerbauer und getrennte Anschrift weiter unten bei den Angaben. Erzeugen geht trotzdem; leere Felder füllt der Kunde aus.</span>
              </>
            ) : (
              "Alle Angaben sind vorhanden."
            )}
          </p>

          <div className="pp-actions">
            <Button variant="primary" icon={<Drill size={15} />} disabled={busy} onClick={() => void erzeugen()}>
              {busy ? "Wird erzeugt …" : "Baugrundauftrag erzeugen"}
            </Button>
          </div>
          <p className="field-hint">
            Ein PDF: Auftrag (3 Seiten) mit Anlage A, Felder bleiben ausfüllbar. Formular-Nr., Anzahl Sondierungen und Preise bleiben wie von Clayton vorgegeben. Jede Fassung wird neu im Ordner „{BAUGRUND_ORDNER}“ abgelegt, nichts wird überschrieben und nichts versendet.
          </p>
          {fehler && (
            <p className="form-error" role="alert">
              {fehler}
            </p>
          )}
        </div>
      </CardBody>
      <Versionen versionen={versionen} data={data} />
    </Card>
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

function Versionen({ versionen, data }: { versionen: Baugrundauftrag[]; data: Dataset }) {
  const { repo } = useData();
  const toast = useToast();
  const name = (x: Baugrundauftrag) => data.documents.find((d) => d.id === x.dokumentId)?.name ?? "Baugrundauftrag_Clayton.pdf";

  async function laden(x: Baugrundauftrag) {
    try {
      dateiSpeichern(await repo.baugrundauftragDatei(x), name(x));
    } catch (err) {
      toast("Download nicht möglich", "danger", err instanceof Error ? err.message : String(err));
    }
  }

  const columns: Column<Baugrundauftrag>[] = [
    { key: "am", header: "Erzeugt", strong: true, render: (x) => stempel(x.erstelltAm), sortValue: (x) => x.erstelltAm },
    { key: "von", header: "Erstellt von", render: (x) => x.erstelltVon ?? "–" },
    {
      key: "dl",
      header: <span className="sr-only">Download</span>,
      align: "right",
      render: (x) => (
        <Button size="sm" icon={<Download size={14} />} onClick={() => void laden(x)} aria-label={`Baugrundauftrag vom ${stempel(x.erstelltAm)} herunterladen`}>
          Download
        </Button>
      ),
    },
  ];
  return versionen.length ? (
    <DataTable rows={versionen} columns={columns} rowKey={(x) => x.id} label="Erzeugte Baugrundaufträge" initialSort={{ key: "am", dir: "desc" }} compact />
  ) : (
    <EmptyState title="Noch kein Baugrundauftrag erzeugt" text="Die Fassungen erscheinen hier und im Reiter Dokumente." />
  );
}
