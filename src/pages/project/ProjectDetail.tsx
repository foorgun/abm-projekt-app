import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, ChevronRight, CircleAlert, FolderX, Info, ListPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { StatusPill } from "../../components/ProjectBits";
import { TaskForm, TaskList } from "../../components/TaskList";
import { useToast } from "../../components/Toast";
import { Button, buttonClass, Card, CardBody, CardHead, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Menu, Skeleton, Stepper, Tabs, type MenuEntry } from "../../components/ui";
import { SEVERITY_TONE } from "../../lib/alertUi";
import { formatDate } from "../../lib/format";
import { missingSteps, nextStep, phaseOf, progressOf, projectTitle } from "../../lib/projects";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import type { Project, Task } from "../../lib/types";
import { ActivityTab } from "./ActivityTab";
import { DocumentsTab } from "./DocumentsTab";
import { InvoicesTab } from "./InvoicesTab";
import { OverviewTab } from "./OverviewTab";
import { PlanungsprotokollTab } from "./PlanungsprotokollTab";

type TabKey = "uebersicht" | "dokumente" | "aufgaben" | "rechnungen" | "planungsprotokoll" | "aktivitaet";
const TABS: TabKey[] = ["uebersicht", "dokumente", "aufgaben", "rechnungen", "planungsprotokoll", "aktivitaet"];
const SEV_ICON = { dringend: AlertTriangle, hinweis: CircleAlert, info: Info };

export function ProjectDetail() {
  const { id } = useParams();
  const { data, loading, error, reload, alerts, today, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [taskForm, setTaskForm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const staff = user.role !== "freiberufler";
  const admin = user.role === "admin";
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const project = data?.projects.find((p) => p.id === id) ?? null;
  const projectAlerts = useMemo(() => alerts.filter((a) => a.projectId === id), [alerts, id]);

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={() => void reload()} />
      </Card>
    );
  }
  if (loading || !data) return <DetailSkeleton />;
  if (!project) {
    return (
      <Card>
        <EmptyState
          icon={<FolderX size={18} />}
          title="Projekt nicht gefunden"
          text="Das Projekt existiert nicht oder ist für deine Rolle nicht freigegeben."
          action={
            <Link to="/projekte" className={buttonClass("outline", "sm")}>
              Zur Projektliste
            </Link>
          }
        />
      </Card>
    );
  }

  const p: Project = project;
  const steps = data.stepDefinitions;
  const phase = phaseOf(p, steps);
  const progress = progressOf(p, steps);
  const missing = missingSteps(p, steps);
  const next = nextStep(p, steps);
  const company = data.companies.find((c) => c.id === p.companyId);
  const architect = data.team.find((t) => t.id === p.architectId);
  const documents = data.documents.filter((d) => d.projectId === p.id);
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const openTasks = tasks.filter((t) => t.status === "offen").sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const doneTasks = tasks.filter((t) => t.status === "erledigt");
  const invoices = data.invoices.filter((i) => i.projectId === p.id);
  const activities = data.activities.filter((a) => a.projectId === p.id);
  const contact = data.bauherren.find((b) => b.projectId === p.id) ?? null;

  const visibleTabs = TABS.filter((t) => staff || (t !== "rechnungen" && t !== "aktivitaet" && t !== "aufgaben" && t !== "planungsprotokoll"));
  const requested = params.get("tab") as TabKey | null;
  const tab: TabKey = requested && visibleTabs.includes(requested) ? requested : "uebersicht";
  const setTab = (t: TabKey) => setParams(t === "uebersicht" ? {} : { tab: t }, { replace: true });

  async function changeDate(key: string, date: string | null) {
    const label = steps.find((s) => s.key === key)?.label ?? key;
    const res = await mutate((r) => r.setStepDate(p.id, key, date));
    toast(res.ok ? (date ? `${label}: ${formatDate(date)}` : `${label} zurückgesetzt`) : res.error, res.ok ? "ok" : "danger");
  }

  async function toggleTask(t: Task) {
    const res = await mutate((r) => r.updateTask(t.id, { status: t.status === "offen" ? "erledigt" : "offen" }));
    if (!res.ok) toast(res.error, "danger");
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Brotkrumen">
        <Link to={p.status === "aktiv" ? "/projekte/aktiv" : "/projekte"}>Projekte</Link>
        <ChevronRight size={14} aria-hidden />
        <span aria-current="page">{projectTitle(p)}</span>
      </nav>

      <div className="page-head project-head">
        <div className="page-head-text">
          <div className="project-title-row">
            <h1>{p.bauherrLabel}</h1>
            <StatusPill status={p.status} />
          </div>
          <p className="project-meta">
            <span>{p.abmNr ?? "ohne ABM-Nr."}</span>
            {p.hausbauNr && <span>Hausbau-Nr. {p.hausbauNr}</span>}
            {p.location && <span>{p.location}</span>}
            {company && <span>{company.name}</span>}
            {architect && <span>Architekt {architect.code ?? architect.name}</span>}
          </p>
        </div>
        {staff && (
          <div className="page-head-actions">
            {/* Seltene Aktionen im Menü; die häufige (nächster Schritt erledigt) steht in der Prozesskarte */}
            <Menu
              items={[
                {
                  label: "Aufgabe anlegen",
                  icon: <ListPlus size={15} />,
                  onSelect: () => {
                    setTab("aufgaben");
                    setTaskForm(true);
                  },
                },
                "sep",
                ...(["aktiv", "abgeschlossen", "storno"] as Project["status"][])
                  .filter((st) => st !== p.status)
                  .map((st) => ({
                    label: st === "aktiv" ? "Wieder aktiv setzen" : st === "abgeschlossen" ? "Als abgeschlossen markieren" : "Stornieren",
                    onSelect: async () => {
                      const res = await mutate((r) => r.setProjectStatus(p.id, st));
                      toast(res.ok ? "Status geändert" : res.error, res.ok ? "ok" : "danger");
                    },
                  })),
                // Endgültig löschen: nur Admin (die Datenbank prüft das ebenfalls)
                ...(admin ? (["sep", { label: "Projekt löschen …", icon: <Trash2 size={15} />, onSelect: () => setDeleteOpen(true) }] as (MenuEntry | "sep")[]) : []),
              ]}
              trigger={(t) => (
                <IconButton label="Weitere Aktionen" variant="outline" {...t}>
                  <MoreHorizontal size={16} />
                </IconButton>
              )}
            />
          </div>
        )}
      </div>

      {deleteOpen && admin && (
        <DeleteProjectDialog
          project={p}
          counts={{ documents: documents.length, tasks: tasks.length, invoices: invoices.length }}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => navigate(p.status === "aktiv" ? "/projekte/aktiv" : "/projekte")}
        />
      )}

      <div className="stack">
        <Card className="process-card">
          <CardHead
            title="Prozess"
            sub={
              <>
                {progress.done} von {progress.total} Schritten · Phase: <strong>{phase.label}</strong>
                {missing.length > 0 && (
                  <>
                    {" · "}
                    <span className="missing-note">
                      {missing.length === 1 ? "1 Schritt fehlt" : `${missing.length} Schritte fehlen`}: {missing.map((s) => s.label).join(", ")}
                    </span>
                  </>
                )}
              </>
            }
            actions={
              staff && next && p.status === "aktiv" ? (
                <Button size="sm" icon={<Check size={14} />} onClick={() => void changeDate(next.key, today)}>
                  {next.label} heute erledigt
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <Stepper items={steps.map((s) => ({ key: s.key, label: s.label, date: p.steps[s.key] ?? null }))} onChangeDate={staff ? (k, d) => void changeDate(k, d) : undefined} />
          </CardBody>
        </Card>

        {projectAlerts.length > 0 && (
          <div className="stack banners" role="region" aria-label="Warnungen für dieses Projekt">
            {projectAlerts.map((a) => {
              const Icon = SEV_ICON[a.severity];
              return (
                <div key={a.id} className="banner" data-tone={SEVERITY_TONE[a.severity]}>
                  <Icon size={16} aria-hidden />
                  <div className="banner-text">
                    <span className="banner-title">{a.title}</span>
                    <span className="banner-detail">{a.detail}</span>
                  </div>
                  {staff && a.kind === "invoice_unsent" && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const res = await mutate((r) => r.markInvoiceSent(a.invoiceId!, today));
                        toast(res.ok ? "Rechnung als versendet markiert" : res.error, res.ok ? "ok" : "danger");
                      }}
                    >
                      Als versendet markieren
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Tabs<TabKey>
          label="Projektbereiche"
          value={tab}
          onChange={setTab}
          items={visibleTabs.map((t) => ({
            key: t,
            label: { uebersicht: "Übersicht", dokumente: "Dokumente", aufgaben: "Aufgaben", rechnungen: "Rechnungen", planungsprotokoll: "Planungsprotokoll", aktivitaet: "Aktivität" }[t],
            count:
              t === "dokumente"
                ? documents.length
                : t === "aufgaben"
                  ? openTasks.length
                  : t === "rechnungen"
                    ? invoices.length
                    : t === "planungsprotokoll"
                      ? data.planungsprotokolle.filter((x) => x.projectId === p.id).length || undefined
                      : undefined,
          }))}
        />

        <div role="tabpanel" aria-label={tab}>
          {tab === "uebersicht" && <OverviewTab project={p} data={data} contact={contact} staff={staff} />}
          {tab === "dokumente" && <DocumentsTab projectId={p.id} templates={data.folderTemplates} documents={documents} />}
          {tab === "aufgaben" && (
            <Card>
              <CardHead
                title="Aufgaben"
                sub={`${openTasks.length} offen`}
                actions={
                  !taskForm && (
                    <Button size="sm" icon={<ListPlus size={14} />} onClick={() => setTaskForm(true)}>
                      Neue Aufgabe
                    </Button>
                  )
                }
              />
              {taskForm && (
                <TaskForm
                  team={data.team}
                  today={today}
                  projectId={p.id}
                  onCancel={() => setTaskForm(false)}
                  onSubmit={async (t) => {
                    const res = await mutate((r) => r.createTask(t));
                    toast(res.ok ? "Aufgabe angelegt" : res.error, res.ok ? "ok" : "danger");
                    return res.ok;
                  }}
                />
              )}
              {openTasks.length ? (
                <TaskList tasks={openTasks} team={data.team} today={today} onToggle={(t) => void toggleTask(t)} canEdit={staff} />
              ) : (
                <EmptyState title="Keine offenen Aufgaben" />
              )}
              {doneTasks.length > 0 && (
                <div className="card-foot">
                  <Button variant="ghost" size="sm" onClick={() => setShowDone((v) => !v)}>
                    {showDone ? "Erledigte ausblenden" : `${doneTasks.length} erledigte anzeigen`}
                  </Button>
                </div>
              )}
              {showDone && <TaskList tasks={doneTasks} team={data.team} today={today} onToggle={(t) => void toggleTask(t)} canEdit={staff} />}
            </Card>
          )}
          {tab === "rechnungen" && <InvoicesTab invoices={invoices} />}
          {tab === "planungsprotokoll" && staff && <PlanungsprotokollTab key={p.id} project={p} data={data} contact={contact} />}
          {tab === "aktivitaet" && <ActivityTab activities={activities} />}
        </div>
      </div>
    </>
  );
}

/**
 * Bestätigung zum endgültigen Löschen. Der Knopf wird erst frei, wenn der Name des Bauherrn eingetippt ist.
 * Nur für Admins erreichbar; die Datenbankfunktion delete_project weist alle anderen ab.
 */
function DeleteProjectDialog({ project, counts, onClose, onDeleted }: { project: Project; counts: { documents: number; tasks: number; invoices: number }; onClose: () => void; onDeleted: () => void }) {
  const { mutate } = useData();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = project.bauherrLabel.trim();
  const matches = typed.trim().toLocaleLowerCase("de") === name.toLocaleLowerCase("de");

  async function run() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    // erst wegnavigieren, dann neu laden: die Seite des gelöschten Projekts soll nicht kurz "nicht gefunden" zeigen
    const res = await mutate(async (r) => {
      const out = await r.deleteProject(project.id);
      onDeleted();
      return out;
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast(`Projekt ${projectTitle(project)} gelöscht`, res.value.filesLeft ? "danger" : "ok", res.value.filesLeft ? `${res.value.filesLeft} Datei(en) ließen sich nicht aus dem Speicher entfernen.` : undefined);
  }

  return (
    <Dialog
      title="Projekt löschen"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="destructive" type="submit" form="delete-project" disabled={!matches || busy}>
            {busy ? "Wird gelöscht …" : "Endgültig löschen"}
          </Button>
        </>
      }
    >
      <form
        id="delete-project"
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <p>
          <strong>{projectTitle(project)}</strong>
          {project.location ? `, ${project.location}` : ""}
        </p>
        <p className="form-error" role="alert">
          Das Projekt, seine Schritte, Aufgaben, Rechnungen und Dokumente werden endgültig gelöscht.
        </p>
        <p className="muted">
          Betroffen: {counts.documents} {counts.documents === 1 ? "Dokument" : "Dokumente"} (auch die Dateien im Speicher), {counts.tasks} {counts.tasks === 1 ? "Aufgabe" : "Aufgaben"}, {counts.invoices}{" "}
          {counts.invoices === 1 ? "Rechnung" : "Rechnungen"}, dazu Aktivitäten, Projektbeteiligte, Zuweisungen und Entwürfe. Der Kontakt des Bauherrn wird mitgelöscht, wenn er an keinem anderen Projekt hängt. Das lässt sich nicht
          rückgängig machen. Soll das Projekt nur aus den aktiven Listen verschwinden, reicht „Stornieren“.
        </p>
        <Field label={`Zum Bestätigen den Namen des Bauherrn eintippen: ${name}`} htmlFor="delete-project-name">
          <Input id="delete-project-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="stack" aria-busy="true">
      <Skeleton w={160} h={12} />
      <Skeleton w={260} h={28} />
      <Skeleton w={380} h={14} />
      <Card>
        <CardBody>
          <Skeleton h={90} />
        </CardBody>
      </Card>
      <Skeleton w={400} h={36} />
      <Card>
        <CardBody>
          <Skeleton h={240} />
        </CardBody>
      </Card>
    </div>
  );
}
