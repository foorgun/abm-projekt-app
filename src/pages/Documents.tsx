import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, CalendarDays, ClipboardCheck, ExternalLink, File, FileImage, FileText, Files, FolderInput, Info, Mail, Search, Upload, X } from "lucide-react";
import { FolderPicker } from "../components/FolderPicker";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, buttonClass, Card, CellTip, DataTable, Dialog, Drawer, EmptyState, ErrorState, Field, Input, KpiCard, Pill, Select, TableSkeleton, Tabs, type Column } from "../components/ui";
import { documentStats, KIND_LABEL, PERIOD_LABEL, type DocKind, type DocPeriod, type DocumentFilter, type DocumentListResult, type DocumentRow } from "../lib/documentFilters";
import { checkFile, fileKind } from "../lib/files";
import { concretePath, DATE_TOKEN, displayPath } from "../lib/folders";
import { formatBytes, formatDate, formatRelative } from "../lib/format";
import { projectTitle } from "../lib/projects";
import { useOpenDocument } from "../components/useOpenDocument";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import { NARROW, useMediaQuery } from "../lib/useMedia";

const KIND_ICON = { pdf: FileText, bild: FileImage, office: FileText, mail: Mail, datei: File };
const PAGE = 40;
type Source = "" | "agent" | "upload";

function titleOf(p: DocumentRow["project"]): string {
  return p ? projectTitle(p) : "–";
}

/**
 * Alle Dokumente über alle Projekte. Daten kommen über Repo.listDocuments (Filter wie in der Datenbank),
 * Filter stehen in der URL. Zeilenklick öffnet ein Seitenpanel mit Metadaten; bei Agent-Dateien mit Mail und Begründung.
 * Freiberufler sehen nur Dokumente zugewiesener Projekte.
 */
export function Documents() {
  const { data, repo, today, reviewCount } = useData();
  const { user } = useSession();
  const narrow = useMediaQuery(NARROW);
  const staff = user.role !== "freiberufler";
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<DocumentListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [q, setQ] = useState(params.get("q") ?? "");

  const filter = useMemo<DocumentFilter>(
    () => ({
      q: params.get("q") ?? "",
      projectId: params.get("projekt") ?? undefined,
      mainFolder: params.get("ordner") ?? undefined,
      source: (params.get("quelle") as "agent" | "upload" | null) ?? undefined,
      kind: (params.get("typ") as DocKind | null) ?? undefined,
      period: (params.get("zeitraum") as DocPeriod | null) ?? "alle",
    }),
    [params],
  );
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  // Suche leicht verzögert in die URL schreiben (nicht bei jedem Tastendruck neu laden)
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) set({ q: q.trim() || null });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Laden über das Repo; neu laden, wenn sich Filter, Seite oder der Datenbestand (z. B. nach Upload) ändern
  const seq = useRef(0);
  useEffect(() => {
    if (!data) return;
    const mine = ++seq.current;
    setError(null);
    repo
      .listDocuments({ ...filter, limit })
      .then((r) => mine === seq.current && setResult(r))
      .catch((e) => mine === seq.current && setError(e instanceof Error ? e.message : String(e)));
  }, [repo, filter, limit, data, retry]);

  const stats = useMemo(() => documentStats(data?.documents ?? [], today), [data, today]);
  const mainFolders = useMemo(() => (data?.folderTemplates ?? []).filter((t) => t.parentPath === null), [data]);
  const projectOptions = useMemo(() => {
    const withDocs = new Set((data?.documents ?? []).map((d) => d.projectId));
    return (data?.projects ?? []).filter((p) => withDocs.has(p.id)).sort((a, b) => a.bauherrLabel.localeCompare(b.bauherrLabel, "de"));
  }, [data]);
  const filtered = Boolean(filter.q || filter.projectId || filter.mainFolder || filter.source || filter.kind || (filter.period && filter.period !== "alle"));

  const head = (
    <PageHead
      title="Dokumente"
      sub={staff ? "Alle abgelegten Dateien über alle Projekte, vom Agenten oder von Hand." : "Dateien deiner zugewiesenen Projekte."}
      actions={
        <Button variant="primary" icon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
          Datei hochladen
        </Button>
      }
    />
  );

  const columns: Column<DocumentRow>[] = [
    {
      key: "name",
      header: "Name",
      strong: true,
      render: (r) => {
        const Icon = KIND_ICON[fileKind(r.doc.name, r.doc.mime)];
        return (
          <span className="doc-name">
            <Icon size={16} aria-hidden />
            <CellTip className="doc-name-text" content={r.doc.name}>
              {r.doc.name}
            </CellTip>
          </span>
        );
      },
      sortValue: (r) => r.doc.name.toLowerCase(),
    },
    { key: "project", header: "Projekt", render: (r) => titleOf(r.project), sortValue: (r) => r.project?.bauherrLabel ?? "" },
    {
      key: "folder",
      header: "Ordner",
      render: (r) => {
        const full = displayPath(r.doc.folderPath);
        const parts = full.split(" › ");
        return (
          <CellTip className="doc-folder" content={full}>
            <span aria-hidden>{parts.length > 2 ? `${parts[0].slice(0, 2)} … › ${parts[parts.length - 1]}` : full}</span>
            <span className="sr-only">{full}</span>
          </CellTip>
        );
      },
      sortValue: (r) => r.doc.folderPath,
    },
    { key: "source", header: "Quelle", render: (r) => <SourcePill source={r.doc.source} />, sortValue: (r) => r.doc.source },
    { key: "size", header: "Größe", align: "right", render: (r) => formatBytes(r.doc.sizeBytes), sortValue: (r) => r.doc.sizeBytes ?? 0 },
    { key: "date", header: "Datum", align: "right", render: (r) => formatDate(r.doc.receivedOn), sortValue: (r) => r.doc.createdAt },
  ];

  return (
    <>
      {head}
      <div className="stack">
        <div className={staff ? "grid-kpi" : "grid-kpi grid-kpi-3"}>
          <KpiCard icon={<Files size={16} />} label="Dateien gesamt" value={stats.total.toLocaleString("de-DE")} foot={staff ? "über alle Projekte" : "in deinen Projekten"} />
          <KpiCard icon={<CalendarDays size={16} />} label="Diese Woche abgelegt" value={stats.week} foot="seit Montag" />
          <KpiCard icon={<Bot size={16} />} tone="info" label="Davon vom Agenten" value={stats.weekAgent} foot={stats.week ? `${Math.round((stats.weekAgent / stats.week) * 100)} % dieser Woche` : "diese Woche"} />
          {staff && <KpiCard icon={<ClipboardCheck size={16} />} tone="warn" label="Zur Prüfung" value={reviewCount} foot="offen in der Prüfliste" to="/agent/pruefung" />}
        </div>

        <Card>
          <div className="filters" role="search">
            <Input icon={<Search size={15} />} type="search" placeholder="Dateiname, Projekt, Absender" aria-label="Dokumente durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select
              aria-label="Projekt"
              value={filter.projectId ?? ""}
              onChange={(e) => set({ projekt: e.target.value || null })}
              options={[{ value: "", label: "Alle Projekte" }, ...projectOptions.map((p) => ({ value: p.id, label: projectTitle(p) }))]}
            />
            <Select
              aria-label="Dateityp"
              value={filter.kind ?? ""}
              onChange={(e) => set({ typ: e.target.value || null })}
              options={[{ value: "", label: "Alle Typen" }, ...(Object.keys(KIND_LABEL) as DocKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))]}
            />
            <Select
              aria-label="Zeitraum"
              value={filter.period ?? "alle"}
              onChange={(e) => set({ zeitraum: e.target.value === "alle" ? null : e.target.value })}
              options={(Object.keys(PERIOD_LABEL) as DocPeriod[]).map((k) => ({ value: k, label: PERIOD_LABEL[k] }))}
            />
          </div>
          <div className="filters-row2 doc-filters">
            <Tabs<Source>
              label="Quelle"
              variant="segmented"
              value={(filter.source ?? "") as Source}
              onChange={(v) => set({ quelle: v || null })}
              items={[
                { key: "", label: "Alle" },
                { key: "agent", label: "Agent" },
                { key: "upload", label: "Upload" },
              ]}
            />
            <div className="chips" role="group" aria-label="Hauptordner">
              {mainFolders.map((f) => {
                const nr = f.label.slice(0, 2);
                const on = filter.mainFolder === nr;
                return (
                  <button key={f.path} type="button" className="chip" aria-pressed={on} title={f.label} onClick={() => set({ ordner: on ? null : nr })}>
                    {nr} <span className="chip-name">{f.label.slice(3).split(/[ ,]/)[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filters-row2">
            <span className="muted" aria-live="polite">
              {result ? `${result.total.toLocaleString("de-DE")} ${result.total === 1 ? "Datei" : "Dateien"}` : "Lädt …"}
            </span>
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={() => {
                  setQ("");
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Filter zurücksetzen
              </Button>
            )}
          </div>

          {error ? (
            <ErrorState message={error} onRetry={() => setRetry((n) => n + 1)} />
          ) : !result ? (
            <TableSkeleton rows={8} cols={6} />
          ) : !result.rows.length ? (
            <EmptyState
              icon={<Files size={18} />}
              title={filtered ? "Keine Dateien für diese Filter" : "Noch keine Dateien"}
              text={filtered ? "Passe die Suche oder die Filter an." : "Dateien kommen über den Agenten oder per Upload."}
              action={
                filtered ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setQ("");
                      setParams(new URLSearchParams(), { replace: true });
                    }}
                  >
                    Filter zurücksetzen
                  </Button>
                ) : undefined
              }
            />
          ) : narrow ? (
            <ul className="invoice-cards" aria-label="Dokumente">
              {result.rows.map((r) => {
                const Icon = KIND_ICON[fileKind(r.doc.name, r.doc.mime)];
                return (
                  <li key={r.doc.id}>
                    <button type="button" className="doc-card" onClick={() => setSelected(r)}>
                      <span className="doc-card-top">
                        <Icon size={16} aria-hidden />
                        <span className="doc-card-name">{r.doc.name}</span>
                      </span>
                      <span className="doc-card-sub">{titleOf(r.project)}</span>
                      <span className="doc-card-sub muted">{displayPath(r.doc.folderPath).split(" › ").slice(-1)[0]}</span>
                      <span className="invoice-card-meta">
                        <SourcePill source={r.doc.source} />
                        <span className="muted">
                          {formatDate(r.doc.receivedOn)} · {formatBytes(r.doc.sizeBytes)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <DataTable label="Dokumente" rows={result.rows} columns={columns} rowKey={(r) => r.doc.id} onRowClick={setSelected} compact stickyFirst />
          )}
          {result && result.rows.length < result.total && (
            <div className="card-foot">
              <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                Weitere anzeigen ({result.rows.length} von {result.total.toLocaleString("de-DE")})
              </Button>
            </div>
          )}
        </Card>
      </div>

      {selected && <DocumentPanel row={selected} demo={repo.mode === "demo"} onClose={() => setSelected(null)} />}
      {uploadOpen && <UploadDialog defaultProjectId={filter.projectId ?? null} onClose={() => setUploadOpen(false)} />}
    </>
  );
}

function SourcePill({ source }: { source: "agent" | "upload" }) {
  return source === "agent" ? (
    <Pill tone="info">
      <Bot size={12} aria-hidden /> Agent
    </Pill>
  ) : (
    <Pill>Upload</Pill>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dl-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DocumentPanel({ row, demo, onClose }: { row: DocumentRow; demo: boolean; onClose: () => void }) {
  const { doc, project, mail } = row;
  const staff = useSession().user.role !== "freiberufler";
  const open = useOpenDocument();
  const kind = fileKind(doc.name, doc.mime);
  const KIND_TEXT = { pdf: "PDF", bild: "Bild", office: "Office-Dokument", mail: "Mail", datei: "Datei" };
  return (
    <Drawer
      title={doc.name}
      onClose={onClose}
      footer={
        project ? (
          <>
            <Link to={`/projekte/${project.id}`} className={buttonClass("outline")} onClick={onClose}>
              Zum Projekt
            </Link>
            <Link to={`/projekte/${project.id}?tab=dokumente&ordner=${encodeURIComponent(doc.folderPath)}`} className={buttonClass("primary")} onClick={onClose}>
              <FolderInput size={15} aria-hidden /> Im Ordner anzeigen
            </Link>
          </>
        ) : undefined
      }
    >
      <section className="drawer-section">
        <h3>Datei</h3>
        <dl className="dl">
          <Row label="Projekt">{titleOf(project)}</Row>
          <Row label="Ordner">{displayPath(doc.folderPath)}</Row>
          <Row label="Quelle">
            <SourcePill source={doc.source} />
          </Row>
          <Row label="Typ">
            {KIND_TEXT[kind]}
            {doc.mime ? ` (${doc.mime})` : ""}
          </Row>
          <Row label="Größe">{formatBytes(doc.sizeBytes) || "–"}</Row>
          <Row label="Abgelegt">
            {formatDate(doc.receivedOn)} <span className="muted">· {formatRelative(doc.createdAt)}</span>
          </Row>
          <Row label="Von">{doc.source === "agent" ? "Posteingangs-Agent" : doc.uploadedBy ?? "–"}</Row>
        </dl>
      </section>

      {doc.source === "agent" && (
        <section className="drawer-section">
          <h3>Aus dieser Mail</h3>
          {mail ? (
            <dl className="dl">
              <Row label="Betreff">{mail.subject || "(ohne Betreff)"}</Row>
              <Row label="Absender">
                {mail.fromName}
                <span className="cell-sub">{mail.fromEmail}</span>
              </Row>
              <Row label="Empfangen">{formatRelative(mail.receivedAt)}</Row>
              {mail.confidence != null && <Row label="Sicherheit">{Math.round(mail.confidence * 100)} %</Row>}
              <Row label="Begründung">{mail.reason ?? "–"}</Row>
            </dl>
          ) : (
            <p className="muted">
              {staff
                ? "Zu dieser Datei ist keine Mail gespeichert."
                : "Die Angaben zur Mail sind nur für Mitarbeiter sichtbar."}
            </p>
          )}
        </section>
      )}

      {open && (
        <Button variant="outline" icon={<ExternalLink size={15} />} onClick={() => open(doc)}>
          Datei öffnen
        </Button>
      )}
      <p className="drawer-note">
        <Info size={14} aria-hidden />
        {demo
          ? "Vorschau und Download gibt es im Demo-Modus nicht: Die Demo speichert nur Angaben zur Datei (Name, Größe, Ordner), keine Inhalte. Im Echtbetrieb liegen die Dateien im privaten Speicher und lassen sich hier öffnen."
          : "Die Datei liegt im privaten Speicher des Projekts. Der Link zum Öffnen gilt eine Minute und nur für dich."}
      </p>
    </Drawer>
  );
}

function UploadDialog({ defaultProjectId, onClose }: { defaultProjectId: string | null; onClose: () => void }) {
  const { data, mutate, today } = useData();
  const toast = useToast();
  const projects = useMemo(() => (data?.projects ?? []).filter((p) => p.status !== "storno").sort((a, b) => a.bauherrLabel.localeCompare(b.bauherrLabel, "de")), [data]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [template, setTemplate] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const checks = files.map((f) => ({ f, check: checkFile(f.name, f.size) }));
  const valid = checks.filter((c) => c.check.ok).map((c) => c.f);
  const folderPath = template ? (template.includes(DATE_TOKEN) ? (date ? concretePath(template, date) : null) : template) : null;
  const ready = Boolean(projectId && folderPath && valid.length);

  async function submit() {
    if (!ready || !folderPath) return;
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const f of valid) {
      const res = await mutate((r) => r.uploadDocument({ projectId, folderPath, file: { name: f.name, size: f.size, type: f.type }, blob: f }));
      if (res.ok) ok++;
      else errors.push(`${f.name}: ${res.error}`);
    }
    setBusy(false);
    if (errors.length) toast("Nicht alles wurde abgelegt", "danger", errors.join(" · "));
    if (ok) {
      const p = projects.find((x) => x.id === projectId);
      toast(`${ok} ${ok === 1 ? "Datei" : "Dateien"} abgelegt`, "ok", `${p ? projectTitle(p) : ""} › ${displayPath(folderPath).split(" › ").pop()}`);
      onClose();
    }
  }

  return (
    <Dialog
      title="Datei hochladen"
      wide
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!ready || busy} onClick={() => void submit()}>
            {busy ? "Wird abgelegt …" : valid.length > 1 ? `${valid.length} Dateien ablegen` : "Ablegen"}
          </Button>
        </>
      }
    >
      <Field label="Projekt *" htmlFor="up-project">
        <Select id="up-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={[{ value: "", label: "Projekt wählen" }, ...projects.map((p) => ({ value: p.id, label: projectTitle(p) }))]} />
      </Field>
      <Field label="Zielordner *" htmlFor="up-folder" hint={folderPath ? `Ziel: ${displayPath(folderPath)}` : "Ordner aus der Vorlage wählen."}>
        <FolderPicker templates={data?.folderTemplates ?? []} value={template} onChange={setTemplate} />
      </Field>
      {template?.includes(DATE_TOKEN) && (
        <Field label="Datum für den Ordner *" htmlFor="up-date">
          <Input id="up-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <Field label="Dateien *" htmlFor="up-files" hint="PDF, Office, Bilder, Mails bis 50 MB. CAD-Dateien (.dwg, .pln) bleiben auf dem Fileserver.">
        <div
          className="upload-drop"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files);
            setFiles((old) => [...old, ...dropped]);
          }}
        >
          <Button icon={<Upload size={15} />} onClick={() => input.current?.click()}>
            Dateien auswählen
          </Button>
          <span className="muted">oder hierher ziehen</span>
          <input
            id="up-files"
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              // sofort auslesen: nach dem Zurücksetzen des Feldes ist die Liste leer
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              setFiles((old) => [...old, ...picked]);
            }}
          />
        </div>
      </Field>
      {checks.length > 0 && (
        <ul className="upload-list">
          {checks.map(({ f, check }, i) => (
            <li key={`${f.name}-${i}`} data-ok={check.ok}>
              <span className="upload-name">{f.name}</span>
              <span className="upload-state">{check.ok ? formatBytes(f.size) : `Wird nicht abgelegt: ${check.reason}`}</span>
              <button type="button" aria-label={`${f.name} entfernen`} onClick={() => setFiles((old) => old.filter((_, j) => j !== i))}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
