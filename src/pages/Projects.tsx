import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FolderSearch, Search, X } from "lucide-react";
import { PhasePill, StatusPill, WarnIcon } from "../components/ProjectBits";
import { PageHead } from "../components/layout/PageHead";
import { useNewProject } from "../components/NewProjectDialog";
import { Button, Card, Checkbox, DataTable, EmptyState, ErrorState, Input, Progress, Select, TableSkeleton, Tabs, type Column } from "../components/ui";
import type { Alert } from "../lib/alerts";
import { formatDate, formatMonth } from "../lib/format";
import {
  DEFAULT_FILTERS,
  filterProjects,
  filtersFromParams,
  filtersToParams,
  nextTaskFor,
  sortProjects,
  tabFilter,
  teamCode,
  type ProjectFilters,
  type ProjectSort,
  type ProjectTab,
} from "../lib/projectFilters";
import { allPhases, nextStep, phaseOf, progressOf } from "../lib/projects";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";

const TAB_PATH: Record<ProjectTab, string> = { alle: "/projekte", aktiv: "/projekte/aktiv", abgeschlossen: "/projekte/abgeschlossen" };
const TAB_TITLE: Record<ProjectTab, string> = { alle: "Alle Projekte", aktiv: "Aktive Projekte", abgeschlossen: "Abgeschlossene Projekte" };

export function Projects({ tab }: { tab: ProjectTab }) {
  const { data, loading, error, reload, alerts, today } = useData();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const openNewProject = useNewProject();
  const staff = user.role !== "freiberufler";

  const setFilters = useCallback(
    (patch: Partial<ProjectFilters>) => setParams(filtersToParams({ ...filters, ...patch }), { replace: true }),
    [filters, setParams],
  );

  const alertsByProject = useMemo(() => {
    const m = new Map<string, Alert[]>();
    for (const a of alerts) m.set(a.projectId, [...(m.get(a.projectId) ?? []), a]);
    return m;
  }, [alerts]);

  // "Neues Projekt" steht schon in der Kopfzeile, deshalb hier kein zweiter Button
  const head = <PageHead title={TAB_TITLE[tab]} />;

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

  const steps = data?.stepDefinitions ?? [];
  const companies = data?.companies ?? [];
  const team = data?.team ?? [];
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const sorted = data ? sortProjects(filterProjects(data.projects, tab, filters, { steps, companies }), filters.sort, steps) : [];
  // Bei Gruppierung zuerst nach Eingangsmonat (neueste Gruppe oben), innerhalb der Gruppe bleibt die gewählte Sortierung
  const list = filters.group ? [...sorted].sort((a, b) => (b.intakeMonth ?? "").localeCompare(a.intakeMonth ?? "")) : sorted;
  const counts = data
    ? {
        alle: data.projects.filter(tabFilter("alle", filters.storno)).length,
        aktiv: data.projects.filter(tabFilter("aktiv", false)).length,
        abgeschlossen: data.projects.filter(tabFilter("abgeschlossen", false)).length,
      }
    : null;
  const filtered = Boolean(filters.q || filters.company || filters.architect || filters.phase);

  const columns: Column<Project>[] = [
    { key: "abm", header: "ABM-Nr.", strong: true, render: (p) => p.abmNr ?? "–", sortValue: (p) => p.abmNr ?? "" },
    {
      key: "bauherr",
      header: "Bauherr · Ort",
      render: (p) => (
        <>
          <span className="cell-main">{p.bauherrLabel}</span>
          <span className="cell-sub">{p.location ?? "–"}</span>
        </>
      ),
      sortValue: (p) => p.bauherrLabel,
    },
    { key: "firma", header: "Firma", render: (p) => (p.companyId ? companyName.get(p.companyId) ?? "–" : "–"), sortValue: (p) => (p.companyId ? companyName.get(p.companyId) ?? "" : "") },
    { key: "architekt", header: <abbr title="Architekt">Arch.</abbr>, render: (p) => teamCode(p.architectId, team), sortValue: (p) => teamCode(p.architectId, team) },
    {
      key: "phase",
      header: "Phase",
      // Abgeschlossene und stornierte Projekte zeigen ihren Status statt der letzten Phase
      render: (p) => (p.status === "aktiv" ? <PhasePill phase={phaseOf(p, steps)} /> : <StatusPill status={p.status} />),
      sortValue: (p) => (p.status === "aktiv" ? phaseOf(p, steps).index : p.status === "abgeschlossen" ? 100 : 101),
    },
    {
      key: "fortschritt",
      header: "Fortschritt",
      render: (p) => {
        const pr = progressOf(p, steps);
        return <Progress done={pr.done} total={pr.total} />;
      },
      sortValue: (p) => progressOf(p, steps).done,
    },
    {
      key: "next",
      header: "Nächste Aufgabe",
      render: (p) => {
        const t = data ? nextTaskFor(p.id, data.tasks) : null;
        if (t) {
          const overdue = Boolean(t.dueOn && t.dueOn < today);
          return (
            <span className="next-task" data-overdue={overdue} title={`${t.title}${t.dueOn ? `, fällig ${formatDate(t.dueOn)}` : ""}`}>
              {t.title}
              {t.dueOn && <span className="cell-sub">{overdue ? "überfällig seit " : "fällig "}{formatDate(t.dueOn)}</span>}
            </span>
          );
        }
        const s = p.status === "aktiv" ? nextStep(p, steps) : null;
        return s ? (
          <span className="next-task muted" title={`Nächster Schritt: ${s.label}`}>
            Schritt: {s.label}
          </span>
        ) : (
          <span className="muted">–</span>
        );
      },
    },
    { key: "warn", header: <span className="sr-only">Warnungen</span>, className: "warn-cell", render: (p) => <WarnIcon alerts={alertsByProject.get(p.id) ?? []} />, sortValue: (p) => alertsByProject.get(p.id)?.length ?? 0 },
  ];

  const phaseOptions = [{ value: "", label: "Alle Phasen" }, ...allPhases(steps).map((ph) => ({ value: ph.key, label: ph.label }))];

  return (
    <>
      {head}
      <div className="stack">
        <Tabs<ProjectTab>
          label="Projektstatus"
          value={tab}
          onChange={(t) => navigate({ pathname: TAB_PATH[t], search: location.search })}
          items={(["alle", "aktiv", "abgeschlossen"] as ProjectTab[]).map((t) => ({
            key: t,
            label: t === "alle" ? "Alle" : t === "aktiv" ? "Aktiv" : "Abgeschlossen",
            count: counts?.[t],
          }))}
        />
        <Card>
          <div className="filters" role="search">
            <Input
              icon={<Search size={15} />}
              type="search"
              placeholder="Bauherr, ABM-Nr., Ort, Hausbau-Nr."
              aria-label="Projekte durchsuchen"
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
            />
            {staff && (
              <Select
                aria-label="Firma"
                value={filters.company}
                onChange={(e) => setFilters({ company: e.target.value })}
                options={[{ value: "", label: "Alle Firmen" }, ...companies.map((c) => ({ value: c.id, label: c.name })), { value: "-", label: "Ohne Firma" }]}
              />
            )}
            <Select
              aria-label="Architekt"
              value={filters.architect}
              onChange={(e) => setFilters({ architect: e.target.value })}
              options={[{ value: "", label: "Alle Architekten" }, ...team.filter((t) => t.role === "architekt").map((t) => ({ value: t.id, label: t.code ?? t.name }))]}
            />
            <Select aria-label="Phase" value={filters.phase} onChange={(e) => setFilters({ phase: e.target.value })} options={phaseOptions} />
            <Select
              aria-label="Sortierung"
              value={filters.sort}
              onChange={(e) => setFilters({ sort: e.target.value as ProjectSort })}
              options={[
                { value: "eingang", label: "Neueste zuerst" },
                { value: "abm", label: "ABM-Nr." },
                { value: "bauherr", label: "Bauherr A–Z" },
                { value: "fortschritt", label: "Fortschritt" },
              ]}
            />
          </div>
          <div className="filters-row2">
            <Checkbox label="Nach Eingangsmonat gruppieren" checked={filters.group} onChange={(e) => setFilters({ group: e.target.checked })} />
            {tab === "alle" && <Checkbox label="Stornierte einblenden" checked={filters.storno} onChange={(e) => setFilters({ storno: e.target.checked })} />}
            {filtered && (
              <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => setParams(filtersToParams({ ...DEFAULT_FILTERS, sort: filters.sort, group: filters.group, storno: filters.storno }), { replace: true })}>
                Filter zurücksetzen
              </Button>
            )}
            <span className="muted" aria-live="polite">
              {loading || !data ? "Lädt …" : `${list.length} ${list.length === 1 ? "Projekt" : "Projekte"}`}
            </span>
          </div>
          {loading || !data ? (
            <TableSkeleton rows={8} cols={7} />
          ) : list.length ? (
            <DataTable
              compact
              label={TAB_TITLE[tab]}
              rows={list}
              columns={columns}
              rowKey={(p) => p.id}
              onRowClick={(p) => navigate(`/projekte/${p.id}`)}
              groupBy={filters.group ? (p) => formatMonth(p.intakeMonth) : undefined}
              stickyFirst
            />
          ) : (
            <EmptyState
              icon={<FolderSearch size={18} />}
              title={filtered ? "Keine Projekte für diese Filter" : "Noch keine Projekte"}
              text={filtered ? "Passe die Suche oder die Filter an." : undefined}
              action={
                filtered ? (
                  <Button size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Filter zurücksetzen
                  </Button>
                ) : staff ? (
                  <Button size="sm" variant="primary" onClick={openNewProject}>
                    Neues Projekt
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
      </div>
    </>
  );
}
