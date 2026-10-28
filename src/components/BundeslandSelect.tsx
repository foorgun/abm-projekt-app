import { BUNDESLAENDER } from "../lib/bundesland";
import { Select } from "./ui";

/** Auswahl der 16 Bundesländer (Kürzel), optional. Leer = "–". */
export function BundeslandSelect({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[{ value: "", label: "–" }, ...BUNDESLAENDER.map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` }))]}
    />
  );
}
