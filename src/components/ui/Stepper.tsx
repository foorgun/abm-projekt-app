import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { formatDate } from "../../lib/format";

export interface StepperItem {
  key: string;
  label: string;
  date: string | null;
}

/**
 * Horizontaler Prozess-Stepper.
 * Zustände: erledigt (Datum gesetzt) · aktuell (erster offener Schritt) ·
 * fehlt (offen, obwohl ein späterer Schritt schon erledigt ist) · offen.
 */
export function stepStates(items: StepperItem[]): ("done" | "current" | "missing" | "open")[] {
  const lastDone = items.reduce((acc, it, i) => (it.date ? i : acc), -1);
  let currentSet = false;
  return items.map((it, i) => {
    if (it.date) return "done";
    if (i < lastDone) return "missing";
    if (!currentSet) {
      currentSet = true;
      return "current";
    }
    return "open";
  });
}

export function Stepper({
  items,
  onChangeDate,
}: {
  items: StepperItem[];
  /** Ohne Handler ist der Stepper nur Anzeige (z. B. für Freiberufler). */
  onChangeDate?: (key: string, date: string | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const states = stepStates(items);

  return (
    <ol className="stepper" aria-label="Projektablauf">
      {items.map((it, i) => {
        const state = states[i];
        const stateText = { done: "erledigt", current: "aktueller Schritt", missing: "fehlt noch", open: "offen" }[state];
        return (
          <li key={it.key} className="step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot" aria-hidden>
              {state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span className="step-label">{it.label}</span>
            <span className="sr-only">{stateText}</span>
            {editing === it.key && onChangeDate ? (
              <input
                type="date"
                className="input step-date-input"
                defaultValue={it.date ?? ""}
                autoFocus
                aria-label={`Datum für ${it.label}`}
                onBlur={(e) => {
                  setEditing(null);
                  const v = e.currentTarget.value || null;
                  if (v !== it.date) onChangeDate(it.key, v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="step-date"
                data-editable={Boolean(onChangeDate)}
                disabled={!onChangeDate}
                onClick={() => setEditing(it.key)}
                aria-label={onChangeDate ? `Datum für ${it.label} bearbeiten` : undefined}
              >
                {it.date ? formatDate(it.date) : state === "missing" ? "fehlt" : "–"}
                {onChangeDate && <Pencil size={11} aria-hidden />}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
