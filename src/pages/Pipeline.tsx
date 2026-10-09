import { useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { WarnIcon } from "../components/ProjectBits";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, Dialog, ErrorState, Field, Input, Select, Skeleton } from "../components/ui";
import type { Alert } from "../lib/alerts";
import { formatDate } from "../lib/format";
import { matchesQuery, teamCode } from "../lib/projectFilters";
import { allPhases, phaseOf, type Phase } from "../lib/projects";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Project } from "../lib/types";

interface PendingMove {
  project: Project;
  to: Phase;
  date: string;
}

/**
 * Pipeline: eine Spalte je Phase (Eingang + jeder Schritt aus step_definitions), nur aktive Projekte.
 * Karte in die nächste Spalte ziehen (oder Button "Nächste Phase") setzt den Schritt nach Bestätigung.
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
  // Letzte Spalte unter dem Mauszeiger, um beim Loslassen auf einer ungültigen Spalte zu erklären, warum nichts passiert
  const lastOver = useRef<number | null>(null);
  const dropped = useRef(false);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [busy, setBusy] = useState(false);

  const steps = useMemo(() => data?.stepDefinitions ?? [], [data]);
  const phases = useMemo(() => allPhases(steps), [steps]);
  const alertsByProject = useMemo(() => {
    const m = new Map<string, Alert[]>();
    for (const a of alerts) m.set(a.projectId, [...(m.get(a.projectId) ?? []), a]);
    return m;
  }, [alerts]);

  const head = <PageHead title="Pipeline" sub="Aktive Projekte nach Phase. Karte in die nächste Spalte ziehen, um den Schritt zu setzen." />;

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
  const byPhase = new Map<string, Project[]>(phases.map((ph) => [ph.key, []]));
  for (const p of projects) byPhase.get(phaseOf(p, steps).key)?.push(p);

  function requestMove(project: Project, toIndex: number) {
    const from = phaseOf(project, steps).index;
    if (toIndex === from) return;
    if (toIndex !== from + 1) {
      toast("Karten lassen sich nur in die direkt nächste Phase verschieben.", "danger");
      return;
    }
    const to = phases.find((ph) => ph.index === toIndex);
    if (to) setPending({ project, to, date: today });
  }

  async function confirmMove() {
    if (!pending) return;
    setBusy(true);
    const res = await mutate((r) => r.setStepDate(pending.project.id, pending.to.key, pending.date));
    setBusy(false);
    toast(res.ok ? `${pending.project.bauherrLabel}: ${pending.to.label} am ${formatDate(pending.date)} gesetzt` : res.error, res.ok ? "ok" : "danger");
    setPending(null);
  }

  function onDrop(e: DragEvent, ph: Phase) {
    e.preventDefault();
    setOver(null);
    dropped.current = true;
    const id = e.dataTransfer.getData("text/plain");
    const p = data?.projects.find((x) => x.id === id);
    setDragging(null);
    if (p) requestMove(p, ph.index);
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

        <div className="board" role="list" aria-label="Phasen">
          {(loading || !data ? phases.slice(0, 5) : phases).map((ph) => {
            const cards = byPhase.get(ph.key) ?? [];
            const valid = dragging != null && ph.index === dragging.index + 1;
            return (
              <section
                key={ph.key}
                className="board-col"
                role="listitem"
                aria-label={`${ph.label}, ${cards.length} Projekte`}
                data-drop={dragging ? (valid ? "valid" : "invalid") : undefined}
                data-over={over === ph.key}
                onDragOver={(e) => {
                  if (!dragging || !staff) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = valid ? "move" : "none";
                  setOver(ph.key);
                  lastOver.current = ph.index;
                }}
                onDragLeave={() => setOver((o) => (o === ph.key ? null : o))}
                onDrop={(e) => onDrop(e, ph)}
              >
                <header className="board-col-head">
                  <span className="board-col-title">{ph.label}</span>
                  <span className="badge">{loading || !data ? "–" : cards.length}</span>
                </header>
                <div className="board-cards">
                  {loading || !data ? (
                    <>
                      <Skeleton h={88} round />
                      <Skeleton h={88} round />
                    </>
                  ) : cards.length ? (
                    cards.map((p) => {
                      const next = phases.find((x) => x.index === ph.index + 1);
                      return (
                        <article
                          key={p.id}
                          className="board-card"
                          draggable={staff}
                          data-dragging={dragging?.id === p.id}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", p.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragging({ id: p.id, index: ph.index });
                            lastOver.current = null;
                            dropped.current = false;
                          }}
                          onDragEnd={() => {
                            const target = lastOver.current;
                            if (!dropped.current && target != null && target !== ph.index && target !== ph.index + 1) {
                              toast("Karten lassen sich nur in die direkt nächste Phase verschieben.", "danger");
                            }
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
                          <div className="board-card-foot">
                            <span className="muted">{p.companyId ? companyName.get(p.companyId) : "ohne Firma"}</span>
                            <span className="board-card-code" title="Architekt">
                              {teamCode(p.architectId, data.team)}
                            </span>
                          </div>
                          {staff && next && (
                            <button type="button" className="board-card-next" onClick={() => requestMove(p, next.index)} aria-label={`${p.bauherrLabel}: weiter zu ${next.label}`}>
                              {next.label}
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
          title="Schritt setzen"
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
            <strong>{pending.project.bauherrLabel}</strong> ({pending.project.abmNr ?? "ohne Nr."}) wechselt nach <strong>{pending.to.label}</strong>.
          </p>
          <Field label={`Datum für „${pending.to.label}“`} htmlFor="move-date" hint="Standard ist heute. Das Datum lässt sich im Projekt jederzeit ändern.">
            <Input id="move-date" type="date" value={pending.date} max={today} onChange={(e) => setPending({ ...pending, date: e.target.value })} />
          </Field>
        </Dialog>
      )}
    </>
  );
}
