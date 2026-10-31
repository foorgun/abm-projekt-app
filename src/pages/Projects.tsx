import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarDays, ChevronRight, FolderSearch, Search, SlidersHorizontal, X } from "lucide-react";
import { DateFilterButton, HeaderDateFilter } from "../components/DateFilterPanel";
import { ColumnPanel } from "../components/ColumnPanel";
import { GroupPanel } from "../components/GroupPanel";
import { DraftsCard } from "../components/DraftsCard";
import { ProjectHistory } from "../components/ProjectHistory";
import { PageHead } from "../components/layout/PageHead";
import { useNewProject } from "../components/NewProjectDialog";
import { Button, buttonClass, Card, Checkbox, DataTable, EmptyState, ErrorState, Input, Select, TableSkeleton, Tabs, type Column } from "../components/ui";
import { abmSortKey } from "../lib/abmNr";
import { isPilot } from "../lib/appMode";
import { bundeslandName, ortLabel } from "../lib/bundesland";
import { activeDateFilters, DATE_COLUMN_LABEL, DATE_COLUMNS, describeDateFilter, isDateColumn, type DateColumnKey, type DateFilter } from "../lib/dateFilters";
import { formatDate, todayIso } from "../lib/format";
import {
  clearFilters,
  DEFAULT_FILTERS,
  filterProjects,
  filtersFromParams,
  filtersStorageKey,
  filtersToParams,
  hasActiveFilters,
  loadSavedFilters,
  saveFilters,
  sortProjects,
  tabFilter,
  teamCode,
  type ProjectFilters,
  type ProjectSort,
  type ProjectTab,
} from "../lib/projectFilters";
import {
  COLUMN_LABEL,
  columnsStorageKey,
  loadColumns,
  resetColumns,
  saveColumns,
  visibleColumns,
  type ColumnKey,
  type ColumnState,
} from "../lib/projectColumns";
import { groupingStorageKey, groupProjects, loadGrouping, saveGrouping, DEFAULT_GROUPING, type GroupSetting } from "../lib/projectGrouping";
import { allPhases } from "../lib/projects";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";

const TAB_PATH: Record<ProjectTab, string> = { alle: "/projekte", aktiv: "/projekte/aktiv", abgeschlossen: "/projekte/abgeschlossen" };
const TAB_TITLE: Record<ProjectTab, string> = { alle: "Alle Projekte", aktiv: "Aktive Projekte", abgeschlossen: "Abgeschlossene Projekte" };

const historyId = (projectId: string) => `verlauf-${projectId}`;

export function Projects({ tab }: { tab: ProjectTab }) {
  const { data, loading, error, reload } = useData();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const openNewProject = useNewProject();
  const staff = user.role !== "freiberufler";
  const pilot = isPilot();
  // Filter stehen in der URL (Zurück aus dem Projekt, Reiterwechsel). Zusätzlich je Benutzer gespeichert: wer die Liste
  // ohne Filter in der URL öffnet (Navigation, neuer Tab), bekommt die zuletzt gewählten Filter zurück.
  const filtersKey = filtersStorageKey(user);
  const [restore, setRestore] = useState<URLSearchParams | null>(() => (params.toString() ? null : loadSavedFilters(filtersKey)));
  const filters = filtersFromParams(restore ?? params);
  useEffect(() => {
    if (!restore) return;
    setParams(restore, { replace: true });
    setRestore(null);
  }, [restore, setParams]);
  const filtersParam = filtersToParams(filters).toString();
  useEffect(() => {
    if (!restore) saveFilters(filtersKey, filtersFromParams(new URLSearchParams(filtersParam)));
  }, [filtersKey, filtersParam, restore]);
  const today = todayIso();
  // Spaltenauswahl und Reihenfolge: je Benutzer im Browser gespeichert (lib/projectColumns)
  const columnsKey = columnsStorageKey(user);
  const [columnState, setColumnState] = useState<ColumnState>(() => loadColumns(columnsKey));
  // Gruppierung: ebenso je Benutzer gespeichert; "Keine" setzt zurück
  const groupingKey = groupingStorageKey(user);
  const [grouping, setGrouping] = useState<GroupSetting>(() => loadGrouping(groupingKey));
  // Wer mit gesetztem Filter ankommt (z. B. vom Dashboard), sieht die Filterleiste gleich offen
  const moreFilters =
    [filters.company, filters.architect, filters.phase, filters.sort !== DEFAULT_FILTERS.sort, filters.storno].filter(Boolean).length + activeDateFilters(filters.dates).length;
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
  function changeGrouping(next: GroupSetting) {
    const value = next.mode === "keine" ? DEFAULT_GROUPING : next;
    setGrouping(value);
    saveGrouping(groupingKey, value);
  }

  const setFilters = useCallback(
    (patch: Partial<ProjectFilters>) => setParams(filtersToParams({ ...filters, ...patch }), { replace: true }),
    [filters, setParams],
  );
  const setDateFilter = (key: DateColumnKey, f: DateFilter | null) => {
    const dates = { ...filters.dates };
    if (f) dates[key] = f;
    else delete dates[key];
    setFilters({ dates });
  };
  const resetFilters = () => setParams(filtersToParams(clearFilters(filters)), { replace: true });

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
  const list = data ? sortProjects(filterProjects(data.projects, tab, filters, { steps, companies, today }), filters.sort, steps) : [];
  // Bezugsgröße für "12 von 123 Projekten": alle Projekte dieses Reiters (Freiberufler: nur ihre)
  const total = data ? data.projects.filter(tabFilter(tab, filters.storno)).length : 0;
  // Gruppen aus der gefilterten, sortierten Liste: innerhalb der Gruppe bleibt die Sortierung (Freiberufler: nur ihre Projekte)
  // Gruppen bringen ihre eigene Reihenfolge mit; bei der Standardsortierung ("Neueste zuerst") gilt innen ABM-Nr. numerisch
  const groupRows = grouping.mode !== "keine" && filters.sort === "eingang" ? sortProjects(list, "abm", steps) : list;
  const groups = data ? groupProjects(groupRows, grouping, { companies, team, salespeople: data.salespeople }) : null;
  const counts = data
    ? {
        alle: data.projects.filter(tabFilter("alle", filters.storno)).length,
        aktiv: data.projects.filter(tabFilter("aktiv", false)).length,
        abgeschlossen: data.projects.filter(tabFilter("abgeschlossen", false)).length,
      }
    : null;
  const filtered = hasActiveFilters(filters);
  const phaseLabel = (key: string) => allPhases(steps).find((ph) => ph.key === key)?.label ?? key;
  // Aktive Filter als entfernbare Chips über der Liste
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.q ? [{ key: "q", label: `Suche: „${filters.q}“`, remove: () => setFilters({ q: "" }) }] : []),
    ...(filters.company
      ? [{ key: "firma", label: `Fertighausfirma: ${filters.company === "-" ? "ohne Firma" : (companyName.get(filters.company) ?? "unbekannt")}`, remove: () => setFilters({ company: "" }) }]
      : []),
    ...(filters.architect ? [{ key: "architekt", label: `Architekt: ${teamCode(filters.architect, team)}`, remove: () => setFilters({ architect: "" }) }] : []),
    ...(filters.phase ? [{ key: "phase", label: `Phase: ${phaseLabel(filters.phase)}`, remove: () => setFilters({ phase: "" }) }] : []),
    ...activeDateFilters(filters.dates).map(([key, f]) => ({
      key: `d-${key}`,
      label: `${DATE_COLUMN_LABEL[key]}: ${describeDateFilter(f, today)}`,
      remove: () => setDateFilter(key, null),
    })),
  ];

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
  const companyOf = (p: Project) => (p.companyId ? companyName.get(p.companyId) ?? null : null);
  const salesOf = (p: Project) => (p.salespersonId ? salesName.get(p.salespersonId) ?? null : null);
  const stepColumn = (key: ColumnKey): Column<Project> => ({
    key,
    header: COLUMN_LABEL[key],
    className: "nowrap",
    render: (p) => (p.steps[key] ? formatDate(p.steps[key]!) : "–"),
    sortValue: (p) => p.steps[key] ?? null,
    ...(isDateColumn(key) && {
      headerAction: <HeaderDateFilter label={DATE_COLUMN_LABEL[key]} value={filters.dates[key]} today={today} onChange={(f) => setDateFilter(key, f)} />,
      headerActive: Boolean(filters.dates[key]),
    }),
  });
  // Wählbare Spalten wie in der Excel (Reihenfolge und Sichtbarkeit aus columnState). Leere Werte zeigen "–".
  const selectable: Record<ColumnKey, Column<Project>> = {
    // laufende Nummer der angezeigten Zeilen, nicht gespeichert
    nr: { key: "nr", header: COLUMN_LABEL.nr, className: "nowrap num-cell", align: "right", render: (_p, i) => i + 1 },
    firma: { key: "firma", header: COLUMN_LABEL.firma, render: (p) => dash(companyOf(p)), sortValue: companyOf },
    abm: {
      key: "abm",
      header: COLUMN_LABEL.abm,
      strong: true,
      className: "nowrap",
      render: (p) => (p.kind === "bauvoranfrage" ? <abbr title="Bauvoranfrage">BVA</abbr> : dash(p.abmNr)),
      // numerisch: erst Nummernkreis, dann Nummer (8185-633 vor 8185-1588)
      sortValue: (p) => abmSortKey(p.abmNr),
    },
    bauherr: { key: "bauherr", header: COLUMN_LABEL.bauherr, render: (p) => p.bauherrLabel, sortValue: (p) => p.bauherrLabel },
    bl_ort: {
      key: "bl_ort",
      header: COLUMN_LABEL.bl_ort,
      render: (p) => <span title={bundeslandName(p.bundesland) ?? undefined}>{dash(ortLabel(p.bundesland, p.location))}</span>,
      sortValue: (p) => ortLabel(p.bundesland, p.location),
    },
    verkaeufer: { key: "verkaeufer", header: COLUMN_LABEL.verkaeufer, render: (p) => dash(salesOf(p)), sortValue: salesOf },
    architekt: { key: "architekt", header: COLUMN_LABEL.architekt, render: (p) => teamCode(p.architectId, team), sortValue: (p) => (p.architectId ? teamCode(p.architectId, team) : null) },
    planer: { key: "planer", header: COLUMN_LABEL.planer, render: (p) => teamCode(p.planerId, team), sortValue: (p) => (p.planerId ? teamCode(p.planerId, team) : null) },
    plangespraech: stepColumn("plangespraech"),
    baugesuch_uebergabe: stepColumn("baugesuch_uebergabe"),
    vertrag_versendet: stepColumn("vertrag_versendet"),
    vertrag_zurueck: stepColumn("vertrag_zurueck"),
    baugenehmigung: stepColumn("baugenehmigung"),
    baubetreuung: { key: "baubetreuung", header: COLUMN_LABEL.baubetreuung, render: (p) => dash(p.baubetreuung), sortValue: (p) => p.baubetreuung },
    hausbau_nr: { key: "hausbau_nr", header: COLUMN_LABEL.hausbau_nr, className: "nowrap", render: (p) => dash(p.hausbauNr), sortValue: (p) => p.hausbauNr ?? null },
    bundesland: { key: "bundesland", header: COLUMN_LABEL.bundesland, render: (p) => <span title={bundeslandName(p.bundesland) ?? undefined}>{dash(p.bundesland)}</span>, sortValue: (p) => p.bundesland ?? null },
    ort: { key: "ort", header: COLUMN_LABEL.ort, render: (p) => dash(p.location), sortValue: (p) => p.location },
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
            <ColumnPanel state={columnState} labels={COLUMN_LABEL} onChange={changeColumns} onReset={() => setColumnState(resetColumns(columnsKey))} />
            <GroupPanel value={grouping} onChange={changeGrouping} />
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
              <div className="filters-dates" role="group" aria-label="Datumsfilter">
                <span className="field-label">Datum</span>
                {DATE_COLUMNS.map((c) => {
                  const f = filters.dates[c.key];
                  return (
                    <DateFilterButton
                      key={c.key}
                      label={c.label}
                      value={f}
                      today={today}
                      onChange={(next) => setDateFilter(c.key, next)}
                      trigger={(t) => (
                        <Button size="sm" variant={f ? "secondary" : "outline"} icon={<CalendarDays size={14} />} data-active={Boolean(f) || undefined} {...t}>
                          <span>
                            {c.label}
                            {f && <span className="muted">: {describeDateFilter(f, today)}</span>}
                          </span>
                        </Button>
                      )}
                    />
                  );
                })}
              </div>
              <div className="filters-checks">
                {tab === "alle" && <Checkbox label="Stornierte einblenden" checked={filters.storno} onChange={(e) => setFilters({ storno: e.target.checked })} />}
              </div>
            </div>
          )}
          <div className="filters-row2">
            {chips.length > 0 && (
              <ul className="chips filter-chips" aria-label="Aktive Filter">
                {chips.map((c) => (
                  <li key={c.key}>
                    <button type="button" className="chip filter-chip" onClick={c.remove} aria-label={`Filter entfernen: ${c.label}`} title="Filter entfernen">
                      {c.label}
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {filtered && (
              <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={resetFilters}>
                Alle Filter zurücksetzen
              </Button>
            )}
            <span className="muted" aria-live="polite" data-testid="treffer">
              {loading || !data
                ? "Lädt …"
                : filtered
                  ? `${list.length} von ${total} ${total === 1 ? "Projekt" : "Projekten"}`
                  : `${list.length} ${list.length === 1 ? "Projekt" : "Projekte"}`}
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
              groups={groups ?? undefined}
              stickyFirst
            />
          ) : (
            <EmptyState
              icon={<FolderSearch size={18} />}
              title={filtered ? "Keine Projekte für diese Filter" : "Noch keine Projekte"}
              text={filtered ? "Passe die Suche oder die Filter an." : undefined}
              action={
                filtered ? (
                  <Button size="sm" onClick={resetFilters}>
                    Alle Filter zurücksetzen
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
