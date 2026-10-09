import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, CalendarDays, Search } from "lucide-react";
import { displayPath } from "../lib/folders";
import { buildFolderTree, type FolderNode } from "../lib/folderTree";
import type { FolderTemplate } from "../lib/types";
import { Input } from "./ui";

/**
 * Ordnerauswahl aus der Vorlage (Prüfliste "Ändern", Regeln). Wert = Vorlagenpfad; Datumsfächer erscheinen als
 * eigene Einträge ("… erhalten am … (neuer Datumsordner)"), das Datum setzt der Aufrufer ein.
 */
export function FolderPicker({ templates, value, onChange }: { templates: FolderTemplate[]; value: string | null; onChange: (templatePath: string) => void }) {
  const tree = useMemo(() => buildFolderTree(templates, []), [templates]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(value ? value.split("/").map((_, i, a) => a.slice(0, i + 1).join("/")) : []));

  const hits = q.trim()
    ? templates.filter((t) => t.path.toLowerCase().includes(q.trim().toLowerCase()) || t.keywords.some((k) => k.includes(q.trim().toLowerCase()))).slice(0, 30)
    : null;

  function row(n: FolderNode, level: number) {
    const isOpen = open.has(n.path);
    const kids = n.children.length > 0 || n.dateSlots.length > 0;
    return (
      <li key={n.path}>
        <div className="picker-row" data-selected={value === n.path} style={{ paddingLeft: `calc(${level} * 14px + 2px)` }}>
          <button
            type="button"
            className="tree-toggle"
            disabled={!kids}
            aria-label={isOpen ? "Zuklappen" : "Aufklappen"}
            onClick={() =>
              setOpen((s) => {
                const x = new Set(s);
                if (x.has(n.path)) x.delete(n.path);
                else x.add(n.path);
                return x;
              })
            }
          >
            {kids ? isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
          </button>
          <button type="button" className="picker-label" onClick={() => onChange(n.path)} title={n.label} aria-pressed={value === n.path}>
            <Folder size={14} aria-hidden /> <span className="tree-name">{n.label}</span>
          </button>
        </div>
        {isOpen && kids && (
          <ul className="tree">
            {n.dateSlots.map((d) => (
              <li key={d.path}>
                <div className="picker-row" data-selected={value === d.path} style={{ paddingLeft: `calc(${level + 1} * 14px + 22px)` }}>
                  <button type="button" className="picker-label" onClick={() => onChange(d.path)} aria-pressed={value === d.path}>
                    <CalendarDays size={14} aria-hidden /> <span className="tree-name">{d.label}</span>
                    <span className="muted"> (neuer Datumsordner)</span>
                  </button>
                </div>
              </li>
            ))}
            {n.children.map((c) => row(c, level + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="picker">
      <Input icon={<Search size={14} />} type="search" placeholder="Ordner suchen, z. B. Lageplan" aria-label="Ordner suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="picker-list">
        {hits ? (
          hits.length ? (
            <ul className="tree">
              {hits.map((t) => (
                <li key={t.path}>
                  <div className="picker-row" data-selected={value === t.path}>
                    <button type="button" className="picker-label" onClick={() => onChange(t.path)} title={displayPath(t.path)} aria-pressed={value === t.path}>
                      {t.hasDate ? <CalendarDays size={14} aria-hidden /> : <Folder size={14} aria-hidden />}
                      <span className="tree-name">{displayPath(t.path).replace("{datum}", "…")}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted picker-empty">Kein Ordner gefunden.</p>
          )
        ) : (
          <ul className="tree">{tree.map((n) => row(n, 0))}</ul>
        )}
      </div>
    </div>
  );
}
