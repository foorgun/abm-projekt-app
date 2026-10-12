import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, CheckCircle2, Clock, FileText, ListTodo, Receipt, Workflow } from "lucide-react";
import { BarChart } from "../components/charts/BarChart";
import { InvoiceVolumeCard } from "../components/InvoiceVolumeCard";
import { PageHead } from "../components/layout/PageHead";
import { Button, buttonClass, Card, CardBody, CardHead, DataTable, EmptyState, ErrorState, Pill, Select, Skeleton, type Column, type Tone } from "../components/ui";
import { newProjectsPerMonth } from "../lib/dashboard";
import { formatRelative } from "../lib/format";
import { projectTitle } from "../lib/projects";
import { useSession } from "../lib/session";
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

/**
 * Auswertungen: was nicht täglich gebraucht wird und deshalb nicht mehr auf dem Dashboard steht
 * (neue Projekte pro Monat, Rechnungsvolumen, alle Aktivitäten mit Filter).
 */
export function Reports() {
  const { user } = useSession();
  const { data, loading, error, reload, today } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ActivityFilter>("alle");
  const [activityLimit, setActivityLimit] = useState(8);
  const staff = user.role !== "freiberufler";
  const projects = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);

  const head = (
    <PageHead
      title="Auswertungen"
      sub={staff ? "Neue Projekte, Rechnungsvolumen und alle Aktivitäten" : "Neue Projekte pro Monat"}
      actions={
        <Link to="/" className={buttonClass("ghost")}>
          <ArrowLeft size={15} aria-hidden /> Zum Dashboard
        </Link>
      }
    />
  );

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
  if (loading || !data) {
    return (
      <>
        {head}
        <Card aria-busy="true">
          <CardBody>
            <div className="stack">
              <Skeleton w="30%" h={14} />
              <Skeleton h={240} />
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  const months = newProjectsPerMonth(data.projects, today);

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
