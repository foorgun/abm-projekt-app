import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, Check, ClipboardCheck, FileText, FlaskConical, ListPlus, Pencil, Search, ShieldAlert, X } from "lucide-react";
import { FolderPicker } from "../../components/FolderPicker";
import { PageHead } from "../../components/layout/PageHead";
import { useToast } from "../../components/Toast";
import { Button, buttonClass, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton } from "../../components/ui";
import { concretePath, DATE_TOKEN, displayPath } from "../../lib/folders";
import { formatBytes, formatDate, formatRelative } from "../../lib/format";
import { projectTitle } from "../../lib/projects";
import type { ReviewResolution } from "../../lib/repo";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import type { InboxAttachment, InboxItem, Project } from "../../lib/types";
import { ConfidencePill } from "./agentUi";

type Remember = NonNullable<ReviewResolution["rememberRule"]> | "";

/** Die Prüfung hat einen KI-Vorschlag verworfen: Hinweis auf einen Manipulationsversuch im Mailtext. */
export function isRejectedAi(item: InboxItem): boolean {
  return /KI-(Projekt|Ordner) verworfen/.test(item.reason ?? "");
}

/**
 * Prüfliste: je unsichere Zuordnung eine Karte mit Mail, Anhang und Vorschlag.
 * Bestätigen · Ändern (Projekt + Ordner aus der Vorlage) · Ignorieren, optional "Regel merken".
 * Jede Entscheidung wird als Lernbeispiel gespeichert.
 */
export function ReviewList() {
  const { data, loading, error, reload } = useData();
  const { user } = useSession();
  const staff = user.role !== "freiberufler";

  const cards = useMemo(() => {
    if (!data) return { review: [], errors: [] };
    const items = new Map(data.inboxItems.map((i) => [i.id, i]));
    const list = data.inboxAttachments
      .filter((a) => a.status === "pruefen" || a.status === "fehler")
      .map((att) => ({ att, item: items.get(att.itemId)! }))
      .filter((x) => x.item)
      .sort((a, b) => b.item.receivedAt.localeCompare(a.item.receivedAt));
    // Abgefangene Manipulationsversuche ans Ende, damit die echten Prüfungen oben stehen
    const review = list.filter((x) => x.att.status === "pruefen").sort((a, b) => Number(isRejectedAi(a.item)) - Number(isRejectedAi(b.item)));
    return { review, errors: list.filter((x) => x.att.status === "fehler") };
  }, [data]);

  const head = <PageHead title="Prüfliste" sub="Zuordnungen, bei denen der Agent unsicher war. Jede Entscheidung wird als Lernbeispiel gespeichert." />;

  if (!staff) {
    return (
      <>
        {head}
        <Card>
          <EmptyState title="Die Prüfliste ist nur für Mitarbeiter sichtbar" />
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
          <Skeleton h={220} round />
          <Skeleton h={220} round />
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="stack">
        {cards.review.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ClipboardCheck size={18} />}
              title="Keine offenen Prüfungen"
              text="Der Agent hat alle Anhänge sicher zugeordnet."
              action={
                <Link to="/agent" className={buttonClass("outline", "sm")}>
                  Zum Agent-Dashboard
                </Link>
              }
            />
          </Card>
        ) : (
          cards.review.map(({ att, item }) => <ReviewCard key={att.id} att={att} item={item} />)
        )}

        {cards.errors.length > 0 && (
          <section className="stack" aria-label="Nicht abgelegt">
            <h2 className="section-title">
              <AlertOctagon size={16} aria-hidden /> Nicht abgelegt ({cards.errors.length})
            </h2>
            {cards.errors.map(({ att, item }) => (
              <ErrorCard key={att.id} att={att} item={item} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}

function MailHead({ item, att }: { item: InboxItem; att: InboxAttachment }) {
  const { data } = useData();
  const box = data?.mailboxes.find((m) => m.id === item.mailboxId);
  return (
    <div className="review-mail">
      <div className="review-from">
        <span className="cell-main">{item.fromName}</span>
        <span className="cell-sub">
          {item.fromEmail} · {formatRelative(item.receivedAt)}
          {box ? ` · ${box.label}` : ""}
        </span>
      </div>
      <h3 className="review-subject">{item.subject || "(ohne Betreff)"}</h3>
      {item.bodyExcerpt && <p className="review-excerpt">{item.bodyExcerpt}</p>}
      <div className="review-file">
        <FileText size={16} aria-hidden />
        <span className="file-name">{att.fileName}</span>
        <span className="muted">{formatBytes(att.sizeBytes)}</span>
        {att.corrected && <span className="review-flag">als falsch gemeldet</span>}
      </div>
    </div>
  );
}

function ReviewCard({ att, item }: { att: InboxAttachment; item: InboxItem }) {
  const { data, mutate, today, repo } = useData();
  const toast = useToast();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [remember, setRemember] = useState<Remember>("");
  const [busy, setBusy] = useState(false);
  const projects = data!.projects;
  const suggested = att.projectId ? projects.find((p) => p.id === att.projectId) ?? null : null;
  const { autoFileThreshold: auto, suggestThreshold: suggest } = data!.agentSettings;
  const reason = item.reason ?? "";

  // Bearbeiten: Projekt + Vorlagenordner + Datum (Standard: Maildatum)
  const [projectId, setProjectId] = useState<string>(att.projectId ?? "");
  const [query, setQuery] = useState("");
  const [template, setTemplate] = useState<string | null>(att.folderPath ? templateFromConcrete(att.folderPath, data!.folderTemplates.map((t) => t.path)) : null);
  const [date, setDate] = useState(item.receivedAt.slice(0, 10));

  async function resolve(r: ReviewResolution, msg: string) {
    setBusy(true);
    const res = await mutate((repo) => repo.resolveReview(att.id, r));
    setBusy(false);
    toast(res.ok ? msg : res.error, res.ok ? "ok" : "danger");
  }

  async function makeTask() {
    const res = await mutate((repo) =>
      repo.createTask({ title: `Posteingang klären: ${item.subject || att.fileName}`, projectId: att.projectId, dueOn: today, assigneeId: null, source: "agent", sourceKey: `agent:${att.id}` }),
    );
    toast(res.ok ? "Aufgabe angelegt" : res.error, res.ok ? "ok" : "danger");
  }

  const active = projects.filter((p) => p.status === "aktiv");
  const matches = query.trim() ? active.filter((p) => `${p.abmNr} ${p.bauherrLabel} ${p.location}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];
  const chosen = projects.find((p) => p.id === projectId) ?? null;
  const finalPath = template ? (template.includes(DATE_TOKEN) ? (date ? concretePath(template, date) : null) : template) : null;

  const rejected = isRejectedAi(item);
  return (
    <Card className="review-card" data-test-case={rejected || undefined}>
      {rejected && (
        <div className="review-testcase" role="note">
          {repo.mode === "demo" ? <FlaskConical size={15} aria-hidden /> : <ShieldAlert size={15} aria-hidden />}
          {repo.mode === "demo" ? "Testfall: Manipulationsversuch (wurde abgefangen)" : "KI-Vorschlag verworfen: Mail mit Vorsicht prüfen"}
        </div>
      )}
      <div className="review-grid">
        <MailHead item={item} att={att} />

        <div className="review-side">
          {mode === "view" ? (
            <div className="review-suggestion" data-empty={!suggested}>
              <div className="review-suggestion-head">
                <span className="review-label">Vorschlag des Agenten</span>
                {/* Ohne Vorschlag keine Prozentzahl: sie würde einen Vorschlag suggerieren */}
                <ConfidencePill value={suggested && att.folderPath ? att.confidence : null} auto={auto} suggest={suggest} />
              </div>
              {suggested && att.folderPath ? (
                <>
                  <Link to={`/projekte/${suggested.id}`} className="review-project">
                    {projectTitle(suggested)}
                  </Link>
                  <span className="review-folder" title={displayPath(att.folderPath)}>
                    {displayPath(att.folderPath)}
                  </span>
                </>
              ) : (
                <span className="review-none">
                  <ShieldAlert size={14} aria-hidden /> Kein sicherer Vorschlag
                </span>
              )}
              <p className="review-reason">{reason}</p>
            </div>
          ) : (
            <div className="review-edit">
              <Field label="Projekt" htmlFor={`proj-${att.id}`}>
                {chosen && !query ? (
                  <div className="review-chosen">
                    <span>{projectTitle(chosen)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setProjectId("")}>
                      Ändern
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input id={`proj-${att.id}`} icon={<Search size={14} />} placeholder="ABM-Nr., Bauherr oder Ort" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
                    {matches.length > 0 && (
                      <ul className="review-matches">
                        {matches.map((p: Project) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setProjectId(p.id);
                                setQuery("");
                              }}
                            >
                              {projectTitle(p)} <span className="muted">· {p.location}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Field>
              <Field label="Ordner" htmlFor={`folder-${att.id}`}>
                <FolderPicker templates={data!.folderTemplates} value={template} onChange={setTemplate} />
              </Field>
              {template?.includes(DATE_TOKEN) && (
                <Field label="Datum für den Ordner" htmlFor={`date-${att.id}`} hint={finalPath ? `Ordner: ${displayPath(finalPath).split(" › ").pop()}` : undefined}>
                  <Input id={`date-${att.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="review-actions">
        <label className="review-remember">
          <span>Regel merken</span>
          <Select
            aria-label="Regel merken"
            value={remember}
            onChange={(e) => setRemember(e.target.value as Remember)}
            options={[
              { value: "", label: "Nein" },
              { value: "absender_projekt", label: "Absender → dieses Projekt" },
              { value: "absender_ordner", label: "Absender → dieser Ordner" },
              { value: "ignorieren", label: "Absender immer ignorieren" },
            ]}
          />
        </label>
        <div className="review-buttons">
          <Button size="sm" variant="ghost" icon={<ListPlus size={14} />} onClick={() => void makeTask()} disabled={busy}>
            Als Aufgabe
          </Button>
          <Button size="sm" icon={<X size={14} />} disabled={busy} onClick={() => void resolve({ action: "ignorieren", rememberRule: remember === "ignorieren" ? "ignorieren" : null }, "Ignoriert")}>
            Ignorieren
          </Button>
          {mode === "view" ? (
            <>
              <Button size="sm" icon={<Pencil size={14} />} onClick={() => setMode("edit")} disabled={busy}>
                Ändern
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<Check size={14} />}
                disabled={busy || !suggested || !att.folderPath || remember === "ignorieren"}
                onClick={() => void resolve({ action: "bestaetigen", rememberRule: remember && remember !== "ignorieren" ? remember : null }, `Abgelegt in ${suggested?.bauherrLabel}`)}
              >
                Bestätigen
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<Check size={14} />}
                disabled={busy || !chosen || !finalPath || remember === "ignorieren"}
                onClick={() =>
                  void resolve(
                    { action: "aendern", projectId: chosen!.id, folderPath: finalPath!, rememberRule: remember && remember !== "ignorieren" ? remember : null },
                    `Abgelegt in ${chosen!.bauherrLabel}`,
                  )
                }
              >
                Hier ablegen
              </Button>
            </>
          )}
        </div>
      </footer>
    </Card>
  );
}

function ErrorCard({ att, item }: { att: InboxAttachment; item: InboxItem }) {
  const { mutate } = useData();
  const toast = useToast();
  return (
    <Card className="review-card" data-tone="danger">
      <div className="review-grid">
        <MailHead item={item} att={att} />
        <div className="review-side">
          <div className="review-suggestion" data-empty="true">
            <span className="review-label">Nicht abgelegt</span>
            <span className="review-none">
              <AlertOctagon size={14} aria-hidden /> Aus Sicherheitsgründen gesperrt
            </span>
            <p className="review-reason">{item.reason}</p>
            <p className="review-reason">Die Mail liegt unverändert im Postfach. Bei Bedarf dort prüfen, nicht hier öffnen.</p>
          </div>
        </div>
      </div>
      <footer className="review-actions">
        <span className="muted">Empfangen am {formatDate(item.receivedAt.slice(0, 10))}</span>
        <div className="review-buttons">
          <Button
            size="sm"
            onClick={async () => {
              const res = await mutate((r) => r.resolveReview(att.id, { action: "ignorieren", rememberRule: null }));
              toast(res.ok ? "Erledigt" : res.error, res.ok ? "ok" : "danger");
            }}
          >
            Als erledigt markieren
          </Button>
        </div>
      </footer>
    </Card>
  );
}

/** Konkreten Pfad (mit Datum) dem Vorlagenpfad zuordnen, damit die Ordnerauswahl vorbelegt ist. */
function templateFromConcrete(path: string, templates: string[]): string | null {
  if (templates.includes(path)) return path;
  const generic = path.replace(/\d{2}\.\d{2}\.\d{4}/g, DATE_TOKEN);
  return templates.includes(generic) ? generic : null;
}
