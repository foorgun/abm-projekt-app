import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Wert für die Sortierung. Ohne diesen Wert ist die Spalte nicht sortierbar. */
  sortValue?: (row: T) => string | number | null;
  align?: "left" | "right";
  strong?: boolean;
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
  label,
  initialSort,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Inhalt der aufgeklappten Zeile; macht Zeilen aufklappbar. */
  expand?: (row: T) => ReactNode;
  label: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [open, setOpen] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "de")) * dir;
    });
  }, [rows, columns, sort]);

  function toggleSort(key: string) {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const clickable = Boolean(onRowClick || expand);

  return (
    <div className="table-wrap">
      <table className="table" aria-label={label}>
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
          {sorted.map((row) => {
            const k = rowKey(row);
            const isOpen = open === k;
            return (
              <Fragment key={k}>
                <tr
                  data-clickable={clickable}
                  tabIndex={clickable ? 0 : undefined}
                  aria-expanded={expand ? isOpen : undefined}
                  onClick={() => (expand ? setOpen(isOpen ? null : k) : onRowClick?.(row))}
                  onKeyDown={(e) => {
                    if (!clickable || (e.key !== "Enter" && e.key !== " ")) return;
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault();
                    if (expand) setOpen(isOpen ? null : k);
                    else onRowClick?.(row);
                  }}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={[c.align === "right" && "num", c.strong && "strong"].filter(Boolean).join(" ") || undefined}>
                      {c.render(row)}
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
          })}
        </tbody>
      </table>
    </div>
  );
}
