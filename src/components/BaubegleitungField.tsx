/** Auswahl Baubegleitung ja/nein (Neues Projekt und Projektdaten). */
export function BaubegleitungField({ name, value, onChange }: { name: string; value: boolean; onChange: (value: boolean) => void }) {
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
      <span className="field-hint">Ohne Baubegleitung endet der Prozess bei der Baufreigabe.</span>
    </fieldset>
  );
}
