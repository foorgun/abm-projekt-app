import { useState, type FormEvent } from "react";
import { Ban, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2, Workflow } from "lucide-react";
import { FolderPicker } from "../../components/FolderPicker";
import { PageHead } from "../../components/layout/PageHead";
import { useToast } from "../../components/Toast";
import { Button, Card, CardBody, CardHead, DataTable, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Pill, Select, Skeleton, Switch, type Column } from "../../components/ui";
import { displayPath } from "../../lib/folders";
import { formatRelative } from "../../lib/format";
import { projectTitle } from "../../lib/projects";
import type { MailboxInput } from "../../lib/repo";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import type { AgentRule, Mailbox, MailboxProvider } from "../../lib/types";
import { MAILBOX_STATUS, PROVIDER_LABEL } from "./agentUi";

/** Postfächer, Regeln, Schwellenwerte und Ignorier-Liste. Im Demo-Modus nur lokale Änderungen. */
export function Mailboxes() {
  const { data, loading, error, reload, mutate, repo } = useData();
  const { user } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState<MailboxInput | null>(null);
  const staff = user.role !== "freiberufler";
  const admin = user.role === "admin";

  const head = (
    <PageHead
      title="Postfächer"
      sub={repo.mode === "demo" ? "Demo-Modus: Änderungen gelten nur bis zum Neuladen der Seite." : "Postfächer, Regeln und Schwellen des Agenten."}
      actions={
        staff ? (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing({ label: "", address: "", provider: "microsoft365", watchFolder: "Posteingang" })}>
            Postfach hinzufügen
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
          <EmptyState title="Postfächer sind nur für Mitarbeiter sichtbar" />
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
        <Skeleton h={300} round />
      </>
    );
  }

  const columns: Column<Mailbox>[] = [
    {
      key: "name",
      header: "Postfach",
      strong: true,
      render: (m) => (
        <>
          <span className="cell-main">{m.label}</span>
          <span className="cell-sub">{m.address}</span>
        </>
      ),
    },
    { key: "provider", header: "Anbieter", render: (m) => PROVIDER_LABEL[m.provider] },
    { key: "folder", header: "Überwachter Ordner", render: (m) => m.watchFolder },
    { key: "status", header: "Status", render: (m) => <Pill tone={MAILBOX_STATUS[m.status].tone}>{MAILBOX_STATUS[m.status].label}</Pill> },
    { key: "checked", header: "Zuletzt geprüft", render: (m) => (m.lastCheckedAt ? formatRelative(m.lastCheckedAt) : "noch nie") },
    {
      key: "actions",
      header: <span className="sr-only">Aktionen</span>,
      align: "right",
      render: (m) => (
        <span className="row-actions">
          <Switch
            checked={m.status === "verbunden"}
            label={m.status === "verbunden" ? `${m.label} pausieren` : `${m.label} fortsetzen`}
            onChange={async (on) => {
              const res = await mutate((r) => r.setMailboxStatus(m.id, on ? "verbunden" : "pausiert"));
              if (!res.ok) toast(res.error, "danger");
            }}
          />
          <IconButton label={`${m.label} bearbeiten`} size="sm" onClick={() => setEditing({ id: m.id, label: m.label, address: m.address, provider: m.provider, watchFolder: m.watchFolder })}>
            <Pencil size={14} />
          </IconButton>
        </span>
      ),
    },
  ];

  return (
    <>
      {head}
      <div className="stack">
        <Card>
          <CardHead title="Postfächer" sub="Der Agent liest neue Mails seit der letzten Prüfung. Pausierte Postfächer werden nicht gelesen." />
          <div className="card-body flush">
            <DataTable label="Postfächer" rows={data.mailboxes} columns={columns} rowKey={(m) => m.id} compact />
          </div>
        </Card>

        <div className="grid-2">
          <RulesCard />
          <div className="stack">
            <ThresholdCard canEdit={admin} />
            <IgnoreCard />
          </div>
        </div>

        <Card>
          <CardHead title="Was der Agent darf" icon={<ShieldCheck size={16} />} />
          <CardBody>
            <ul className="rules-list">
              <li>Liest Postfächer nur. Er verschiebt, löscht und beantwortet keine Mails.</li>
              <li>Legt Kopien der Anhänge im Projektordner ab, nie in Ordner außerhalb der Vorlage, und überschreibt nichts.</li>
              <li>Unsichere Zuordnungen kommen in die Prüfliste, nicht automatisch ins Archiv.</li>
              <li>Ausführbare Dateien und Archive mit Passwort werden nie abgelegt. CAD-Dateien bleiben auf dem Fileserver.</li>
              <li>Ein KI-Modell sieht nur Betreff, Absender, Dateinamen und einen kurzen Textauszug. Seine Antwort wird gegen erlaubte Projekte und Ordner geprüft; ein KI-Vorschlag allein legt nie automatisch ab.</li>
              <li>Jede Entscheidung wird mit Begründung protokolliert.</li>
            </ul>
          </CardBody>
        </Card>
      </div>

      {editing && <MailboxDialog initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MailboxDialog({ initial, onClose }: { initial: MailboxInput; onClose: () => void }) {
  const { mutate } = useData();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await mutate((r) => r.saveMailbox(v));
    if (!res.ok) return setErr(res.error);
    toast(initial.id ? "Postfach gespeichert" : "Postfach angelegt (pausiert, bis die Verbindung eingerichtet ist)");
    onClose();
  }

  return (
    <Dialog
      title={initial.id ? "Postfach bearbeiten" : "Postfach hinzufügen"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" type="submit" form="mailbox-form">
            Speichern
          </Button>
        </>
      }
    >
      <form id="mailbox-form" className="dialog-form" onSubmit={submit}>
        <Field label="Name" htmlFor="mb-label">
          <Input id="mb-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="z. B. Sammelpostfach" required />
        </Field>
        <Field label="Adresse" htmlFor="mb-address">
          <Input id="mb-address" type="email" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder="info@…" required />
        </Field>
        <div className="dialog-row">
          <Field label="Anbieter" htmlFor="mb-provider">
            <Select
              id="mb-provider"
              value={v.provider}
              onChange={(e) => setV({ ...v, provider: e.target.value as MailboxProvider })}
              options={(Object.keys(PROVIDER_LABEL) as MailboxProvider[]).map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
            />
          </Field>
          <Field label="Ordner überwachen" htmlFor="mb-folder">
            <Input id="mb-folder" value={v.watchFolder} onChange={(e) => setV({ ...v, watchFolder: e.target.value })} />
          </Field>
        </div>
        <p className="field-hint">
          Zugangsdaten werden hier nicht eingegeben. Im Echtbetrieb: App-Registrierung in Microsoft 365 nur mit „Mail.Read“, auf diese Postfächer
          beschränkt; das Geheimnis liegt in Supabase Vault (BUILD.md Schritt 9).
        </p>
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function RulesCard() {
  const { data, mutate } = useData();
  const toast = useToast();
  const [kind, setKind] = useState<"absender_projekt" | "absender_ordner">("absender_ordner");
  const [match, setMatch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const rules = data!.agentRules.filter((r) => r.kind !== "ignorieren");
  const projects = new Map(data!.projects.map((p) => [p.id, p]));

  async function add(e: FormEvent) {
    e.preventDefault();
    const res = await mutate((r) => r.saveAgentRule({ kind, match, projectId: kind === "absender_projekt" ? projectId || null : null, folderPath: kind === "absender_ordner" ? folder : null }));
    if (!res.ok) return toast(res.error, "danger");
    toast("Regel gespeichert. Sie wirkt ab dem nächsten Lauf.");
    setMatch("");
  }

  const valid = match.trim().length > 2 && (kind === "absender_projekt" ? Boolean(projectId) : Boolean(folder));

  return (
    <Card>
      <CardHead title="Regeln" icon={<Workflow size={16} />} sub="Regeln haben Vorrang vor Schlüsselwörtern und KI." />
      {rules.length ? (
        <ul className="rule-list">
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} target={r.kind === "absender_projekt" ? (projects.get(r.projectId ?? "") ? projectTitle(projects.get(r.projectId!)!) : "–") : displayPath(r.folderPath ?? "").replace("{datum}", "…")} />
          ))}
        </ul>
      ) : (
        <EmptyState title="Noch keine Regeln" text="Regeln entstehen auch in der Prüfliste über „Regel merken“." />
      )}
      <form className="rule-form" onSubmit={add}>
        <div className="dialog-row">
          <Field label="Art" htmlFor="rule-kind">
            <Select
              id="rule-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              options={[
                { value: "absender_ordner", label: "Absender → Ordner" },
                { value: "absender_projekt", label: "Absender → Projekt" },
              ]}
            />
          </Field>
          <Field label="Absender" htmlFor="rule-match" hint="Adresse oder @domain">
            <Input id="rule-match" value={match} onChange={(e) => setMatch(e.target.value)} placeholder="eingang@amt.example" />
          </Field>
        </div>
        {kind === "absender_projekt" ? (
          <Field label="Projekt" htmlFor="rule-project">
            <Select
              id="rule-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[{ value: "", label: "Projekt wählen" }, ...data!.projects.filter((p) => p.status === "aktiv").map((p) => ({ value: p.id, label: projectTitle(p) }))]}
            />
          </Field>
        ) : (
          <Field label="Ordner" htmlFor="rule-folder">
            <FolderPicker templates={data!.folderTemplates} value={folder} onChange={setFolder} />
          </Field>
        )}
        <div>
          <Button type="submit" icon={<Plus size={15} />} disabled={!valid}>
            Regel anlegen
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RuleRow({ rule, target }: { rule: AgentRule; target: string }) {
  const { mutate } = useData();
  const toast = useToast();
  return (
    <li className="rule-row">
      <div className="rule-main">
        <span className="cell-main">{rule.match}</span>
        <span className="cell-sub" title={target}>
          {rule.kind === "absender_projekt" ? "→ Projekt " : rule.kind === "absender_ordner" ? "→ Ordner " : ""}
          {target}
        </span>
      </div>
      <span className="cell-sub">{rule.createdBy ?? ""}</span>
      <IconButton
        label={`Regel für ${rule.match} entfernen`}
        size="sm"
        onClick={async () => {
          const res = await mutate((r) => r.removeAgentRule(rule.id));
          toast(res.ok ? "Regel entfernt" : res.error, res.ok ? "ok" : "danger");
        }}
      >
        <Trash2 size={14} />
      </IconButton>
    </li>
  );
}

function ThresholdCard({ canEdit }: { canEdit: boolean }) {
  const { data, mutate } = useData();
  const toast = useToast();
  const s = data!.agentSettings;
  const [auto, setAuto] = useState(Math.round(s.autoFileThreshold * 100));
  const [suggest, setSuggest] = useState(Math.round(s.suggestThreshold * 100));
  const dirty = auto !== Math.round(s.autoFileThreshold * 100) || suggest !== Math.round(s.suggestThreshold * 100);
  const valid = suggest >= 0 && suggest < auto && auto <= 100;

  return (
    <Card>
      <CardHead title="Schwellenwerte" icon={<SlidersHorizontal size={16} />} sub={canEdit ? "Sicherheit = kleinerer Wert aus Projekt- und Ordnererkennung." : "Nur Admins können die Schwellen ändern."} />
      <CardBody>
        <div className="thresholds">
          <Field label={`Automatisch ablegen ab ${auto} %`} htmlFor="th-auto">
            <input id="th-auto" type="range" min={50} max={100} value={auto} disabled={!canEdit} onChange={(e) => setAuto(Number(e.target.value))} className="range" />
          </Field>
          <Field label={`Vorschlag in der Prüfliste ab ${suggest} %`} htmlFor="th-suggest" hint="Darunter: Prüfliste ohne Vorschlag.">
            <input id="th-suggest" type="range" min={0} max={95} value={suggest} disabled={!canEdit} onChange={(e) => setSuggest(Number(e.target.value))} className="range" />
          </Field>
          <div className="threshold-scale" aria-hidden>
            <span style={{ width: `${suggest}%` }} className="seg seg-none" />
            <span style={{ width: `${Math.max(0, auto - suggest)}%` }} className="seg seg-review" />
            <span style={{ width: `${100 - auto}%` }} className="seg seg-auto" />
          </div>
          <div className="threshold-legend">
            <span>ohne Vorschlag</span>
            <span>Prüfliste</span>
            <span>automatisch</span>
          </div>
          {!valid && <p className="form-error">Der Vorschlag muss unter der Auto-Ablage liegen.</p>}
          {canEdit && (
            <div>
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty || !valid}
                onClick={async () => {
                  const res = await mutate((r) => r.saveAgentSettings({ autoFileThreshold: auto / 100, suggestThreshold: suggest / 100 }));
                  toast(res.ok ? "Schwellen gespeichert" : res.error, res.ok ? "ok" : "danger");
                }}
              >
                Speichern
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function IgnoreCard() {
  const { data, mutate } = useData();
  const toast = useToast();
  const [match, setMatch] = useState("");
  const list = data!.agentRules.filter((r) => r.kind === "ignorieren");
  return (
    <Card>
      <CardHead title="Ignorier-Liste" icon={<Ban size={16} />} sub="Newsletter und Werbung. Signaturbilder ignoriert der Agent automatisch." />
      {list.length > 0 && (
        <ul className="rule-list">
          {list.map((r) => (
            <RuleRow key={r.id} rule={r} target="wird ignoriert" />
          ))}
        </ul>
      )}
      <form
        className="rule-form rule-form-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await mutate((r) => r.saveAgentRule({ kind: "ignorieren", match, projectId: null, folderPath: null }));
          if (!res.ok) return toast(res.error, "danger");
          setMatch("");
          toast("Absender wird ignoriert");
        }}
      >
        <Input aria-label="Absender ignorieren" placeholder="@newsletter.example oder Adresse" value={match} onChange={(e) => setMatch(e.target.value)} />
        <Button type="submit" icon={<Plus size={15} />} disabled={match.trim().length < 3}>
          Hinzufügen
        </Button>
      </form>
    </Card>
  );
}
