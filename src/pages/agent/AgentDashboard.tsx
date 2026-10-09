import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertOctagon, Bot, CheckCircle2, ClipboardCheck, Inbox, Mail, RefreshCw, ShieldCheck, Target } from "lucide-react";
import { BarChart, Legend } from "../../components/charts/BarChart";
import { PageHead } from "../../components/layout/PageHead";
import { useToast } from "../../components/Toast";
import { Button, Card, CardBody, CardHead, CellTip, DataTable, EmptyState, ErrorState, KpiCard, KpiSkeleton, Pill, Select, Skeleton, Switch, type Column } from "../../components/ui";
import { agentStats } from "../../agent/stats";
import { displayPath } from "../../lib/folders";
import { formatBytes, formatRelative } from "../../lib/format";
import { projectTitle } from "../../lib/projects";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import type { InboxAttachment, InboxItem, InboxStatus } from "../../lib/types";
import { ConfidencePill, InboxPill, MAILBOX_STATUS } from "./agentUi";

interface Row {
  att: InboxAttachment;
  item: InboxItem;
}

const SERIES = [{ name: "Automatisch abgelegt" }, { name: "Zur Prüfung" }];

/** Agent-Dashboard: Kennzahlen, Postfächer, Verlauf und die letzten Entscheidungen mit Begründung. */
export function AgentDashboard() {
  const { data, loading, error, reload, today, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"alle" | InboxStatus>("alle");
  const [limit, setLimit] = useState(12);
  const staff = user.role !== "freiberufler";

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const items = new Map(data.inboxItems.map((i) => [i.id, i]));
    return data.inboxAttachments
      .map((att) => ({ att, item: items.get(att.itemId)! }))
      .filter((r) => r.item)
      .sort((a, b) => b.item.receivedAt.localeCompare(a.item.receivedAt));
  }, [data]);

  const head = (
    <PageHead
      title="Posteingangs-Agent"
      sub="Liest die Postfächer (nur lesen), legt Kopien der Anhänge im Projektordner ab und begründet jede Entscheidung."
      actions={
        staff ? (
          <Button variant="primary" icon={<RefreshCw size={15} className={running ? "spin" : undefined} />} disabled={running} onClick={() => void runNow()}>
            {running ? "Prüfe Postfächer …" : "Jetzt prüfen"}
          </Button>
        ) : undefined
      }
    />
  );

  async function runNow() {
    setRunning(true);
    const res = await mutate((r) => r.runAgent());
    setRunning(false);
    if (!res.ok) return toast(res.error, "danger");
    const s = res.value;
    if (!s.fetched) {
      toast(s.waitingPaused ? `Keine neuen Mails. ${s.waitingPaused} Mail wartet in einem pausierten Postfach.` : "Keine neuen Mails.");
      return;
    }
    const parts = [`${s.filed} abgelegt`, `${s.toReview} zur Prüfung`, `${s.ignored} ignoriert`];
    if (s.errors) parts.push(`${s.errors} Fehler`);
    if (s.duplicates) parts.push(`${s.duplicates} Dublette übersprungen`);
    toast(`${s.fetched} Mails gelesen: ${parts.join(", ")}`);
  }

  if (!staff) {
    return (
      <>
        {head}
        <Card>
          <EmptyState title="Der Posteingangs-Agent ist nur für Mitarbeiter sichtbar" />
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
  if (loading || !data) {
    return (
      <>
        {head}
        <div className="stack">
          <div className="grid-kpi grid-kpi-5">
            {Array.from({ length: 5 }, (_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
          <Skeleton h={260} round />
        </div>
      </>
    );
  }

  const s = agentStats(data, today);
  const { autoFileThreshold: auto, suggestThreshold: suggest } = data.agentSettings;
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const mailbox = new Map(data.mailboxes.map((m) => [m.id, m]));
  const shown = rows.filter((r) => filter === "alle" || r.att.status === filter);

  const columns: Column<Row>[] = [
    { key: "time", header: "Zeit", render: (r) => <time dateTime={r.item.receivedAt}>{formatRelative(r.item.receivedAt)}</time>, sortValue: (r) => r.item.receivedAt },
    {
      key: "from",
      header: "Absender · Betreff",
      render: (r) => (
        <CellTip
          className="agent-mail"
          content={
            <>
              {r.item.subject}
              <span className="muted">
                {r.item.fromName} &lt;{r.item.fromEmail}&gt;
              </span>
            </>
          }
        >
          <span className="cell-main">{r.item.fromName}</span>
          <span className="cell-sub">{r.item.subject}</span>
        </CellTip>
      ),
    },
    {
      key: "file",
      header: "Datei",
      render: (r) => (
        <CellTip className="agent-file" content={r.att.fileName}>
          {r.att.fileName}
        </CellTip>
      ),
    },
    {
      key: "target",
      header: "Ziel",
      render: (r) => {
        const p = r.att.projectId ? projects.get(r.att.projectId) : null;
        if (!p || !r.att.folderPath) return <span className="muted">–</span>;
        const full = displayPath(r.att.folderPath);
        return (
          <CellTip
            className="agent-target"
            content={
              <>
                {projectTitle(p)}
                <span className="muted">{full}</span>
              </>
            }
          >
            <span className="cell-main">{projectTitle(p)}</span>
            <span className="cell-sub" aria-hidden>
              {full.split(" › ").slice(-2).join(" › ")}
            </span>
            <span className="sr-only">{full}</span>
          </CellTip>
        );
      },
    },
    { key: "conf", header: "Sicherheit", align: "right", render: (r) => <ConfidencePill value={r.att.confidence} auto={auto} suggest={suggest} />, sortValue: (r) => r.att.confidence ?? -1 },
    { key: "status", header: "Status", render: (r) => <InboxPill status={r.att.status} />, sortValue: (r) => r.att.status },
  ];

  async function reportWrong(att: InboxAttachment) {
    const res = await mutate((r) => r.reportWrongFiling(att.id));
    toast(res.ok ? "Zurück in der Prüfliste. Zählt gegen die Trefferquote." : res.error, res.ok ? "ok" : "danger");
  }

  return (
    <>
      {head}
      <div className="stack">
        <div className="grid-kpi grid-kpi-5">
          <KpiCard icon={<Inbox size={16} />} label="Heute verarbeitet" value={s.todayProcessed} foot="Mails aus allen Postfächern" />
          <KpiCard icon={<CheckCircle2 size={16} />} tone="ok" label="Automatisch abgelegt" value={s.todayAuto} foot={`heute, ab ${Math.round(auto * 100)} % Sicherheit`} />
          <KpiCard icon={<ClipboardCheck size={16} />} tone="warn" label="Zur Prüfung" value={s.openReview} foot="offen in der Prüfliste" to="/agent/pruefung" />
          <KpiCard icon={<AlertOctagon size={16} />} tone="danger" label="Fehler" value={s.openErrors} foot="nicht abgelegt (z. B. ausführbare Datei)" />
          <KpiCard
            icon={<Target size={16} />}
            tone="info"
            label="Trefferquote"
            value={s.hitRate == null ? "–" : `${Math.round(s.hitRate * 100)} %`}
            foot={`7 Tage, ${s.autoCount7} automatische Ablagen`}
            info="Anteil der automatisch abgelegten Anhänge, die später nicht als falsch gemeldet wurden."
          />
        </div>

        <div className="grid-2 agent-grid">
          <Card>
            <CardHead title="Postfächer" icon={<Mail size={16} />} actions={<Link to="/agent/postfaecher" className="btn btn-sm btn-ghost">Verwalten</Link>} />
            <ul className="mailbox-list">
              {data.mailboxes.map((m) => (
                <li key={m.id} className="mailbox-row">
                  <div className="mailbox-main">
                    <span className="cell-main">{m.label}</span>
                    <span className="cell-sub">{m.address}</span>
                  </div>
                  <div className="mailbox-state">
                    <Pill tone={MAILBOX_STATUS[m.status].tone}>{MAILBOX_STATUS[m.status].label}</Pill>
                    <span className="cell-sub">{m.lastCheckedAt ? `geprüft ${formatRelative(m.lastCheckedAt)}` : "noch nie geprüft"}</span>
                  </div>
                  <Switch
                    checked={m.status === "verbunden"}
                    label={m.status === "verbunden" ? `${m.label} pausieren` : `${m.label} fortsetzen`}
                    onChange={async (on) => {
                      const res = await mutate((r) => r.setMailboxStatus(m.id, on ? "verbunden" : "pausiert"));
                      toast(res.ok ? (on ? `${m.label} wird wieder gelesen` : `${m.label} pausiert`) : res.error, res.ok ? "ok" : "danger");
                    }}
                  />
                </li>
              ))}
            </ul>
            <p className="agent-safety">
              <ShieldCheck size={14} aria-hidden /> Nur lesen: Der Agent verschiebt, löscht und beantwortet keine Mails.
            </p>
          </Card>
          <Card>
            <CardHead title="Verarbeitete Anhänge pro Tag" sub="Letzte 7 Tage" actions={<Legend series={SERIES} />} />
            <CardBody>
              <BarChart caption="Verarbeitete Anhänge pro Tag" series={SERIES} height={220} data={s.perDay.map((d) => ({ label: d.label, title: d.title, values: [d.auto, d.review] }))} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHead
            title="Letzte Aktivitäten des Agenten"
            sub="Zeile anklicken für die Begründung"
            icon={<Bot size={16} />}
            actions={
              <Select
                aria-label="Status filtern"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                options={[
                  { value: "alle", label: "Alle Status" },
                  { value: "abgelegt", label: "Abgelegt" },
                  { value: "pruefen", label: "Zur Prüfung" },
                  { value: "ignoriert", label: "Ignoriert" },
                  { value: "fehler", label: "Fehler" },
                ]}
              />
            }
          />
          <div className="card-body flush">
            {shown.length ? (
              <>
                <DataTable
                  label="Letzte Aktivitäten des Agenten"
                  rows={shown.slice(0, limit)}
                  columns={columns}
                  rowKey={(r) => r.att.id}
                  compact
                  expand={(r) => (
                    <div className="agent-detail">
                      <p>
                        <strong>Begründung:</strong> {r.item.reason ?? "–"}
                      </p>
                      <p className="muted">
                        {r.item.fromName} &lt;{r.item.fromEmail}&gt; · Postfach {mailbox.get(r.item.mailboxId)?.label ?? "–"} · {formatBytes(r.att.sizeBytes)}
                        {r.att.corrected ? " · als falsch gemeldet" : ""}
                      </p>
                      {r.item.bodyExcerpt && <p className="agent-excerpt">„{r.item.bodyExcerpt}“</p>}
                      <div className="agent-detail-actions">
                        {r.att.status === "abgelegt" && r.att.projectId && (
                          <>
                            <Link to={`/projekte/${r.att.projectId}?tab=dokumente`} className="btn btn-sm">
                              Im Projekt ansehen
                            </Link>
                            <Button size="sm" variant="danger" onClick={() => void reportWrong(r.att)}>
                              Falsch zugeordnet
                            </Button>
                          </>
                        )}
                        {r.att.status === "pruefen" && (
                          <Button size="sm" variant="primary" onClick={() => navigate("/agent/pruefung")}>
                            Zur Prüfliste
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                />
                {shown.length > limit && (
                  <div className="card-foot">
                    <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + 20)}>
                      Ältere anzeigen
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="Noch keine Aktivitäten" text="Mit „Jetzt prüfen“ liest der Agent die Postfächer." />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
