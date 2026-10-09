import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ListPlus } from "lucide-react";
import { PageHead } from "../components/layout/PageHead";
import { TaskForm, TaskList } from "../components/TaskList";
import { useToast } from "../components/Toast";
import { Button, Card, EmptyState, ErrorState, Select, Skeleton, Tabs } from "../components/ui";
import { projectTitle } from "../lib/projects";
import type { TaskPatch } from "../lib/repo";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import { BUCKET_LABEL, bucketOf, matchesFilter, sortTasks, type TaskBucket, type TaskFilter } from "../lib/tasks";
import type { Task } from "../lib/types";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "heute", label: "Heute" },
  { key: "woche", label: "Diese Woche" },
  { key: "ueberfaellig", label: "Überfällig" },
  { key: "alle", label: "Alle offenen" },
  { key: "erledigt", label: "Erledigt" },
];
const BUCKETS: TaskBucket[] = ["ueberfaellig", "heute", "woche", "spaeter", "ohne"];

/**
 * Aufgaben: manuelle, aus Warnungen (automatisch, eine je Warnung) und vom Agenten.
 * Filter und Auswahl stehen in der URL (?filter=…&person=…&projekt=…&neu=1).
 */
export function Tasks() {
  const { data, loading, error, reload, today, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const staff = user.role !== "freiberufler";

  const filter = (FILTERS.find((f) => f.key === params.get("filter"))?.key ?? "heute") as TaskFilter;
  const person = params.get("person") ?? "";
  const project = params.get("projekt") ?? "";
  const formOpen = params.get("neu") === "1";
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const projects = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);
  const scoped = (data?.tasks ?? []).filter((t) => (!person || (person === "-" ? !t.assigneeId : t.assigneeId === person)) && (!project || t.projectId === project));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, scoped.filter((t) => matchesFilter(t, f.key, today)).length])) as Record<TaskFilter, number>;
  const list = sortTasks(scoped.filter((t) => matchesFilter(t, filter, today)), filter);

  async function toggle(t: Task) {
    const res = await mutate((r) => r.updateTask(t.id, { status: t.status === "offen" ? "erledigt" : "offen" }));
    if (!res.ok) toast(res.error, "danger");
    else if (t.status === "offen") toast(t.source === "warnung" ? "Erledigt. Die zugehörige Warnung ist ausgeblendet." : "Aufgabe erledigt");
  }

  async function update(t: Task, patch: TaskPatch) {
    const res = await mutate((r) => r.updateTask(t.id, patch));
    if (!res.ok) toast(res.error, "danger");
  }

  const head = (
    <PageHead
      title="Aufgaben"
      sub="Manuell angelegt, automatisch aus Warnungen (eine je Warnung) oder aus der Prüfliste des Agenten."
      actions={
        staff && !formOpen ? (
          <Button variant="primary" icon={<ListPlus size={16} />} onClick={() => set({ neu: "1" })}>
            Neue Aufgabe
          </Button>
        ) : undefined
      }
    />
  );

  if (!staff) {
    return (
      <>
        {head}
        <Card>
          <EmptyState title="Aufgaben sind nur für Mitarbeiter sichtbar" />
        </Card>
      </>
    );
  }
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

  const taskProjects = [...new Set((data?.tasks ?? []).map((t) => t.projectId).filter(Boolean) as string[])]
    .map((id) => projects.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => a.bauherrLabel.localeCompare(b.bauherrLabel, "de"));

  const renderList = (items: Task[]) => (
    <TaskList tasks={items} team={data?.team ?? []} today={today} projects={projects} onToggle={(t) => void toggle(t)} onUpdate={(t, p) => void update(t, p)} canEdit={staff} />
  );

  return (
    <>
      {head}
      <div className="stack">
        <div className="tasks-toolbar">
          <Tabs<TaskFilter> label="Zeitraum" variant="segmented" value={filter} onChange={(f) => set({ filter: f === "heute" ? null : f })} items={FILTERS.map((f) => ({ ...f, count: loading ? undefined : counts[f.key] }))} />
          <div className="tasks-selects">
            <Select
              aria-label="Person"
              value={person}
              onChange={(e) => set({ person: e.target.value || null })}
              options={[{ value: "", label: "Alle Personen" }, ...(data?.team ?? []).map((m) => ({ value: m.id, label: m.code ? `${m.code} (${m.name})` : m.name })), { value: "-", label: "Niemand zugewiesen" }]}
            />
            <Select
              aria-label="Projekt"
              value={project}
              onChange={(e) => set({ projekt: e.target.value || null })}
              options={[{ value: "", label: "Alle Projekte" }, ...taskProjects.map((p) => ({ value: p.id, label: projectTitle(p) }))]}
            />
          </div>
        </div>

        <Card>
          {formOpen && data && (
            <div className="task-form-wrap">
              <TaskForm
                team={data.team}
                today={today}
                projectId={project || null}
                projects={data.projects.filter((p) => p.status === "aktiv").sort((a, b) => a.bauherrLabel.localeCompare(b.bauherrLabel, "de"))}
                onCancel={() => set({ neu: null })}
                onSubmit={async (t) => {
                  const res = await mutate((r) => r.createTask(t));
                  toast(res.ok ? "Aufgabe angelegt" : res.error, res.ok ? "ok" : "danger");
                  if (res.ok) set({ neu: null });
                  return res.ok;
                }}
              />
            </div>
          )}
          {loading || !data ? (
            <div className="card-body stack">
              <Skeleton h={44} />
              <Skeleton h={44} />
              <Skeleton h={44} />
            </div>
          ) : !list.length ? (
            <EmptyState
              icon={<CheckCircle2 size={18} />}
              title={filter === "erledigt" ? "Noch nichts erledigt" : filter === "ueberfaellig" ? "Nichts überfällig" : "Keine offenen Aufgaben"}
              text={filter === "heute" ? "Für heute ist nichts fällig." : undefined}
              action={
                filter !== "alle" && counts.alle > 0 ? (
                  <Button size="sm" onClick={() => set({ filter: "alle" })}>
                    Alle offenen anzeigen ({counts.alle})
                  </Button>
                ) : undefined
              }
            />
          ) : filter === "alle" ? (
            BUCKETS.map((b) => {
              const items = list.filter((t) => bucketOf(t, today) === b);
              if (!items.length) return null;
              return (
                <section key={b} aria-label={BUCKET_LABEL[b]}>
                  <h3 className="task-group" data-bucket={b}>
                    {BUCKET_LABEL[b]} <span className="muted">· {items.length}</span>
                  </h3>
                  {renderList(items)}
                </section>
              );
            })
          ) : (
            renderList(list)
          )}
        </Card>
      </div>
    </>
  );
}
