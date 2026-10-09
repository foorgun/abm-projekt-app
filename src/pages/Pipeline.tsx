import { useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { PhasePill, WarnIcon } from "../components/ProjectBits";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, Checkbox, Dialog, ErrorState, Field, Input, Select, Skeleton } from "../components/ui";
import type { Alert } from "../lib/alerts";
import { formatDate } from "../lib/format";
import { matchesQuery, teamCode } from "../lib/projectFilters";
import { allStages, phaseOf, stageMoveTarget, stageOf, type Stage } from "../lib/projects";
import { useSession } from "../lib/session";
import type { StepDefinition } from "../lib/steps";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";

interface PendingMove {
  project: Project;
  to: Stage;
  step: StepDefinition;
  skipped: StepDefinition[];
  date: string;
  /** Offene Schritte davor mit demselben Datum als erledigt setzen. */
  fillSkipped: boolean;
}

const MOVE_HINT = "Karten lassen sich nur in die direkt nächste Stufe verschieben.";

/**
 * Pipeline: eine Spalte je Stufe (step_definitions.stage), nur aktive Projekte; die genaue Phase steht als Pill auf der Karte.
 * Karte in die nächste Stufe ziehen (oder Button) setzt nach Bestätigung den ersten offenen Schritt dieser Stufe.
 */
export function Pipeline() {
  const { data, loading, error, reload, alerts, today, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const staff = user.role !== "freiberufler";
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [architect, setArchitect] = useState("");
  const [dragging, setDragging] = useState<{ id: string; index: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [busy, setBusy] = useState(false);
  // Letzte Spalte unter dem Mauszeiger, um beim Loslassen auf einer ungültigen Spalte zu erklären, warum nichts passiert
  const lastOver = useRef<number | null>(null);
  const dropped = useRef(false);

  const steps = useMemo(() => data?.stepDefinitions ?? [], [data]);
  const stages = useMemo(() => allStages(steps), [steps]);
  const alertsByProject = useMemo(() => {
    const m = new Map<string, Alert[]>();
    for (const a of alerts) m.set(a.projectId, [...(m.get(a.projectId) ?? []), a]);
    return m;
  }, [alerts]);

  const head = <PageHead title="Pipeline" sub="Aktive Projekte nach Stufe. Karte in die nächste Stufe ziehen, um deren ersten offenen Schritt zu setzen." />;

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

  const companyName = new Map((data?.companies ?? []).map((c) => [c.id, c.name]));
  const projects = (data?.projects ?? []).filter(
    (p) =>
      p.status === "aktiv" &&
      (!company || p.companyId === company) &&
      (!architect || p.architectId === architect) &&
      matchesQuery(p, q, p.companyId ? companyName.get(p.companyId) : null),
  );
  const byStage = new Map<string, Project[]>(stages.map((st) => [st.name, []]));
  // Innerhalb der Stufe: weiter fortgeschrittene Projekte oben
  for (const p of [...projects].sort((a, b) => phaseOf(b, steps).index - phaseOf(a, steps).index)) byStage.get(stageOf(p, steps).name)?.push(p);

  function requestMove(project: Project, toIndex: number) {
    const from = stageOf(project, steps).index;
    if (toIndex === from) return;
    const target = stageMoveTarget(project, steps);
    if (toIndex !== from + 1 || !target) {
      toast(MOVE_HINT, "danger");
      return;
    }
    setPending({ project, to: target.stage, step: target.step, skipped: target.skipped, date: today, fillSkipped: false });
  }

  async function confirmMove() {
    if (!pending) return;
    setBusy(true);
    const keys = [...(pending.fillSkipped ? pending.skipped.map((s) => s.key) : []), pending.step.key];
    const res = await mutate(async (r) => {
      for (const k of keys) await r.setStepDate(pending.project.id, k, pending.date);
    });
    setBusy(false);
    toast(res.ok ? `${pending.project.bauherrLabel}: ${pending.step.label} am ${formatDate(pending.date)} gesetzt` : res.error, res.ok ? "ok" : "danger");
    setPending(null);
  }

  function onDrop(e: DragEvent, st: Stage) {
    e.preventDefault();
    setOver(null);
    dropped.current = true;
    const id = e.dataTransfer.getData("text/plain");
    const p = data?.projects.find((x) => x.id === id);
    setDragging(null);
    if (p) requestMove(p, st.index);
  }

  return (
    <>
      {head}
      <div className="stack">
        <Card>
          <div className="filters" role="search">
            <Input icon={<Search size={15} />} type="search" placeholder="Bauherr, ABM-Nr., Ort" aria-label="Pipeline durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} />
            {staff && (
              <Select aria-label="Firma" value={company} onChange={(e) => setCompany(e.target.value)} options={[{ value: "", label: "Alle Firmen" }, ...(data?.companies ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            )}
            <Select
              aria-label="Architekt"
              value={architect}
              onChange={(e) => setArchitect(e.target.value)}
              options={[{ value: "", label: "Alle Architekten" }, ...(data?.team ?? []).filter((t) => t.role === "architekt").map((t) => ({ value: t.id, label: t.code ?? t.name }))]}
            />
            <span className="muted">{loading || !data ? "Lädt …" : `${projects.length} aktive Projekte`}</span>
          </div>
        </Card>

        <div className="board" role="list" aria-label="Stufen">
          {stages.map((st) => {
            const cards = byStage.get(st.name) ?? [];
            const valid = dragging != null && st.index === dragging.index + 1;
            return (
              <section
                key={st.name}
                className="board-col"
                role="listitem"
                aria-label={`${st.name}, ${cards.length} Projekte`}
                data-drop={dragging ? (valid ? "valid" : "invalid") : undefined}
                data-over={over === st.name}
                onDragOver={(e) => {
                  if (!dragging || !staff) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = valid ? "move" : "none";
                  setOver(st.name);
                  lastOver.current = st.index;
                }}
                onDragLeave={() => setOver((o) => (o === st.name ? null : o))}
                onDrop={(e) => onDrop(e, st)}
              >
                <header className="board-col-head">
                  <span className="board-col-title">{st.name}</span>
                  <span className="badge">{loading || !data ? "–" : cards.length}</span>
                </header>
                <p className="board-col-steps">{st.steps.map((x) => x.label).join(" · ")}</p>
                <div className="board-cards">
                  {loading || !data ? (
                    <>
                      <Skeleton h={96} round />
                      <Skeleton h={96} round />
                    </>
                  ) : cards.length ? (
                    cards.map((p) => {
                      const move = stageMoveTarget(p, steps);
                      return (
                        <article
                          key={p.id}
                          className="board-card"
                          draggable={staff}
                          data-dragging={dragging?.id === p.id}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", p.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragging({ id: p.id, index: st.index });
                            lastOver.current = null;
                            dropped.current = false;
                          }}
                          onDragEnd={() => {
                            const target = lastOver.current;
                            if (!dropped.current && target != null && target !== st.index && target !== st.index + 1) toast(MOVE_HINT, "danger");
                            setDragging(null);
                            setOver(null);
                          }}
                        >
                          <div className="board-card-top">
                            <Link to={`/projekte/${p.id}`} className="board-card-title" draggable={false}>
                              {p.bauherrLabel}
                            </Link>
                            <WarnIcon alerts={alertsByProject.get(p.id) ?? []} />
                          </div>
                          <div className="board-card-meta">
                            {p.abmNr ?? "–"} · {p.location ?? "–"}
                          </div>
                          <PhasePill phase={phaseOf(p, steps)} />
                          <div className="board-card-foot">
                            <span className="muted">{p.companyId ? companyName.get(p.companyId) : "ohne Firma"}</span>
                            <span className="board-card-code" title="Architekt">
                              {teamCode(p.architectId, data.team)}
                            </span>
                          </div>
                          {staff && move && (
                            <button type="button" className="board-card-next" onClick={() => requestMove(p, move.stage.index)} aria-label={`${p.bauherrLabel}: weiter nach ${move.stage.name}`}>
                              {move.stage.name}
                              <ArrowRight size={13} aria-hidden />
                            </button>
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <p className="board-empty">{dragging && valid ? "Hier ablegen" : "Keine Projekte"}</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {pending && (
        <Dialog
          title="In die nächste Stufe"
          onClose={() => setPending(null)}
          footer={
            <>
              <Button onClick={() => setPending(null)}>Abbrechen</Button>
              <Button variant="primary" onClick={() => void confirmMove()} disabled={busy || !pending.date}>
                {busy ? "Wird gespeichert …" : "Schritt setzen"}
              </Button>
            </>
          }
        >
          <p>
            <strong>{pending.project.bauherrLabel}</strong> ({pending.project.abmNr ?? "ohne Nr."}) wechselt nach <strong>{pending.to.name}</strong>. Gesetzt wird der Schritt{" "}
            <strong>{pending.step.label}</strong>.
          </p>
          <Field label={`Datum für „${pending.step.label}“`} htmlFor="move-date" hint="Standard ist heute. Das Datum lässt sich im Projekt jederzeit ändern.">
            <Input id="move-date" type="date" value={pending.date} max={today} onChange={(e) => setPending({ ...pending, date: e.target.value })} />
          </Field>
          {pending.skipped.length > 0 && (
            <div className="banner" data-tone="warn">
              <div className="banner-text">
                <span className="banner-title">Noch offen: {pending.skipped.map((x) => x.label).join(", ")}</span>
                <span className="banner-detail">Diese Schritte erscheinen danach im Projekt als „fehlt“.</span>
                <Checkbox label="Mit demselben Datum als erledigt setzen" checked={pending.fillSkipped} onChange={(e) => setPending({ ...pending, fillSkipped: e.target.checked })} />
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
