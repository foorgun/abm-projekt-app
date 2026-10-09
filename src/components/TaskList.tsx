import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Bot, Check, Plus, ShieldAlert } from "lucide-react";
import { formatDate, formatDue } from "../lib/format";
import { projectTitle } from "../lib/projects";
import type { NewTask, TaskPatch } from "../lib/repo";
import type { Project, Task, TeamMember } from "../lib/types";
import { Button, Input, Select } from "./ui";

/** Aufgabenliste mit Abhaken. Wird im Projekt (Tab Aufgaben) und auf der Seite Aufgaben genutzt. */
export function TaskList({
  tasks,
  team,
  today,
  projects,
  onToggle,
  onUpdate,
  canEdit,
}: {
  tasks: Task[];
  team: TeamMember[];
  today: string;
  /** Wenn gesetzt, wird je Aufgabe das Projekt verlinkt. */
  projects?: Map<string, Project>;
  onToggle: (task: Task) => void;
  /** Wenn gesetzt: Fälligkeit und Zuständigkeit sind direkt in der Zeile änderbar. */
  onUpdate?: (task: Task, patch: TaskPatch) => void;
  canEdit: boolean;
}) {
  const [editingDue, setEditingDue] = useState<string | null>(null);
  return (
    <ul className="task-list">
      {tasks.map((t) => {
        const done = t.status === "erledigt";
        const overdue = !done && Boolean(t.dueOn && t.dueOn < today);
        const dueToday = !done && t.dueOn === today;
        const who = team.find((m) => m.id === t.assigneeId);
        const p = projects && t.projectId ? projects.get(t.projectId) : null;
        return (
          <li key={t.id} className="task-row" data-done={done}>
            <button
              type="button"
              className="task-check"
              role="checkbox"
              aria-checked={done}
              aria-label={done ? `${t.title}: wieder öffnen` : `${t.title}: erledigt`}
              disabled={!canEdit}
              onClick={() => onToggle(t)}
            >
              {done && <Check size={13} strokeWidth={3} aria-hidden />}
            </button>
            <div className="task-main">
              <span className="task-title">{t.title}</span>
              <span className="task-meta">
                {p && (
                  <Link to={`/projekte/${p.id}`} className="task-project">
                    {projectTitle(p)}
                  </Link>
                )}
                {t.source === "warnung" && (
                  <span className="task-source">
                    <ShieldAlert size={12} aria-hidden /> aus Warnung
                  </span>
                )}
                {t.source === "agent" && (
                  <span className="task-source">
                    <Bot size={12} aria-hidden /> vom Agenten
                  </span>
                )}
                {who && !onUpdate && <span>{who.code ?? who.name}</span>}
              </span>
            </div>
            {onUpdate && canEdit && !done && (
              <select
                className="task-assignee"
                aria-label={`Zuständig für ${t.title}`}
                value={t.assigneeId ?? ""}
                onChange={(e) => onUpdate(t, { assigneeId: e.target.value || null })}
              >
                <option value="">Niemand</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code ?? m.name}
                  </option>
                ))}
              </select>
            )}
            {onUpdate && canEdit && !done && editingDue === t.id ? (
              <input
                type="date"
                className="input task-due-input"
                defaultValue={t.dueOn ?? ""}
                autoFocus
                aria-label={`Fällig am für ${t.title}`}
                onBlur={(e) => {
                  setEditingDue(null);
                  const v = e.currentTarget.value || null;
                  if (v !== t.dueOn) onUpdate(t, { dueOn: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditingDue(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="task-due"
                data-overdue={overdue}
                data-today={dueToday}
                disabled={!onUpdate || !canEdit || done}
                onClick={() => setEditingDue(t.id)}
                title={[t.dueOn ? `${overdue ? "Überfällig seit" : "Fällig am"} ${formatDate(t.dueOn)}` : null, onUpdate && canEdit && !done ? "Klicken zum Ändern" : null].filter(Boolean).join(" · ") || undefined}
              >
                {done ? (
                  `erledigt${t.doneAt ? ` ${formatDue(t.doneAt.slice(0, 10), today)}` : ""}`
                ) : t.dueOn ? (
                  <>
                    {overdue && <span className="sr-only">überfällig, </span>}
                    {formatDue(t.dueOn, today)}
                  </>
                ) : (
                  "ohne Termin"
                )}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Kompaktes Formular "Neue Aufgabe". */
export function TaskForm({
  team,
  today,
  projectId,
  projects,
  onSubmit,
  onCancel,
}: {
  team: TeamMember[];
  today: string;
  projectId?: string | null;
  /** Projektauswahl anbieten (Seite Aufgaben). */
  projects?: Project[];
  onSubmit: (t: NewTask) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today);
  const [assignee, setAssignee] = useState(team[0]?.id ?? "");
  const [project, setProject] = useState(projectId ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const ok = await onSubmit({ title, dueOn: due || null, assigneeId: assignee || null, projectId: project || null });
    setBusy(false);
    if (ok) setTitle("");
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <Input aria-label="Aufgabe" placeholder="Neue Aufgabe, z. B. Vorabzug versenden" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      {projects && (
        <Select
          aria-label="Projekt"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          options={[{ value: "", label: "Ohne Projekt" }, ...projects.map((p) => ({ value: p.id, label: projectTitle(p) }))]}
        />
      )}
      <Input aria-label="Fällig am" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <Select aria-label="Zuständig" value={assignee} onChange={(e) => setAssignee(e.target.value)} options={[{ value: "", label: "Niemand" }, ...team.map((m) => ({ value: m.id, label: m.code ?? m.name }))]} />
      <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={busy || !title.trim()}>
        Anlegen
      </Button>
      {onCancel && (
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      )}
    </form>
  );
}
