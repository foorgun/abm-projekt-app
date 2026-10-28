import { useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Columns3, GripVertical, RotateCcw } from "lucide-react";
import { moveColumn, moveColumnTo, toggleColumn, type ColumnKey, type ColumnState } from "../lib/projectColumns";
import { Button, Checkbox, IconButton, Popover } from "./ui";

/**
 * Knopf "Spalten" mit Feld zum Ein- und Ausblenden und Umsortieren der Spalten.
 * Reihenfolge per Drag-and-drop (native HTML5, Maus) oder mit den Auf/Ab-Knöpfen (Tastatur, Handy).
 */
export function ColumnPanel({
  state,
  labels,
  onChange,
  onReset,
}: {
  state: ColumnState;
  labels: Record<ColumnKey, string>;
  onChange: (next: ColumnState) => void;
  onReset: () => void;
}) {
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);
  const [overKey, setOverKey] = useState<ColumnKey | null>(null);
  const visible = state.filter((c) => c.visible).length;

  const dragProps = (key: ColumnKey, index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDragKey(key);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", key);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragKey) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overKey !== key) setOverKey(key);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragKey) onChange(moveColumnTo(state, dragKey, index));
      setDragKey(null);
      setOverKey(null);
    },
    onDragEnd: () => {
      setDragKey(null);
      setOverKey(null);
    },
  });

  return (
    <Popover
      label="Spalten auswählen und sortieren"
      className="col-popover"
      trigger={(t) => (
        <Button icon={<Columns3 size={15} />} {...t}>
          Spalten <ChevronDown size={14} />
        </Button>
      )}
    >
      {() => (
        <div className="col-panel">
          <div className="popover-head">
            Spalten <span className="muted">· {visible} sichtbar</span>
          </div>
          <p className="col-panel-hint muted">Haken: sichtbar. Reihenfolge per Ziehen oder mit den Pfeilen.</p>
          <ol className="col-list" aria-label="Spalten">
            {state.map((c, i) => {
              const label = labels[c.key];
              return (
                <li key={c.key} className="col-item" data-dragging={dragKey === c.key || undefined} data-over={(overKey === c.key && dragKey !== c.key) || undefined} {...dragProps(c.key, i)}>
                  <GripVertical size={14} className="col-grip" aria-hidden />
                  <Checkbox
                    label={label}
                    checked={c.visible}
                    // die letzte sichtbare Spalte lässt sich nicht ausblenden
                    disabled={c.visible && visible === 1}
                    onChange={() => onChange(toggleColumn(state, c.key))}
                  />
                  <span className="col-moves">
                    <IconButton size="sm" label={`${label} nach oben`} disabled={i === 0} onClick={() => onChange(moveColumn(state, c.key, -1))}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton size="sm" label={`${label} nach unten`} disabled={i === state.length - 1} onClick={() => onChange(moveColumn(state, c.key, 1))}>
                      <ArrowDown size={14} />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="col-panel-foot">
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={onReset}>
              Zurücksetzen
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
