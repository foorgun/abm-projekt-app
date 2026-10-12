import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { BarChart } from "../components/charts/BarChart";
import { InvoiceVolumeCard } from "../components/InvoiceVolumeCard";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, CardBody, CardHead, DataTable, EmptyState, ErrorState, Pill, Select, Skeleton, type Column, type Tone } from "../components/ui";
import type { Alert } from "../lib/alerts";
import { SEVERITY_LABEL } from "../lib/alertUi";
import { newProjectsPerMonth, projectsByPhase, todayGroups, TODO_GROUP_LIMIT, type TodoGroup, type TodoItem } from "../lib/dashboard";
import { formatDue, formatLongDate, formatMoney, formatRelative } from "../lib/format";
import { greeting } from "../lib/greeting";
import { invoiceKpis } from "../lib/invoiceStats";
import { projectTitle } from "../lib/projects";
import { firstName, useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Activity, ActivityKind, Dataset, Project, Task } from "../lib/types";

const KIND: Record<ActivityKind, { label: string; tone: Tone }> = {
  schritt: { label: "Schritt", tone: "ok" },
  datei: { label: "Datei", tone: "accent" },
  agent: { label: "Agent", tone: "info" },
  rechnung: { label: "Rechnung", tone: "warn" },
  aufgabe: { label: "Aufgabe", tone: "neutral" },
  projekt: { label: "Projekt", tone: "outline" },
};

type ActivityFilter = "alle" | ActivityKind;

const MORE_KEY = "abm.dashboard.mehr";

function readMoreOpen(): boolean {
  try {
    return localStorage.getItem(MORE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Dashboard, reduziert: "Heute zu tun", Projekte nach Phase und Rechnungen.
 * Diagramme und Aktivitäten liegen eingeklappt unter "Mehr".
 */
export function Dashboard() {
  const { user } = useSession();
  const { data, loading, error, reload, alerts, allAlerts, today, mutate } = useData();
  const toast = useToast();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(readMoreOpen);
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

  const activeCount = data.projects.filter((p) => p.status === "aktiv").length;
  const phases = projectsByPhase(data.projects, data.stepDefinitions);
  // Geldsummen aus allen Warnungen: eine erledigte Aufgabe soll offenes Geld nicht unsichtbar machen
  const money = invoiceKpis(data.invoices, allAlerts, today);
  const groups = todayGroups({ tasks: data.tasks, alerts, attachments: staff ? data.inboxAttachments : [], today });
  const todoCount = groups.reduce((n, g) => n + g.items.length, 0);

  async function markSent(a: Alert) {
    const res = await mutate((r) => r.markInvoiceSent(a.invoiceId!, today));
    toast(res.ok ? "Rechnung als versendet markiert" : res.error, res.ok ? "ok" : "danger");
  }

  async function completeTask(t: Task) {
    const res = await mutate((r) => r.updateTask(t.id, { status: "erledigt" }));
    toast(res.ok ? "Aufgabe erledigt" : res.error, res.ok ? "ok" : "danger");
  }

  function toggleMore() {
    const next = !moreOpen;
    setMoreOpen(next);
    try {
      localStorage.setItem(MORE_KEY, next ? "1" : "0");
    } catch {
      // ohne Speicher bleibt der Bereich beim nächsten Besuch eingeklappt
    }
  }

  return (
    <>
      {head}
      <div className="dash">
        <section className="dash-section" aria-labelledby="dash-phasen">
          <h2 className="dash-label" id="dash-phasen">
            Projekte nach Phase
          </h2>
          <div className="phase-strip">
            <Link to="/projekte/aktiv" className="phase-stat phase-stat-total">
              <span className="phase-stat-value">{activeCount}</span>
              <span className="phase-stat-label">aktiv</span>
            </Link>
            {phases.map((ph) => (
              <Link key={ph.key} to={`/projekte/aktiv?phase=${encodeURIComponent(ph.key)}`} className="phase-stat" title={`${ph.value} ${ph.value === 1 ? "Projekt" : "Projekte"} in Phase ${ph.label}`}>
                <span className="phase-stat-value">{ph.value}</span>
                <span className="phase-stat-label">{ph.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {staff && (
          <section className="dash-section" aria-labelledby="dash-rechnungen">
            <h2 className="dash-label" id="dash-rechnungen">
              Rechnungen
            </h2>
            <div className="money-row">
              <Link to="/rechnungen?reiter=nicht-versendet" className="money-stat" data-alert={money.unsentCount > 0}>
                <span className="money-stat-label">Nicht versendet</span>
                <span className="money-stat-value">{formatMoney(money.unsentCents)}</span>
                <span className="money-stat-sub">{money.unsentCount === 1 ? "1 fällige Rechnung" : `${money.unsentCount} fällige Rechnungen`}</span>
              </Link>
              <Link to="/rechnungen?reiter=versendet" className="money-stat">
                <span className="money-stat-label">Offen</span>
                <span className="money-stat-value">{formatMoney(money.sentOpenCents)}</span>
                <span className="money-stat-sub">{money.sentOpenCount} versendet, noch nicht bezahlt</span>
              </Link>
            </div>
          </section>
        )}

        <section className="dash-section" aria-labelledby="dash-todo">
          <h2 className="dash-label" id="dash-todo">
            Heute zu tun{todoCount > 0 && <span className="dash-label-count">{todoCount}</span>}
          </h2>
          {groups.length ? (
            groups.map((g) => (
              <TodoGroupView
                key={g.key}
                group={g}
                data={data}
                projects={projects}
                today={today}
                showAll={expanded.has(g.key)}
                onToggleAll={() => setExpanded((s) => new Set(s.has(g.key) ? [...s].filter((k) => k !== g.key) : [...s, g.key]))}
                onMarkSent={staff ? markSent : undefined}
                onComplete={staff ? completeTask : undefined}
              />
            ))
          ) : (
            <p className="dash-calm">
              <Check size={16} aria-hidden /> Alles erledigt. Für heute steht nichts an.
            </p>
          )}
        </section>

        <section className="dash-section dash-more">
          <button type="button" className="dash-more-toggle" aria-expanded={moreOpen} aria-controls="dash-mehr" onClick={toggleMore}>
            {moreOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            Mehr
            <span className="dash-more-hint">{staff ? "Neue Projekte, Rechnungsvolumen, letzte Aktivitäten" : "Neue Projekte pro Monat"}</span>
          </button>
          <div id="dash-mehr" hidden={!moreOpen}>
            {moreOpen && <DashboardMore data={data} projects={projects} today={today} staff={staff} />}
          </div>
        </section>
      </div>
    </>
  );
}

const SEVERITY_DOT = { dringend: "danger", hinweis: "warn", info: "info" } as const;

function TodoGroupView({
  group,
  data,
  projects,
  today,
  showAll,
  onToggleAll,
  onMarkSent,
  onComplete,
}: {
  group: TodoGroup;
  data: Dataset;
  projects: Map<string, Project>;
  today: string;
  showAll: boolean;
  onToggleAll: () => void;
  onMarkSent?: (a: Alert) => void;
  onComplete?: (t: Task) => void;
}) {
  const shown = showAll ? group.items : group.items.slice(0, TODO_GROUP_LIMIT);
  const row = (it: TodoItem) => {
    if (it.type === "task") {
      const t = it.task;
      const p = t.projectId ? projects.get(t.projectId) : null;
      const who = data.team.find((m) => m.id === t.assigneeId);
      return (
        <li key={it.id} className="todo-row">
          <button type="button" className="task-check" role="checkbox" aria-checked={false} aria-label={`${t.title}: erledigt`} disabled={!onComplete} onClick={() => onComplete?.(t)} />
          <span className="todo-main">
            <span className="todo-title">{t.title}</span>
            <span className="todo-sub">
              {p ? <Link to={`/projekte/${p.id}`}>{projectTitle(p)}</Link> : "Ohne Projekt"}
              {who && ` · ${who.code ?? who.name}`}
            </span>
          </span>
          <span className="todo-when" data-overdue={t.dueOn! < today}>
            {formatDue(t.dueOn!, today)}
          </span>
        </li>
      );
    }
    if (it.type === "alert") {
      const a = it.alert;
      const p = projects.get(a.projectId);
      return (
        <li key={it.id} className="todo-row">
          <span className="todo-dot" data-tone={SEVERITY_DOT[a.severity]} aria-hidden />
          <Link to={`/projekte/${a.projectId}`} className="todo-main">
            <span className="todo-title">
              <span className="sr-only">{SEVERITY_LABEL[a.severity]}: </span>
              {/* die Gruppe heißt schon "Rechnungen versenden" */}
              {a.title.replace("Rechnung nicht versendet: ", "")}
            </span>
            <span className="todo-sub">
              {p ? projectTitle(p) : "Projekt"} · {a.detail}
            </span>
          </Link>
          {onMarkSent && a.kind === "invoice_unsent" && (
            <Button size="sm" onClick={() => onMarkSent(a)}>
              Als versendet markieren
            </Button>
          )}
        </li>
      );
    }
    const att = it.attachment;
    const mail = data.inboxItems.find((m) => m.id === att.itemId);
    return (
      <li key={it.id} className="todo-row">
        <span className="todo-dot" data-tone="info" aria-hidden />
        <Link to="/agent/pruefung" className="todo-main">
          <span className="todo-title">{att.fileName}</span>
          <span className="todo-sub">{mail ? `${mail.fromName} · ${mail.subject}` : "Vom Agenten nicht sicher zugeordnet"}</span>
        </Link>
      </li>
    );
  };
  return (
    <section className="todo-group" aria-label={group.label}>
      <h3 className="todo-group-head" data-group={group.key}>
        {group.label} <span className="muted">· {group.items.length}</span>
      </h3>
      <ul className="todo-list">{shown.map(row)}</ul>
      {group.items.length > TODO_GROUP_LIMIT && (
        <button type="button" className="todo-all" aria-expanded={showAll} onClick={onToggleAll}>
          {showAll ? "Weniger anzeigen" : `Alle ${group.items.length} anzeigen`}
        </button>
      )}
    </section>
  );
}

/** Eingeklappter Bereich "Mehr": Diagramme und Aktivitäten, unverändert in der Funktion. */
function DashboardMore({ data, projects, today, staff }: { data: Dataset; projects: Map<string, Project>; today: string; staff: boolean }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ActivityFilter>("alle");
  const [activityLimit, setActivityLimit] = useState(8);
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
      {/* Rechnungsvolumen und Aktivitäten nur für Mitarbeiter (Freiberufler sehen keine Rechnungen) */}
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
  );
}

function DashboardSkeleton({ head }: { head: React.ReactNode }) {
  return (
    <>
      {head}
      <div className="dash" aria-busy="true">
        <div className="stack">
          <Skeleton w="20%" h={12} />
          <Skeleton h={52} />
        </div>
        <div className="stack">
          <Skeleton w="20%" h={12} />
          <Skeleton h={52} />
        </div>
        <div className="stack">
          <Skeleton w="20%" h={12} />
          <Skeleton h={44} />
          <Skeleton h={44} />
          <Skeleton h={44} />
        </div>
      </div>
    </>
  );
}
