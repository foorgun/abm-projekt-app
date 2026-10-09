import { useState, type ReactNode } from "react";
import { AlertTriangle, Bot, CircleAlert, ClipboardCheck, Download, FolderOpen, ListTodo, Plus, Receipt, Search, SlidersHorizontal } from "lucide-react";
import { BarChart, Legend } from "../components/charts/BarChart";
import { HBarChart } from "../components/charts/HBarChart";
import { LineChart } from "../components/charts/LineChart";
import { PageHead } from "../components/layout/PageHead";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHead,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  KpiCard,
  KpiSkeleton,
  Menu,
  Pill,
  Progress,
  Select,
  Skeleton,
  Stepper,
  Switch,
  Tabs,
  TableSkeleton,
  Tooltip,
  Trend,
  type Column,
  type StepperItem,
  type Tone,
} from "../components/ui";

// Alle Werte auf dieser Seite sind Beispielwerte zur Gestaltung, keine Projektdaten.

const TOKENS = [
  "--bg",
  "--sidebar",
  "--surface",
  "--surface-2",
  "--border",
  "--text",
  "--muted",
  "--accent",
  "--accent-soft",
  "--ok",
  "--warn",
  "--danger",
  "--info",
  "--chart-1",
  "--chart-2",
];

const MONTHS = [
  ["Nov", "November 2025", 4],
  ["Dez", "Dezember 2025", 2],
  ["Jan", "Januar 2026", 6],
  ["Feb", "Februar 2026", 5],
  ["Mär", "März 2026", 9],
  ["Apr", "April 2026", 7],
  ["Mai", "Mai 2026", 8],
  ["Jun", "Juni 2026", 5],
  ["Jul", "Juli 2026", 6],
  ["Aug", "August 2026", 3],
  ["Sep", "September 2026", 7],
  ["Okt", "Oktober 2026", 4],
] as const;

const PHASES = [
  { label: "Plangespräch", value: 6 },
  { label: "Vertrag versendet", value: 4 },
  { label: "Vertrag zurück", value: 9 },
  { label: "Übergabe Baugesuch", value: 12 },
  { label: "Genehmigung", value: 7 },
];

interface Row {
  id: string;
  project: string;
  event: string;
  tone: Tone;
  status: string;
  who: string;
  when: string;
  done: number;
}

const ROWS: Row[] = [
  { id: "1", project: "8161-101 · Reinhardt", event: "Baugenehmigung eingetragen", tone: "ok", status: "Erledigt", who: "Mehmet Cetin", when: "vor 12 Min.", done: 5 },
  { id: "2", project: "8260-041 · Engelhardt", event: "Lageplan abgelegt", tone: "accent", status: "Agent", who: "Agent", when: "vor 40 Min.", done: 2 },
  { id: "3", project: "8185-023 · Scholz", event: "Rechnung fällig", tone: "danger", status: "Offen", who: "System", when: "heute, 08:02", done: 1 },
  { id: "4", project: "Bauvoranfrage · Winter", event: "Zuordnung unsicher", tone: "warn", status: "Prüfen", who: "Agent", when: "gestern", done: 3 },
];

const COLUMNS: Column<Row>[] = [
  { key: "project", header: "Projekt", render: (r) => r.project, sortValue: (r) => r.project, strong: true },
  { key: "event", header: "Ereignis", render: (r) => r.event },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <Pill tone={r.tone}>{r.status}</Pill>
    ),
    sortValue: (r) => r.status,
  },
  { key: "progress", header: "Fortschritt", render: (r) => <Progress done={r.done} total={5} />, sortValue: (r) => r.done },
  { key: "who", header: "Wer", render: (r) => r.who },
  { key: "when", header: "Zeit", render: (r) => <span className="muted">{r.when}</span>, align: "right" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHead title={title} />
      <CardBody>
        <div className="sg-section">{children}</div>
      </CardBody>
    </Card>
  );
}

export function Styleguide() {
  const [tab, setTab] = useState<"alle" | "aktiv" | "abgeschlossen">("aktiv");
  const [seg, setSeg] = useState<"heute" | "woche" | "ueberfaellig" | "alle">("heute");
  const [on, setOn] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [steps, setSteps] = useState<StepperItem[]>([
    { key: "plangespraech", label: "Plangespräch", date: "2026-01-12" },
    { key: "vertrag_versendet", label: "Vertrag versendet", date: "2026-01-20" },
    { key: "vertrag_zurueck", label: "Vertrag zurück", date: null },
    { key: "baugesuch_uebergabe", label: "Übergabe Baugesuch", date: "2026-03-02" },
    { key: "baugenehmigung", label: "Genehmigung", date: null },
    { key: "baufreigabe", label: "Baufreigabe", date: null },
  ]);

  return (
    <>
      <PageHead
        eyebrow="Design-System"
        title="Styleguide"
        sub="Tokens und Grundkomponenten der ABM Projekt-App. Alle Werte hier sind Beispielwerte."
        actions={
          <>
            <Button icon={<SlidersHorizontal size={15} />}>Filter</Button>
            <Button icon={<Download size={15} />}>Exportieren</Button>
          </>
        }
      />

      <div className="stack">
        <div className="grid-kpi">
          <KpiCard icon={<FolderOpen size={16} />} label="Aktive Projekte" value="38" trend={<Trend value={4} good />} foot="4 mehr als im Vormonat" info="Projekte mit Status aktiv" />
          <KpiCard icon={<ListTodo size={16} />} label="Offene Aufgaben" value="17" tone="warn" foot="davon 3 überfällig" />
          <KpiCard icon={<Receipt size={16} />} label="Offene Rechnungen" value="13.500 €" tone="danger" valueTone="danger" foot="2 Rechnungen nicht versendet" />
          <KpiCard icon={<Bot size={16} />} label="Zur Prüfung" value="5" tone="info" trend={<Trend value={-2} good />} foot="Posteingang-Agent, seit gestern" />
        </div>

        <div className="grid-2">
          <Card>
            <CardHead title="Neue Projekte pro Monat" sub="Letzte 12 Monate" />
            <CardBody>
              <BarChart
                caption="Neue Projekte pro Monat"
                series={[{ name: "Neue Projekte" }]}
                highlight={MONTHS.length - 1}
                data={MONTHS.map(([label, title, v]) => ({ label, title, values: [v] }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHead title="Projekte nach Phase" sub="Nur aktive Projekte" />
            <CardBody>
              <HBarChart caption="Projekte nach Phase" data={PHASES} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHead
            title="Letzte Aktivitäten"
            actions={
              <Select
                aria-label="Aktivitäten filtern"
                options={[
                  { value: "alle", label: "Alle Aktivitäten" },
                  { value: "schritt", label: "Schritt erledigt" },
                  { value: "datei", label: "Datei abgelegt" },
                ]}
              />
            }
          />
          <CardBody flush>
            <DataTable label="Letzte Aktivitäten" rows={ROWS} columns={COLUMNS} rowKey={(r) => r.id} onRowClick={() => {}} />
          </CardBody>
        </Card>

        <Section title="Prozess-Stepper">
          <Stepper items={steps} onChangeDate={(key, date) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, date } : x)))} />
          <p className="muted">Datum anklicken zum Bearbeiten. Gestrichelt = fehlt noch, obwohl ein späterer Schritt erledigt ist.</p>
        </Section>

        <div className="grid-2">
          <Section title="Diagramme: gestapelt und Linie">
            <Legend series={[{ name: "Automatisch abgelegt" }, { name: "Zur Prüfung" }]} />
            <BarChart
              caption="Verarbeitete Anhänge pro Tag"
              height={200}
              series={[{ name: "Automatisch abgelegt" }, { name: "Zur Prüfung" }]}
              data={[
                ["Mo", 12, 3],
                ["Di", 9, 2],
                ["Mi", 15, 4],
                ["Do", 7, 1],
                ["Fr", 11, 5],
                ["Sa", 2, 0],
                ["So", 0, 1],
              ].map(([l, a, b]) => ({ label: String(l), values: [Number(a), Number(b)] }))}
            />
            <LineChart
              caption="Trefferquote"
              name="Abgelegte Anhänge"
              height={180}
              data={[3, 7, 6, 11, 9, 14, 12].map((v, i) => ({ label: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][i], value: v }))}
            />
          </Section>

          <div className="stack">
            <Section title="Buttons">
              <div className="sg-row">
                <Button variant="primary" icon={<Plus size={16} />}>
                  Neues Projekt
                </Button>
                <Button>Abbrechen</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Ignorieren</Button>
                <Button size="sm">Klein</Button>
                <IconButton label="Suchen" variant="default">
                  <Search size={16} />
                </IconButton>
                <Button disabled>Deaktiviert</Button>
              </div>
              <div className="sg-row">
                <Menu
                  align="left"
                  items={[
                    { label: "Als versendet markieren", icon: <Receipt size={14} />, onSelect: () => {} },
                    "sep",
                    { label: "Aufgabe anlegen", icon: <ListTodo size={14} />, onSelect: () => {} },
                  ]}
                  trigger={(p) => <Button {...p}>Menü öffnen</Button>}
                />
                <Button onClick={() => setDialog(true)}>Dialog öffnen</Button>
                <Tooltip content="Tooltip mit kurzem Hinweis">
                  <Button variant="ghost">Tooltip (Hover/Fokus)</Button>
                </Tooltip>
              </div>
            </Section>

            <Section title="Status-Pills, Badges, Trends">
              <div className="sg-row">
                <Pill tone="ok">Abgelegt</Pill>
                <Pill tone="warn">Zur Prüfung</Pill>
                <Pill tone="danger">Fehler</Pill>
                <Pill tone="info">Versendet</Pill>
                <Pill tone="accent">Aktiv</Pill>
                <Pill>Ignoriert</Pill>
                <Pill tone="outline" dot={false}>
                  Baugenehmigung
                </Pill>
              </div>
              <div className="sg-row">
                <Badge tone="accent">4</Badge>
                <Badge tone="warn">5</Badge>
                <Badge tone="danger">2</Badge>
                <Badge>12</Badge>
                <Trend value={12} suffix=" %" good />
                <Trend value={-8} suffix=" %" good />
                <Progress done={3} total={12} />
              </div>
            </Section>

            <Section title="Tabs">
              <Tabs
                label="Projektfilter"
                value={tab}
                onChange={setTab}
                items={[
                  { key: "alle", label: "Alle", count: 52 },
                  { key: "aktiv", label: "Aktiv", count: 38 },
                  { key: "abgeschlossen", label: "Abgeschlossen", count: 14 },
                ]}
              />
              <Tabs
                label="Zeitraum"
                variant="segmented"
                value={seg}
                onChange={setSeg}
                items={[
                  { key: "heute", label: "Heute" },
                  { key: "woche", label: "Diese Woche" },
                  { key: "ueberfaellig", label: "Überfällig" },
                  { key: "alle", label: "Alle" },
                ]}
              />
            </Section>
          </div>
        </div>

        <Section title="Formular">
          <div className="sg-form">
            <Field label="Bauherr" htmlFor="sg-bauherr">
              <Input id="sg-bauherr" placeholder="Nachname" />
            </Field>
            <Field label="Suche" htmlFor="sg-suche" hint="Mit Icon">
              <Input id="sg-suche" icon={<Search size={15} />} placeholder="ABM-Nr. oder Ort" />
            </Field>
            <Field label="Firma" htmlFor="sg-firma">
              <Select
                id="sg-firma"
                options={[
                  { value: "", label: "Alle Firmen" },
                  { value: "bz", label: "Bien-Zenker" },
                  { value: "lh", label: "Living Haus" },
                ]}
              />
            </Field>
            <Field label="Fällig am" htmlFor="sg-datum">
              <Input id="sg-datum" type="date" defaultValue="2026-10-14" />
            </Field>
          </div>
          <div className="sg-row">
            <Checkbox label="Stornierte einblenden" />
            <Switch checked={on} onChange={setOn} label="Postfach aktiv" />
            <span className="muted">Postfach {on ? "aktiv" : "pausiert"}</span>
          </div>
        </Section>

        <Section title="Warnungen">
          <div className="banner" data-tone="danger" role="status">
            <AlertTriangle size={16} aria-hidden />
            <div className="banner-text">
              <span className="banner-title">Rechnung nicht versendet: Abschlag Genehmigungsplanung</span>
              <span className="banner-detail">10.000 € · 42 Tage seit Fälligkeit</span>
            </div>
            <Button size="sm">Als versendet markieren</Button>
          </div>
          <div className="banner" data-tone="warn" role="status">
            <CircleAlert size={16} aria-hidden />
            <div className="banner-text">
              <span className="banner-title">ABM-Vertrag noch nicht zurück</span>
              <span className="banner-detail">25 Tage seit Versand</span>
            </div>
          </div>
        </Section>

        <div className="grid-2">
          <Card>
            <CardHead title="Leer" />
            <EmptyState
              icon={<ClipboardCheck size={18} />}
              title="Keine offenen Prüfungen"
              text="Der Agent hat alle Anhänge sicher zugeordnet."
              action={<Button size="sm">Jetzt prüfen</Button>}
            />
          </Card>
          <Card>
            <CardHead title="Fehler" />
            <ErrorState onRetry={() => {}} />
          </Card>
        </div>

        <Section title="Laden">
          <div className="grid-kpi">
            <KpiSkeleton />
            <KpiSkeleton />
          </div>
          <Skeleton w="60%" />
          <TableSkeleton rows={3} cols={4} />
        </Section>

        <Section title="Farben (Tokens)">
          <div className="sg-swatches">
            {TOKENS.map((t) => (
              <div className="sg-swatch" key={t}>
                <div className="sg-swatch-chip" style={{ background: `var(${t})` }} />
                <code>{t}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typografie (Inter)">
          <div className="sg-type">
            <div className="kpi-value">
              <span>28</span>Seitentitel und Kennzahlen
            </div>
            <div style={{ fontSize: "var(--fs-20)", fontWeight: 600 }}>
              <span>20</span>Seitentitel mobil
            </div>
            <h2>
              <span>16</span>Kartentitel
            </h2>
            <p>
              <span>14</span>Fließtext und Navigation
            </p>
            <p style={{ fontSize: "var(--fs-13)" }}>
              <span>13</span>Tabellen und Formulare
            </p>
            <p style={{ fontSize: "var(--fs-12)" }} className="muted">
              <span>12</span>Beschriftungen, Pills, Achsen
            </p>
          </div>
        </Section>
      </div>

      {dialog && (
        <Dialog
          title="Neue Aufgabe"
          onClose={() => setDialog(false)}
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Abbrechen</Button>
              <Button variant="primary" onClick={() => setDialog(false)}>
                Anlegen
              </Button>
            </>
          }
        >
          <Field label="Titel" htmlFor="sg-dlg-title">
            <Input id="sg-dlg-title" placeholder="Was ist zu tun?" />
          </Field>
          <Field label="Fällig am" htmlFor="sg-dlg-due">
            <Input id="sg-dlg-due" type="date" />
          </Field>
        </Dialog>
      )}
    </>
  );
}
