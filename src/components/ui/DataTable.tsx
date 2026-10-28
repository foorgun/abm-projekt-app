import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** `index`: laufende Position der Zeile in der Anzeige (0, 1, 2 …), über Gruppen hinweg. */
  render: (row: T, index: number) => ReactNode;
  /** Wert für die Sortierung. Ohne diesen Wert ist die Spalte nicht sortierbar. */
  sortValue?: (row: T) => string | number | null;
  align?: "left" | "right";
  strong?: boolean;
  className?: string;
}

/**
 * Tabelle mit optionaler Sortierung, Zeilenklick und aufklappbaren Zeilen.
 * Scrollt horizontal im eigenen Container, nie die ganze Seite.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  expand,
  isExpanded,
  label,
  initialSort,
  groupBy,
  groups,
  stickyFirst,
  compact,
  pageSize,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Inhalt der aufgeklappten Zeile; macht Zeilen aufklappbar. */
  expand?: (row: T) => ReactNode;
  /**
   * Aufklappen von außen steuern (eigener Knopf in einer Spalte): welche Zeilen offen sind. Dann bleibt der Klick auf die
   * Zeile bei onRowClick, und `expand` liefert nur den Inhalt der offenen Zeilen.
   */
  isExpanded?: (row: T) => boolean;
  label: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Gruppiert Zeilen (z. B. nach Eingangsmonat). Reihenfolge der Gruppen = Reihenfolge des ersten Auftretens. */
  groupBy?: (row: T) => string;
  /**
   * Fertige Gruppen mit Titel (Reihenfolge wie übergeben): Gruppenkopf mit Anzahl, einklappbar. Die Spaltensortierung
   * gilt innerhalb jeder Gruppe. Geht vor `groupBy`; `rows` wird dann nicht verwendet.
   */
  groups?: { key: string; title: string; rows: T[] }[];
  /** Erste Spalte bleibt beim horizontalen Scrollen stehen (Mobil). */
  stickyFirst?: boolean;
  /** Engere Zellenabstände für breite Tabellen. */
  compact?: boolean;
  /** Lange Listen: zunächst so viele Zeilen zeigen, weitere per Button. */
  pageSize?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(pageSize ?? Infinity);
  // Anderer Filter (andere Zeilenzahl): wieder von vorn
  useEffect(() => setLimit(pageSize ?? Infinity), [pageSize, rows.length]);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const sortRows = useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !col?.sortValue) return (list: T[]) => list;
    const get = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return (list: T[]) =>
      [...list].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "de")) * dir;
      });
  }, [columns, sort]);
  const sorted = useMemo(() => sortRows(rows), [rows, sortRows]);

  function toggleSort(key: string) {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const controlled = Boolean(isExpanded);
  const clickable = Boolean(onRowClick || (expand && !controlled));

  // Gruppen: stabil nach erstem Auftreten, innerhalb der Gruppe bleibt die Sortierung erhalten
  const grouped = useMemo((): { key: string; title?: string; rows: T[]; count?: number }[] => {
    if (groups) return groups.map((g) => ({ key: g.key, title: g.title, rows: sortRows(g.rows), count: g.rows.length }));
    const visible = sorted.slice(0, limit);
    if (!groupBy) return [{ key: "", rows: visible }];
    const map = new Map<string, T[]>();
    for (const r of visible) {
      const k = groupBy(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
  }, [sorted, groupBy, groups, sortRows, limit]);

  function toggleGroup(key: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function renderRow(row: T, index: number) {
    const k = rowKey(row);
    const isOpen = isExpanded ? isExpanded(row) : open === k;
    const toggle = () => (expand && !controlled ? setOpen(isOpen ? null : k) : onRowClick?.(row));
    return (
      <Fragment key={k}>
        <tr
          data-clickable={clickable}
          tabIndex={clickable ? 0 : undefined}
          aria-expanded={expand && !controlled ? isOpen : undefined}
          onClick={toggle}
          onKeyDown={(e) => {
            if (!clickable || (e.key !== "Enter" && e.key !== " ") || e.target !== e.currentTarget) return;
            e.preventDefault();
            toggle();
          }}
        >
          {columns.map((c) => (
            <td key={c.key} className={[c.align === "right" && "num", c.strong && "strong", c.className].filter(Boolean).join(" ") || undefined}>
              {c.render(row, index)}
            </td>
          ))}
        </tr>
        {expand && isOpen && (
          <tr className="row-detail">
            <td colSpan={columns.length}>{expand(row)}</td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <div className="table-wrap">
      <table className={["table", stickyFirst && "table-sticky-first", compact && "table-compact"].filter(Boolean).join(" ")} aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const SortIcon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  className={c.align === "right" ? "num" : undefined}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  scope="col"
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggleSort(c.key)}>
                      {c.header}
                      <SortIcon size={12} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {grouped.map((g, gi) => {
            // laufende Nummer über alle Gruppen, auch über eingeklappte hinweg (bleibt beim Einklappen gleich)
            const offset = grouped.slice(0, gi).reduce((n, x) => n + x.rows.length, 0);
            const isCollapsed = Boolean(groups) && collapsed.has(g.key);
            return (
              <Fragment key={g.key}>
                {groups ? (
                  <tr className="row-group">
                    <th colSpan={columns.length} scope="colgroup">
                      <button type="button" className="group-toggle" aria-expanded={!isCollapsed} onClick={() => toggleGroup(g.key)}>
                        <ChevronRight size={14} aria-hidden className="group-chevron" />
                        {g.title} <span className="muted">({g.count})</span>
                      </button>
                    </th>
                  </tr>
                ) : (
                  groupBy && (
                    <tr className="row-group">
                      <th colSpan={columns.length} scope="colgroup">
                        {g.key} <span className="muted">· {g.rows.length}</span>
                      </th>
                    </tr>
                  )
                )}
                {!isCollapsed && g.rows.map((r, i) => renderRow(r, offset + i))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {!groups && sorted.length > limit && (
        <div className="card-foot table-more">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLimit((n) => n + (pageSize ?? 25))}>
            Weitere anzeigen ({Math.min(limit, sorted.length)} von {sorted.length})
          </button>
        </div>
      )}
    </div>
  );
}
