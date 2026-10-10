import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, CheckCircle2, Clock, FileText, FolderOpen, ListTodo, Receipt, ShieldAlert, Workflow } from "lucide-react";
import { AlertList } from "../components/AlertList";
import { BarChart } from "../components/charts/BarChart";
import { HBarChart } from "../components/charts/HBarChart";
import { InvoiceVolumeCard } from "../components/InvoiceVolumeCard";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DataTable,
  EmptyState,
  ErrorState,
  KpiCard,
  KpiSkeleton,
  Pill,
  Select,
  Skeleton,
  TableSkeleton,
  type Column,
  type Tone,
} from "../components/ui";
import type { Alert } from "../lib/alerts";
import { unsentInvoiceTotal } from "../lib/alerts";
import { newProjectsPerMonth, projectsByPhase } from "../lib/dashboard";
import { formatLongDate, formatMoney, formatRelative } from "../lib/format";
import { greeting } from "../lib/greeting";
import { projectTitle } from "../lib/projects";
import { firstName, useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Activity, ActivityKind } from "../lib/types";

const KIND: Record<ActivityKind, { label: string; tone: Tone; icon: typeof FileText }> = {
  schritt: { label: "Schritt", tone: "ok", icon: CheckCircle2 },
  datei: { label: "Datei", tone: "accent", icon: FileText },
  agent: { label: "Agent", tone: "info", icon: Bot },
  rechnung: { label: "Rechnung", tone: "warn", icon: Receipt },
  aufgabe: { label: "Aufgabe", tone: "neutral", icon: ListTodo },
  projekt: { label: "Projekt", tone: "outline", icon: Workflow },
};

type ActivityFilter = "alle" | ActivityKind;

const ALERT_LIMIT = 6;

export function Dashboard() {
  const { user } = useSession();
  const { data, loading, error, reload, alerts, allAlerts, today, dueTaskCount, reviewCount, mutate } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<ActivityFilter>("alle");
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [activityLimit, setActivityLimit] = useState(8);
  const staff = user.role !== "freiberufler";

  const projects = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);

  const head = <PageHead title={`${greeting()}, ${firstName(user)}`} sub={formatLongDate(today)} />;

  if (error) {
    return (
      <>
        {head}
        <Card>
          <ErrorState message={error} onRetry={() => void reload()} />
        </Card>
      </>
    );
  }

  if (loading || !data) return <DashboardSkeleton head={head} />;

  // ---------------------------------------------------------------- Kennzahlen
  const active = data.projects.filter((p) => p.status === "aktiv");
  const months = newProjectsPerMonth(data.projects, today);
  const thisMonth = months[months.length - 1].count;
  const lastMonth = months[months.length - 2].count;
  const openTasks = data.tasks.filter((t) => t.status === "offen");
  const overdue = openTasks.filter((t) => t.dueOn && t.dueOn < today).length;
  // Geldsumme aus allen Warnungen: eine erledigte Aufgabe soll offenes Geld nicht unsichtbar machen
  const unsentAlerts = allAlerts.filter((a) => a.kind === "invoice_unsent");
  const unsentSum = unsentInvoiceTotal(allAlerts, data);
  const phases = projectsByPhase(data.projects, data.stepDefinitions);

  async function markSent(a: Alert) {
    const res = await mutate((r) => r.markInvoiceSent(a.invoiceId!, today));
    toast(res.ok ? "Rechnung als versendet markiert" : res.error, res.ok ? "ok" : "danger");
  }

  // ---------------------------------------------------------------- Aktivitäten
  const activities = data.activities.filter((a) => filter === "alle" || a.kind === filter);
  const columns: Column<Activity>[] = [
    {
      key: "project",
      header: "Projekt",
      strong: true,
      render: (a) => {
        const p = a.projectId ? projects.get(a.projectId) : null;
        return p ? projectTitle(p) : "–";
      },
      sortValue: (a) => (a.projectId ? projects.get(a.projectId)?.bauherrLabel ?? "" : ""),
    },
    {
      key: "event",
      header: "Ereignis",
      render: (a) => (
        <span className="event-text" title={a.text}>
          {a.text}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Art",
      render: (a) => <Pill tone={KIND[a.kind].tone}>{KIND[a.kind].label}</Pill>,
      sortValue: (a) => KIND[a.kind].label,
    },
    { key: "who", header: "Wer", render: (a) => a.actor, sortValue: (a) => a.actor },
    {
      key: "at",
      header: "Zeit",
      align: "right",
      render: (a) => (
        <time className="muted" dateTime={a.at} title={a.at.replace("T", " ")}>
          {formatRelative(a.at)}
        </time>
      ),
      sortValue: (a) => a.at,
    },
  ];

  return (
    <>
      {head}
      <div className="dash-grid">
        <div className="grid-kpi">
          <KpiCard
            icon={<FolderOpen size={16} />}
            label="Aktive Projekte"
            value={active.length}
            foot={`${thisMonth} neu im ${months[months.length - 1].title.split(" ")[0]}, ${lastMonth} im Vormonat`}
            info="Projekte mit Status aktiv."
            to="/projekte/aktiv"
          />
          {staff ? (
            <>
              <KpiCard
                icon={<ListTodo size={16} />}
                tone="warn"
                label="Offene Aufgaben"
                value={openTasks.length}
                foot={overdue ? `davon ${overdue} überfällig` : `${dueTaskCount} heute fällig`}
                to="/aufgaben"
              />
              <KpiCard
                icon={<Receipt size={16} />}
                tone="danger"
                label="Offene Rechnungen"
                value={formatMoney(unsentSum)}
                valueTone={unsentSum > 0 ? "danger" : undefined}
                foot={`${unsentAlerts.length} ${unsentAlerts.length === 1 ? "Rechnung" : "Rechnungen"} nicht versendet`}
                info="Fällige Rechnungen, die noch nicht versendet wurden."
                to="/rechnungen"
              />
              <KpiCard
                icon={<Bot size={16} />}
                tone="info"
                label="Zur Prüfung"
                value={reviewCount}
                foot="Posteingangs-Agent"
                info="Anhänge, die der Agent nicht sicher zuordnen konnte."
                to="/agent/pruefung"
              />
            </>
          ) : (
            <KpiCard icon={<ShieldAlert size={16} />} tone="warn" label="Warnungen" value={alerts.length} foot="in deinen Projekten" />
          )}
        </div>

        <Card>
          <CardHead
            title="Handlungsbedarf"
            sub={alerts.length ? `${alerts.length} ${alerts.length === 1 ? "Warnung" : "Warnungen"}, nach Dringlichkeit sortiert` : undefined}
          />
          <div className="card-body flush">
            {alerts.length ? (
              <>
                <AlertList alerts={alerts} projects={projects} onMarkSent={staff ? markSent : undefined} limit={showAllAlerts ? undefined : ALERT_LIMIT} />
                {alerts.length > ALERT_LIMIT && (
                  <div className="card-foot">
                    <Button variant="ghost" size="sm" onClick={() => setShowAllAlerts((v) => !v)}>
                      {showAllAlerts ? "Weniger anzeigen" : `Alle ${alerts.length} anzeigen`}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={<CheckCircle2 size={18} />} title="Alles im grünen Bereich" text="Keine offenen Rechnungen, Verträge oder Fristen." />
            )}
          </div>
        </Card>

        <div className="grid-2">
          <Card>
            <CardHead title="Neue Projekte pro Monat" sub="Eingang der letzten 12 Monate" />
            <CardBody>
              <BarChart
                caption="Neue Projekte pro Monat"
                series={[{ name: "Neue Projekte" }]}
                height={280}
                highlight={months.length - 1}
                showValues
                data={months.map((m) => ({ label: m.label, title: m.title, values: [m.count] }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHead title="Projekte nach Phase" sub="Aktive Projekte, letzter erledigter Schritt" />
            <CardBody>
              {phases.length ? (
                <HBarChart caption="Projekte nach Phase" data={phases} rowHeight={22} />
              ) : (
                <EmptyState title="Keine aktiven Projekte" />
              )}
            </CardBody>
          </Card>
        </div>

        {/* Rechnungsvolumen: zusätzliche Karte in voller Breite, nur für Mitarbeiter (Freiberufler sehen keine Rechnungen) */}
        {staff && <InvoiceVolumeCard invoices={data.invoices} today={today} height={220} />}

        {staff && (
          <Card>
            <CardHead
              title="Letzte Aktivitäten"
              actions={
                <Select
                  aria-label="Aktivitäten filtern"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as ActivityFilter)}
                  options={[
                    { value: "alle", label: "Alle Aktivitäten" },
                    { value: "schritt", label: "Schritt erledigt" },
                    { value: "datei", label: "Datei abgelegt" },
                    { value: "agent", label: "Vom Agenten abgelegt" },
                    { value: "rechnung", label: "Rechnung versendet" },
                    { value: "aufgabe", label: "Aufgaben" },
                  ]}
                />
              }
            />
            <div className="card-body flush">
              {activities.length ? (
                <>
                  <DataTable
                    label="Letzte Aktivitäten"
                    rows={activities.slice(0, activityLimit)}
                    columns={columns}
                    rowKey={(a) => a.id}
                    onRowClick={(a) => a.projectId && navigate(`/projekte/${a.projectId}`)}
                  />
                  {activities.length > activityLimit && (
                    <div className="card-foot">
                      <Button variant="ghost" size="sm" icon={<Clock size={14} />} onClick={() => setActivityLimit((n) => n + 12)}>
                        Ältere anzeigen
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState title="Keine Aktivitäten" text="Für diesen Filter gibt es noch keine Einträge." action={<Button size="sm" onClick={() => setFilter("alle")}>Filter zurücksetzen</Button>} />
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function DashboardSkeleton({ head }: { head: React.ReactNode }) {
  return (
    <>
      {head}
      <div className="dash-grid" aria-busy="true">
        <div className="grid-kpi">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <Card>
          <CardBody>
            <div className="stack">
              <Skeleton w="25%" h={14} />
              <Skeleton h={44} />
              <Skeleton h={44} />
            </div>
          </CardBody>
        </Card>
        <div className="grid-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardBody>
                <div className="stack">
                  <Skeleton w="40%" h={14} />
                  <Skeleton h={240} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
        <Card>
          <CardBody>
            <Skeleton w="30%" h={14} />
          </CardBody>
          <TableSkeleton rows={5} cols={4} />
        </Card>
      </div>
    </>
  );
}
