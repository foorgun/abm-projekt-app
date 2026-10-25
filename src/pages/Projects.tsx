import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronRight, FolderSearch, Search, SlidersHorizontal, X } from "lucide-react";
import { ColumnPanel } from "../components/ColumnPanel";
import { DraftsCard } from "../components/DraftsCard";
import { ProjectHistory } from "../components/ProjectHistory";
import { StatusPill, WarnIcon } from "../components/ProjectBits";
import { PageHead } from "../components/layout/PageHead";
import { useNewProject } from "../components/NewProjectDialog";
import { Button, buttonClass, Card, Checkbox, DataTable, EmptyState, ErrorState, Input, Progress, Select, TableSkeleton, Tabs, type Column } from "../components/ui";
import { abmSortKey } from "../lib/abmNr";
import type { Alert } from "../lib/alerts";
import { isPilot } from "../lib/appMode";
import { formatDate, formatDue, formatMonth } from "../lib/format";
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
import {
  COLUMN_DEFS,
  columnsStorageKey,
  loadColumns,
  resetColumns,
  saveColumns,
  visibleColumns,
  type ColumnKey,
  type ColumnState,
} from "../lib/projectColumns";
import { allPhases, nextStep, phaseOf, progressOf } from "../lib/projects";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";

const TAB_PATH: Record<ProjectTab, string> = { alle: "/projekte", aktiv: "/projekte/aktiv", abgeschlossen: "/projekte/abgeschlossen" };
const TAB_TITLE: Record<ProjectTab, string> = { alle: "Alle Projekte", aktiv: "Aktive Projekte", abgeschlossen: "Abgeschlossene Projekte" };

const historyId = (projectId: string) => `verlauf-${projectId}`;

export function Projects({ tab }: { tab: ProjectTab }) {
  const { data, loading, error, reload, alerts, today } = useData();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const openNewProject = useNewProject();
  const staff = user.role !== "freiberufler";
  const pilot = isPilot();
  // Im Pilot ohne Aufgaben: nur der nächste Prozessschritt
  const columnLabel = { ...Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, c.label])), next: pilot ? "Nächster Schritt" : "Nächste Aufgabe" } as Record<ColumnKey, string>;
  // Spaltenauswahl und Reihenfolge: je Benutzer im Browser gespeichert (lib/projectColumns)
  const columnsKey = columnsStorageKey(user);
  const [columnState, setColumnState] = useState<ColumnState>(() => loadColumns(columnsKey));
  // Wer mit gesetztem Filter ankommt (z. B. vom Dashboard), sieht die Filterleiste gleich offen
  const moreFilters = [filters.company, filters.architect, filters.phase, filters.sort !== DEFAULT_FILTERS.sort, filters.group, filters.storno].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(moreFilters > 0);
  // Aufgeklappte Zeilen (Verlauf). Bleibt beim Filtern und Sortieren erhalten; die Seite selbst bleibt stehen.
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set());
  const toggleRow = useCallback(
    (id: string) =>
      setOpenRows((cur) => {
        const next = new Set(cur);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );

  function changeColumns(next: ColumnState) {
    setColumnState(next);
    saveColumns(columnsKey, next);
  }

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

  const salesName = new Map((data?.salespeople ?? []).map((x) => [x.id, x.name]));
  const toggleColumn: Column<Project> = {
    key: "verlauf",
    header: <span className="sr-only">Verlauf</span>,
    className: "toggle-cell",
    render: (p) => {
      const open = openRows.has(p.id);
      return (
        <button
          type="button"
          className="row-toggle"
          aria-expanded={open}
          aria-controls={open ? historyId(p.id) : undefined}
          aria-label={`Verlauf ${open ? "ausblenden" : "anzeigen"}: ${p.bauherrLabel}`}
          title={open ? "Verlauf ausblenden" : "Verlauf anzeigen"}
          onClick={(e) => {
            // nur aufklappen, das Projekt nicht öffnen (der Zeilenklick bleibt für die Zeile selbst)
            e.stopPropagation();
            toggleRow(p.id);
          }}
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      );
    },
  };
  const openColumn: Column<Project> = {
    key: "oeffnen",
    header: <span className="sr-only">Aktion</span>,
    className: "action-cell",
    render: (p) => (
      <Link
        to={`/projekte/${p.id}`}
        className={buttonClass("outline", "sm", "row-open")}
        title={`Projekt öffnen: ${p.bauherrLabel}`}
        // eigenes Klickziel: nicht zusätzlich den Zeilenklick auslösen
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowRight size={14} aria-hidden />
        <span className="row-open-label">Projekt öffnen</span>
      </Link>
    ),
  };
  const dash = (v: string | null | undefined) => v || "–";
  const stepColumn = (key: ColumnKey): Column<Project> => ({
    key,
    header: columnLabel[key],
    className: "nowrap",
    render: (p) => (p.steps[key] ? formatDate(p.steps[key]!) : "–"),
    sortValue: (p) => p.steps[key] ?? null,
  });
  // Wählbare Spalten (Reihenfolge und Sichtbarkeit aus columnState). Leere Werte zeigen "–".
  const selectable: Record<ColumnKey, Column<Project>> = {
    abm: {
      key: "abm",
      header: "ABM-Nr.",
      strong: true,
      className: "nowrap",
      render: (p) => (p.kind === "bauvoranfrage" ? <abbr title="Bauvoranfrage">BVA</abbr> : dash(p.abmNr)),
      // numerisch: erst Nummernkreis, dann Nummer (8185-633 vor 8185-1588)
      sortValue: (p) => abmSortKey(p.abmNr),
    },
    bauherr: { key: "bauherr", header: "Bauherr", render: (p) => p.bauherrLabel, sortValue: (p) => p.bauherrLabel },
    firma: { key: "firma", header: "Hausbaufirma", render: (p) => dash(p.companyId && companyName.get(p.companyId)), sortValue: (p) => (p.companyId ? companyName.get(p.companyId) ?? null : null) },
    ort: { key: "ort", header: "Bauort", render: (p) => dash(p.location), sortValue: (p) => p.location },
    verkaeufer: { key: "verkaeufer", header: "Verkäufer", render: (p) => dash(p.salespersonId && salesName.get(p.salespersonId)), sortValue: (p) => (p.salespersonId ? salesName.get(p.salespersonId) ?? null : null) },
    architekt: { key: "architekt", header: <abbr title="Architekt">Arch.</abbr>, render: (p) => teamCode(p.architectId, team), sortValue: (p) => (p.architectId ? teamCode(p.architectId, team) : null) },
    planer: { key: "planer", header: "Planer", render: (p) => teamCode(p.planerId, team), sortValue: (p) => (p.planerId ? teamCode(p.planerId, team) : null) },
    plangespraech: stepColumn("plangespraech"),
    baugesuch_uebergabe: stepColumn("baugesuch_uebergabe"),
    vertrag_versendet: stepColumn("vertrag_versendet"),
    vertrag_zurueck: stepColumn("vertrag_zurueck"),
    baugenehmigung: stepColumn("baugenehmigung"),
    baubetreuung: { key: "baubetreuung", header: "Baubetreuung", render: (p) => dash(p.baubetreuung), sortValue: (p) => p.baubetreuung },
    status: {
      key: "status",
      header: "Status",
      // Abgeschlossene und stornierte Projekte zeigen ihren Status statt der letzten Phase
      render: (p) => {
        if (p.status !== "aktiv") return <StatusPill status={p.status} />;
        const pr = progressOf(p, steps);
        return (
          <>
            <span className="cell-main">{phaseOf(p, steps).label}</span>
            <span className="cell-sub">
              {pr.done} von {pr.total} Schritten
            </span>
          </>
        );
      },
      sortValue: (p) => (p.status === "aktiv" ? phaseOf(p, steps).index : p.status === "abgeschlossen" ? 100 : 101),
    },
    fortschritt: {
      key: "fortschritt",
      header: "Schritte",
      render: (p) => {
        const pr = progressOf(p, steps);
        return <Progress done={pr.done} total={pr.total} />;
      },
      sortValue: (p) => progressOf(p, steps).done,
    },
    next: {
      key: "next",
      header: columnLabel.next,
      render: (p) => {
        const t = data && !pilot ? nextTaskFor(p.id, data.tasks) : null;
        if (t) {
          const overdue = Boolean(t.dueOn && t.dueOn < today);
          return (
            <span className="next-task" data-overdue={overdue} title={`${t.title}${t.dueOn ? `\n${overdue ? "überfällig seit" : "fällig"} ${formatDate(t.dueOn)}` : ""}`}>
              <span className="next-task-title">{t.title}</span>
              {t.dueOn && (
                <span className="cell-sub">
                  {overdue ? "überfällig seit " : "fällig "}
                  {formatDue(t.dueOn, today)}
                </span>
              )}
            </span>
          );
        }
        const s = p.status === "aktiv" ? nextStep(p, steps) : null;
        return s ? (
          <span className={pilot ? "next-task" : "next-task muted"} title={`Nächster Schritt: ${s.label}`}>
            <span className="next-task-title">{pilot ? s.label : `Schritt: ${s.label}`}</span>
          </span>
        ) : (
          <span className="muted">–</span>
        );
      },
    },
    warn: { key: "warn", header: <span className="sr-only">Warnung</span>, className: "warn-cell", render: (p) => <WarnIcon alerts={alertsByProject.get(p.id) ?? []} /> },
  };
  // Pfeil links und "Projekt öffnen" rechts stehen immer da; dazwischen die gewählten Spalten
  const columns = [toggleColumn, ...visibleColumns(columnState).map((k) => selectable[k]), openColumn];

  const phaseOptions = [{ value: "", label: "Alle Phasen" }, ...allPhases(steps).map((ph) => ({ value: ph.key, label: ph.label }))];

  return (
    <>
      {head}
      <div className="stack">
        {/* Im Pilot gibt es keine Prüfliste: angefangene Projekte aus einem Dokument stehen hier */}
        {pilot && staff && data && data.projectDrafts.some((d) => d.status === "offen") && (
          <DraftsCard drafts={data.projectDrafts.filter((d) => d.status === "offen")} title="Angefangene Projekte" />
        )}
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
            <Button icon={<SlidersHorizontal size={15} />} aria-expanded={filtersOpen} aria-controls="projekt-filter" onClick={() => setFiltersOpen((o) => !o)}>
              Filter{moreFilters > 0 && ` · ${moreFilters}`}
            </Button>
            <ColumnPanel state={columnState} labels={columnLabel} onChange={changeColumns} onReset={() => setColumnState(resetColumns(columnsKey))} />
          </div>
          {filtersOpen && (
            <div className="filters filters-more" id="projekt-filter">
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
              <div className="filters-checks">
                <Checkbox label="Nach Eingangsmonat gruppieren" checked={filters.group} onChange={(e) => setFilters({ group: e.target.checked })} />
                {tab === "alle" && <Checkbox label="Stornierte einblenden" checked={filters.storno} onChange={(e) => setFilters({ storno: e.target.checked })} />}
              </div>
            </div>
          )}
          <div className="filters-row2">
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
            <TableSkeleton rows={8} cols={columns.length} />
          ) : list.length ? (
            <DataTable
              compact
              label={TAB_TITLE[tab]}
              rows={list}
              columns={columns}
              rowKey={(p) => p.id}
              onRowClick={(p) => navigate(`/projekte/${p.id}`)}
              expand={(p) => <ProjectHistory projectId={p.id} id={historyId(p.id)} allHref={`/projekte/${p.id}?tab=aktivitaet`} />}
              isExpanded={(p) => openRows.has(p.id)}
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
