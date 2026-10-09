import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { matchesQuery } from "../../lib/projectFilters";
import { phaseOf, projectTitle } from "../../lib/projects";
import { useData } from "../../lib/store";

const MAX = 6;

/**
 * Projektsuche in der Kopfzeile (Strg+K). Zeigt beim Tippen bis zu 6 Treffer (Pfeiltasten + Enter),
 * Enter ohne Auswahl öffnet die gefilterte Projektliste.
 */
export function HeaderSearch({ placeholder }: { placeholder: string }) {
  const { data } = useData();
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
      if (!hits.length) return;
      setOpen(true);
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % hits.length : (i - 1 + hits.length) % hits.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && hits[active]) go(`/projekte/${hits[active].id}`);
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
        aria-expanded={open && Boolean(q.trim())}
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
      {open && q.trim() && (
        <div className="search-results" id={listId} role="listbox" aria-label="Suchergebnisse">
          {hits.length ? (
            hits.map((p, i) => (
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
            ))
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
        </div>
      )}
    </div>
  );
}
