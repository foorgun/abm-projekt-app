import { Field, Input } from "./ui";

/** Auswahl Baubegleitung ja/nein; mit `detail` zusätzlich die Leistungen (z. B. "3.1+3.2", Spalte aus der Excel). */
export function BaubegleitungField({
  name,
  value,
  onChange,
  detail,
}: {
  name: string;
  value: boolean;
  onChange: (value: boolean) => void;
  detail?: { value: string; onChange: (value: string) => void };
}) {
  return (
    <fieldset className="choice-field">
      <legend className="field-label">Baubegleitung</legend>
      <div className="choice-row">
        <label className="group-mode">
          <input type="radio" name={name} checked={value} onChange={() => onChange(true)} />
          Ja
        </label>
        <label className="group-mode">
          <input type="radio" name={name} checked={!value} onChange={() => onChange(false)} />
          Nein
        </label>
      </div>
      <span className="field-hint">Ohne Baubegleitung endet der Prozess bei der Baufreigabe und der Ordner „11 Baubegleitung“ entfällt.</span>
      {detail && value && (
        <Field label="Leistungen" htmlFor={`${name}-detail`} hint="Optional, wie in der Projektliste, z. B. 3.1+3.2">
          <Input id={`${name}-detail`} value={detail.value} onChange={(e) => detail.onChange(e.target.value)} autoComplete="off" />
        </Field>
      )}
    </fieldset>
  );
}
