import { ChevronDown, Rows3 } from "lucide-react";
import { GROUP_DATES, GROUP_MODES, groupingLabel, type GroupDate, type GroupMode, type GroupSetting } from "../lib/projectGrouping";
import { Button, Popover, Select } from "./ui";

/**
 * Knopf "Gruppierung" neben "Filter" und "Spalten": Auswahl Keine, Monat, Jahr, Fertighausfirma, Bundesland, Planer,
 * Architekt, Verkäufer. Bei Monat und Jahr zusätzlich, nach welchem Datum.
 */
export function GroupPanel({ value, onChange }: { value: GroupSetting; onChange: (next: GroupSetting) => void }) {
  const byDate = value.mode === "monat" || value.mode === "jahr";
  const label = groupingLabel(value);
  return (
    <Popover
      label="Projekte gruppieren"
      className="col-popover group-popover"
      trigger={(t) => (
        <Button icon={<Rows3 size={15} />} {...t} title={label}>
          <span className="group-btn-label">{value.mode === "keine" ? "Gruppierung" : label}</span> <ChevronDown size={14} />
        </Button>
      )}
    >
      {() => (
        <div className="col-panel">
          <div className="popover-head">Gruppierung</div>
          <fieldset className="group-modes">
            <legend className="sr-only">Gruppieren nach</legend>
            {GROUP_MODES.map((m) => (
              <label key={m.key} className="group-mode">
                <input type="radio" name="gruppierung" value={m.key} checked={value.mode === m.key} onChange={() => onChange({ ...value, mode: m.key as GroupMode })} />
                {m.label}
              </label>
            ))}
          </fieldset>
          {byDate && (
            <div className="group-date">
              <label htmlFor="gruppierung-datum" className="field-label">
                Nach welchem Datum
              </label>
              <Select
                id="gruppierung-datum"
                value={value.date}
                onChange={(e) => onChange({ ...value, date: e.target.value as GroupDate })}
                options={GROUP_DATES.map((d) => ({ value: d.key, label: d.label }))}
              />
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
