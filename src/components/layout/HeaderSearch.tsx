import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, ListTodo, Search } from "lucide-react";
import { matchesQuery } from "../../lib/projectFilters";
import { phaseOf, projectTitle } from "../../lib/projects";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";

const MAX = 6;

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: typeof ListTodo;
  /** Wörter, auf die der Befehl beim Tippen reagiert */
  words: string[];
}

const COMMANDS: Command[] = [
  { id: "task", label: "Neue Aufgabe", hint: "Aufgabe anlegen", icon: ListTodo, words: ["neue", "aufgabe", "task", "todo"] },
  { id: "project", label: "Neues Projekt", hint: "Formular öffnen", icon: FilePlus2, words: ["neues", "projekt", "anlegen"] },
];

/**
 * Projektsuche und Befehle in der Kopfzeile (Strg+K). Ohne Eingabe stehen die Befehle oben ("Neue Aufgabe", "Neues Projekt"),
 * beim Tippen bis zu 6 Projekte plus passende Befehle (Pfeiltasten + Enter). Enter ohne Auswahl öffnet die gefilterte Projektliste.
 */
export function HeaderSearch({ placeholder, onNewProject }: { placeholder: string; onNewProject: () => void }) {
  const { data } = useData();
  // Befehle zum Anlegen gibt es nur für Admin und Mitarbeiter
  const staff = useSession().user.role !== "freiberufler";
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const companyName = new Map((data?.companies ?? []).map((c) => [c.id, c.name]));
  const hits = q.trim()
    ? (data?.projects ?? []).filter((p) => matchesQuery(p, q, p.companyId ? companyName.get(p.companyId) : null)).slice(0, MAX)
    : [];
  const term = q.trim().toLowerCase();
  const available = staff ? COMMANDS : [];
  const commands = term ? available.filter((c) => c.words.some((w) => w.startsWith(term) || term.split(/\s+/).every((t) => c.words.some((x) => x.startsWith(t))))) : available;
  // Reihenfolge der Auswahl: Befehle, dann Projekte
  const options = [...commands.map((c) => ({ kind: "cmd" as const, c })), ...hits.map((p) => ({ kind: "project" as const, p }))];

  function runCommand(c: Command) {
    setOpen(false);
    setQ("");
    setActive(-1);
    inputRef.current?.blur();
    if (c.id === "task") navigate("/aufgaben?filter=alle&neu=1");
    else onNewProject();
  }

  function go(path: string) {
    setOpen(false);
    setQ("");
    setActive(-1);
    inputRef.current?.blur();
    navigate(path);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!options.length) return;
      setOpen(true);
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % options.length : (i - 1 + options.length) % options.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = active >= 0 ? options[active] : null;
      if (opt?.kind === "cmd") runCommand(opt.c);
      else if (opt?.kind === "project") go(`/projekte/${opt.p.id}`);
      else if (q.trim()) go(`/projekte?q=${encodeURIComponent(q.trim())}${data?.projects.some((p) => p.status === "storno" && matchesQuery(p, q)) ? "&storno=1" : ""}`);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const listId = "header-search-results";
  return (
    <div className="header-search" role="search">
      <Search size={16} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        aria-label="Projekte, Bauherren, ABM-Nr. durchsuchen"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      <kbd aria-hidden>Strg K</kbd>
      {open && (
        <div className="search-results" id={listId} role="listbox" aria-label="Suchergebnisse und Befehle">
          {commands.length > 0 && (
            <>
              <div className="search-group">Befehle</div>
              {commands.map((c, i) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="search-hit"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      runCommand(c);
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span className="search-cmd-icon" aria-hidden>
                      <Icon size={14} />
                    </span>
                    <span className="list-item-main">
                      <span className="list-item-title">{c.label}</span>
                      <span className="list-item-sub">{c.hint}</span>
                    </span>
                  </div>
                );
              })}
            </>
          )}
          {q.trim() && (
            <>
              <div className="search-group">Projekte</div>
              {hits.length ? (
                hits.map((p, j) => {
                  const i = commands.length + j;
                  return (
                    <div
                      key={p.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      className="search-hit"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        go(`/projekte/${p.id}`);
                      }}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="list-item-main">
                        <span className="list-item-title">{projectTitle(p)}</span>
                        <span className="list-item-sub">
                          {[p.location, p.companyId ? companyName.get(p.companyId) : null, data ? phaseOf(p, data.stepDefinitions).label : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {p.status !== "aktiv" && <span className="muted">{p.status === "storno" ? "Storno" : "Abgeschlossen"}</span>}
                    </div>
                  );
                })
              ) : (
                <p className="popover-empty">Kein Projekt gefunden.</p>
              )}
              <div
                className="search-all"
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(`/projekte?q=${encodeURIComponent(q.trim())}`);
                }}
              >
                Alle Treffer in der Projektliste <kbd>Enter</kbd>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
