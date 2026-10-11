import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { cleanMasterName } from "../lib/projectForm";
import { Button, IconButton, Input, Select, type SelectOption } from "./ui";

const NEW = "__neu__";

/**
 * Auswahlliste mit der Option "+ Neu anlegen". Wählt man sie, wird aus der Liste ein Textfeld: Name eintragen, anlegen,
 * und der neue Eintrag ist gewählt. `onCreate` liefert den Wert des neuen Eintrags oder wirft mit einer Meldung.
 */
export function SelectOrCreate({
  id,
  value,
  options,
  emptyLabel,
  onChange,
  onCreate,
  canCreate,
  createPlaceholder,
  disabled,
}: {
  id: string;
  value: string;
  options: SelectOption[];
  /** Beschriftung der leeren Auswahl, z. B. "Noch offen" */
  emptyLabel: string;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<string>;
  canCreate: boolean;
  createPlaceholder: string;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errId = useId();

  function cancel() {
    setCreating(false);
    setName("");
    setError(null);
    // Fokus zurück auf die Liste, sobald sie wieder da ist
    setTimeout(() => document.getElementById(id)?.focus(), 0);
  }

  async function create() {
    if (busy) return;
    const checked = cleanMasterName(name, options.map((o) => o.label));
    if (!checked.ok) return setError(checked.reason);
    setBusy(true);
    setError(null);
    try {
      const created = await onCreate(checked.name);
      setCreating(false);
      setName("");
      onChange(created);
      setTimeout(() => document.getElementById(id)?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!creating) {
    return (
      <Select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => (e.target.value === NEW ? setCreating(true) : onChange(e.target.value))}
        options={[{ value: "", label: emptyLabel }, ...options, ...(canCreate && !disabled ? [{ value: NEW, label: "+ Neu anlegen" }] : [])]}
      />
    );
  }
  return (
    <>
      <div className="create-inline">
        <Input
          id={id}
          value={name}
          autoFocus
          placeholder={createPlaceholder}
          maxLength={80}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // nicht das ganze Projektformular absenden
              e.preventDefault();
              void create();
            }
            if (e.key === "Escape") {
              // nur dieses Feld schließen, nicht den Dialog
              e.stopPropagation();
              cancel();
            }
          }}
        />
        <Button size="sm" variant="primary" icon={<Check size={14} />} disabled={busy} onClick={() => void create()}>
          {busy ? "Legt an …" : "Anlegen"}
        </Button>
        <IconButton label="Abbrechen, zurück zur Auswahl" size="sm" disabled={busy} onClick={cancel}>
          <X size={15} />
        </IconButton>
      </div>
      {error && (
        <span className="field-error" id={errId} role="alert">
          {error}
        </span>
      )}
    </>
  );
}
