import { abmHints } from "../lib/abmNr";
import type { Company } from "../lib/types";

/**
 * Hinweise unter der ABM-Nr.: unbekannter Nummernkreis, Nummer passt nicht zur Hausbaufirma, Firma lässt sich ableiten.
 * Nur Hinweise, kein Fehler: gespeichert werden darf trotzdem. `onUseCompany` zeigt den Knopf "übernehmen".
 */
export function AbmHinweise({
  abmNr,
  companyId,
  companies,
  onUseCompany,
}: {
  abmNr: string | null | undefined;
  companyId: string | null | undefined;
  companies: Company[];
  onUseCompany?: (company: Company) => void;
}) {
  const hints = abmHints(abmNr, companyId, companies);
  if (!hints.length) return null;
  return (
    <>
      {hints.map((h) => (
        <span key={h.text} className="field-hint abm-hint" data-tone={h.tone} role={h.tone === "warn" ? "status" : undefined}>
          {h.text}
          {h.company && onUseCompany && (
            <>
              {" "}
              <button type="button" className="hint-action" onClick={() => onUseCompany(h.company!)}>
                {h.company.name} übernehmen
              </button>
            </>
          )}
        </span>
      ))}
    </>
  );
}
