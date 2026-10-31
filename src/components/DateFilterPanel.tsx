import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ListFilter, Trash2 } from "lucide-react";
import {
  DATE_PRESETS,
  describeDateFilter,
  draftFromFilter,
  filterFromDraft,
  parseGermanDate,
  type DateFilter,
  type DateFilterDraft,
} from "../lib/dateFilters";
import { formatDate } from "../lib/format";
import { Button, IconButton, Input } from "./ui";

const MODES: { key: DateFilterDraft["mode"]; label: string }[] = [
  { key: "genau", label: "Genau" },
  { key: "zeitraum", label: "Zeitraum" },
  { key: "leer", label: "Kein Datum" },
  { key: "vorhanden", label: "Hat Datum" },
];

/** Datumsfeld: Eingabe als TT.MM.JJJJ, daneben die Datumsauswahl des Browsers (nur als Auswahlhilfe). */
function DateField({ label, value, onChange, invalid, autoFocus }: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean; autoFocus?: boolean }) {
  const id = useId();
  const native = useRef<HTMLInputElement>(null);
  const iso = parseGermanDate(value);
  function openPicker() {
    const el = native.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  }
  return (
    <div className="date-field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <span className="date-field-row">
        <Input
          id={id}
          inputMode="numeric"
          placeholder="TT.MM.JJJJ"
          autoComplete="off"
          value={value}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
        <IconButton size="sm" label={`${label}: Datum auswählen`} onClick={openPicker}>
          <CalendarDays size={15} />
        </IconButton>
        <input
          ref={native}
          type="date"
          className="date-native"
          tabIndex={-1}
          aria-hidden
          value={iso && iso !== "invalid" ? iso : ""}
          onChange={(e) => onChange(e.target.value ? formatDate(e.target.value) : "")}
        />
      </span>
    </div>
  );
}

/** Inhalt des Auswahlfelds: Modus, Datum/Zeitraum, Schnellauswahl, Meldung bei falscher Eingabe. */
export function DateFilterEditor({
  label,
  value,
  today,
  onApply,
  onClose,
}: {
  label: string;
  value: DateFilter | undefined;
  today: string;
  onApply: (f: DateFilter | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DateFilterDraft>(() => draftFromFilter(value));
  const [error, setError] = useState<string | null>(null);
  const name = useId();
  const set = (patch: Partial<DateFilterDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };
  function apply() {
    const res = filterFromDraft(draft);
    if ("error" in res) return setError(res.error);
    onApply(res.filter);
    onClose();
  }
  const preset = value?.mode === "relativ" ? value.preset : null;
  return (
    <form
      className="date-filter"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="popover-head">
        {label}
        {value && <span className="muted"> · {describeDateFilter(value, today)}</span>}
      </div>
      <div className="date-filter-body">
        <fieldset className="date-modes">
          <legend className="sr-only">Art des Datumsfilters</legend>
          {MODES.map((m) => (
            <label key={m.key} className="date-mode">
              <input type="radio" name={name} value={m.key} checked={draft.mode === m.key} onChange={() => set({ mode: m.key })} />
              {m.label}
            </label>
          ))}
        </fieldset>
        {draft.mode === "genau" && <DateField label="Datum" value={draft.date} onChange={(date) => set({ date })} invalid={Boolean(error)} autoFocus />}
        {draft.mode === "zeitraum" && (
          <div className="date-range">
            <DateField label="Von" value={draft.from} onChange={(from) => set({ from })} invalid={Boolean(error)} autoFocus />
            <DateField label="Bis" value={draft.to} onChange={(to) => set({ to })} invalid={Boolean(error)} />
          </div>
        )}
        {draft.mode === "zeitraum" && <p className="date-filter-hint muted">Beide Tage zählen mit. Nur „Von“ oder nur „Bis“ geht auch.</p>}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="date-presets">
          <span className="field-label">Schnellauswahl</span>
          <div className="chips">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="chip"
                aria-pressed={preset === p.key}
                onClick={() => {
                  onApply({ mode: "relativ", preset: p.key });
                  onClose();
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="date-filter-foot">
        {value && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={14} />}
            onClick={() => {
              onApply(null);
              onClose();
            }}
          >
            Entfernen
          </Button>
        )}
        <Button size="sm" variant="primary" type="submit" icon={<Check size={14} />}>
          Anwenden
        </Button>
      </div>
    </form>
  );
}

const PANEL_WIDTH = 340;

/**
 * Knopf mit Auswahlfeld für einen Datumsfilter. Das Feld hängt am Seitenende (Portal, feste Position am Knopf), damit es
 * im Spaltenkopf nicht vom horizontal scrollenden Tabellencontainer abgeschnitten wird. Schließt bei Klick außerhalb
 * und mit Escape.
 */
export function DateFilterButton({
  label,
  value,
  today,
  onChange,
  trigger,
}: {
  label: string;
  value: DateFilter | undefined;
  today: string;
  onChange: (f: DateFilter | null) => void;
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog"; ref: (el: HTMLButtonElement | null) => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    };
    place();
    // beim Scrollen (Seite oder Tabelle) wandert das Feld mit dem Knopf mit
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {trigger({
        onClick: () => setOpen((o) => !o),
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        ref: (el) => {
          btn.current = el;
        },
      })}
      {open &&
        createPortal(
          <div
            ref={panel}
            className="popover date-popover"
            role="dialog"
            aria-label={`Datumsfilter ${label}`}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
          >
            <DateFilterEditor label={label} value={value} today={today} onApply={onChange} onClose={() => close()} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Kleines Filter-Symbol im Spaltenkopf einer Datumsspalte; bei aktivem Filter hervorgehoben. */
export function HeaderDateFilter({ label, value, today, onChange }: { label: string; value: DateFilter | undefined; today: string; onChange: (f: DateFilter | null) => void }) {
  const title = value ? `Filter ${label}: ${describeDateFilter(value, today)}` : `Nach ${label} filtern`;
  return (
    <DateFilterButton
      label={label}
      value={value}
      today={today}
      onChange={onChange}
      trigger={({ ref, ...t }) => (
        <button ref={ref} type="button" className="th-filter" data-active={Boolean(value) || undefined} aria-label={title} title={title} {...t}>
          <ListFilter size={13} aria-hidden />
        </button>
      )}
    />
  );
}
