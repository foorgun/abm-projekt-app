import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, ChevronRight, CircleAlert, FolderOpen, Info, ListTodo, Receipt, ShieldAlert } from "lucide-react";
import { HBarChart } from "../components/charts/HBarChart";
import { PageHead } from "../components/layout/PageHead";
import { TermineKarte } from "../components/TermineKarte";
import { useToast } from "../components/Toast";
import { Button, buttonClass, Card, CardBody, CardHead, DataTable, EmptyState, ErrorState, KpiCard, KpiSkeleton, Pill, Skeleton, TableSkeleton, type Column } from "../components/ui";
import type { Alert } from "../lib/alerts";
import { unsentInvoiceTotal } from "../lib/alerts";
import { SEVERITY_LABEL, SEVERITY_TONE } from "../lib/alertUi";
import { limitGroups, newProjectsPerMonth, projectsByPhase, todayGroups, TODO_LIMIT, type TodoItem } from "../lib/dashboard";
import { formatDate, formatLongDate, formatMoney, formatRelative } from "../lib/format";
import { greeting } from "../lib/greeting";
import { projectTitle } from "../lib/projects";
import { firstName, useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Activity, Project, Task, TeamMember } from "../lib/types";

const ACTIVITY_LIMIT = 5;
const ALERT_ICON = { dringend: AlertTriangle, hinweis: CircleAlert, info: Info };

/**
 * Dashboard: vier Kennzahlen, "Heute zu tun" (höchstens fünf Zeilen), Projekte nach Phase und die letzten Aktivitäten.
 * Die übrigen Diagramme und die volle Aktivitätenliste stehen unter "Mehr Auswertungen" (/auswertungen).
 */
export function Dashboard() {
  const { user } = useSession();
  const { data, loading, error, reload, alerts, allAlerts, today, dueTaskCount, reviewCount, mutate } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
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

  // ---------------------------------------------------------------- Heute zu tun
  const groups = todayGroups({ tasks: data.tasks, alerts, today });
  const todoCount = groups.reduce((n, g) => n + g.items.length, 0);
  const shownGroups = showAll ? groups : limitGroups(groups, TODO_LIMIT);

  async function markSent(a: Alert) {
    const res = await mutate((r) => r.markInvoiceSent(a.invoiceId!, today));
    toast(res.ok ? "Rechnung als versendet markiert" : res.error, res.ok ? "ok" : "danger");
  }

  async function completeTask(t: Task) {
    const res = await mutate((r) => r.updateTask(t.id, { status: "erledigt" }));
    toast(res.ok ? "Aufgabe erledigt" : res.error, res.ok ? "ok" : "danger");
  }

  // ---------------------------------------------------------------- Aktivitäten (kurz)
  const columns: Column<Activity>[] = [
    {
      key: "project",
      header: "Projekt",
      strong: true,
      render: (a) => {
        const p = a.projectId ? projects.get(a.projectId) : null;
        return p ? projectTitle(p) : "–";
      },
    },
    {
      key: "event",
      header: "Ereignis",
      render: (a) => (
        <span className="event-text" title={`${a.text} (${a.actor})`}>
          {a.text}
        </span>
      ),
    },
    {
      key: "at",
      header: "Zeit",
      align: "right",
      render: (a) => (
        <time className="muted" dateTime={a.at} title={a.at.replace("T", " ")}>
          {formatRelative(a.at)}
        </time>
      ),
    },
  ];

  const phaseCard = (
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
  );

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
                label="Nicht versendet"
                value={formatMoney(unsentSum)}
                valueTone={unsentSum > 0 ? "danger" : undefined}
                foot={`${unsentAlerts.length} ${unsentAlerts.length === 1 ? "fällige Rechnung" : "fällige Rechnungen"}`}
                info="Fällige Rechnungen, die noch nicht versendet wurden. „Offen“ heißt in der App: versendet, aber noch nicht bezahlt."
                to="/rechnungen?reiter=nicht-versendet"
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
          <CardHead title="Heute zu tun" sub={todoCount ? `${todoCount} ${todoCount === 1 ? "Eintrag" : "Einträge"}, nach Dringlichkeit sortiert` : undefined} />
          <div className="card-body flush">
            {todoCount ? (
              <>
                {shownGroups.map((g) => (
                  <section key={g.key} aria-label={g.label}>
                    <h3 className="todo-group" data-group={g.key}>
                      {g.label} <span className="muted">· {groups.find((x) => x.key === g.key)!.items.length}</span>
                    </h3>
                    <ul className="list alert-list">
                      {g.items.map((it) => (
                        <TodoRow key={it.id} item={it} projects={projects} team={data.team} today={today} onMarkSent={staff ? markSent : undefined} onComplete={staff ? completeTask : undefined} />
                      ))}
                    </ul>
                  </section>
                ))}
                {todoCount > TODO_LIMIT && (
                  <div className="card-foot">
                    <Button variant="ghost" size="sm" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Weniger anzeigen" : `Alle ${todoCount} anzeigen`}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={<CheckCircle2 size={18} />} title="Alles erledigt" text="Für heute steht nichts an." />
            )}
          </div>
        </Card>

        {/* Termine der Woche: vorerst erfundene Demo-Termine, nur für Mitarbeiter */}
        {staff && <TermineKarte heute={today} />}

        {staff ? (
          <div className="grid-2">
            {phaseCard}
            <Card>
              <CardHead title="Letzte Aktivitäten" />
              <div className="card-body flush">
                {data.activities.length ? (
                  <DataTable
                    label="Letzte Aktivitäten"
                    rows={data.activities.slice(0, ACTIVITY_LIMIT)}
                    columns={columns}
                    rowKey={(a) => a.id}
                    onRowClick={(a) => a.projectId && navigate(`/projekte/${a.projectId}`)}
                  />
                ) : (
                  <EmptyState title="Keine Aktivitäten" />
                )}
              </div>
            </Card>
          </div>
        ) : (
          phaseCard
        )}

        <div className="dash-more-link">
          <Link to="/auswertungen" className={buttonClass("ghost")}>
            Mehr Auswertungen <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </>
  );
}

/** Eine Zeile in "Heute zu tun": Aufgabe zum Abhaken oder Warnung mit Direktaktion, im Aufbau der Warnungsliste. */
function TodoRow({
  item,
  projects,
  team,
  today,
  onMarkSent,
  onComplete,
}: {
  item: TodoItem;
  projects: Map<string, Project>;
  team: TeamMember[];
  today: string;
  onMarkSent?: (a: Alert) => void;
  onComplete?: (t: Task) => void;
}) {
  if (item.type === "alert") {
    const a = item.alert;
    const Icon = ALERT_ICON[a.severity];
    const p = projects.get(a.projectId);
    return (
      <li className="alert-row" data-severity={a.severity}>
        <Link to={`/projekte/${a.projectId}`} className="list-item alert-link">
          <span className="alert-icon" data-tone={SEVERITY_TONE[a.severity]} aria-hidden>
            <Icon size={16} />
          </span>
          <span className="list-item-main">
            <span className="list-item-title">{a.title}</span>
            <span className="list-item-sub">
              {p ? projectTitle(p) : "Projekt"} · {a.detail}
            </span>
          </span>
          <Pill tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Pill>
          <ChevronRight size={16} className="alert-chevron" aria-hidden />
        </Link>
        <span className="alert-action-slot">
          {onMarkSent && a.kind === "invoice_unsent" && (
            <Button size="sm" onClick={() => onMarkSent(a)}>
              Als versendet markieren
            </Button>
          )}
        </span>
      </li>
    );
  }
  const t = item.task;
  const p = t.projectId ? projects.get(t.projectId) : null;
  const who = team.find((m) => m.id === t.assigneeId);
  const late = t.dueOn! < today;
  const main = (
    <>
      <span className="list-item-main">
        <span className="list-item-title">{t.title}</span>
        <span className="list-item-sub">
          {[p ? projectTitle(p) : "Ohne Projekt", who ? (who.code ?? who.name) : null, late ? `fällig seit ${formatDate(t.dueOn!)}` : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Pill tone={late ? "danger" : "warn"}>{late ? "Überfällig" : "Heute"}</Pill>
      {p && <ChevronRight size={16} className="alert-chevron" aria-hidden />}
    </>
  );
  return (
    <li className="alert-row todo-task" data-severity={late ? "dringend" : "hinweis"}>
      <button type="button" className="task-check" role="checkbox" aria-checked={false} aria-label={`${t.title}: erledigt`} disabled={!onComplete} onClick={() => onComplete?.(t)} />
      {p ? (
        <Link to={`/projekte/${p.id}`} className="list-item alert-link">
          {main}
        </Link>
      ) : (
        <span className="list-item alert-link">{main}</span>
      )}
      <span className="alert-action-slot" />
    </li>
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
