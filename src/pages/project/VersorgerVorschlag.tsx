import { useState } from "react";
import { Copy, ExternalLink, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Pill } from "../../components/ui";
import type { ProtokollDaten } from "../../lib/planungsprotokoll/daten";
import {
  kontaktAusVorschlag,
  QUELLE_HINWEIS_VERSORGER,
  ROLLE_TEXT,
  STROM_PRUEFEN,
  VERSORGER_ROLLEN,
  versorgerAnfrage,
  type Sicherheit,
  type VersorgerAntwort,
  type VersorgerRolle,
} from "../../lib/planungsprotokoll/versorger";
import { useData } from "../../lib/store";

const SICHERHEIT: Record<Sicherheit, { text: string; tone: "ok" | "warn" | "neutral" }> = {
  hoch: { text: "offizielle Angabe", tone: "ok" },
  mittel: { text: "abgeleitet", tone: "neutral" },
  niedrig: { text: "unsicher", tone: "warn" },
};

/**
 * Knopf „Behörden und Versorger ermitteln“ (Angaben für Seite 1): schlägt zum Bauort Bauamt, Wasser, Abwasser und Strom vor
 * (KI-Websuche über die Edge Function versorger-suche). Vorgewählt sind Rollen, die im Formular noch leer sind, außer bei
 * unsicheren Treffern. „Übernehmen“ schreibt nur ins Formular; gespeichert wird wie immer mit „Angaben speichern“.
 */
export function VersorgerVorschlag({
  bauort,
  belegt,
  uebersicht,
  onUebernehmen,
}: {
  bauort: ProtokollDaten["bauort"];
  /** Rollen, die im Formular schon einen Namen haben */
  belegt: Partial<Record<VersorgerRolle, string>>;
  uebersicht: string;
  onUebernehmen: (r: VersorgerRolle, k: ReturnType<typeof kontaktAusVorschlag>) => void;
}) {
  const { repo } = useData();
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState<VersorgerAntwort | null>(null);
  const [wahl, setWahl] = useState<Set<VersorgerRolle>>(new Set());
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [uebernommen, setUebernommen] = useState<string[] | null>(null);
  const { anfrage, fehlt } = versorgerAnfrage(bauort);
  const adresse = [bauort.strasse, bauort.plzOrt].filter(Boolean).join(", ");

  async function suchen() {
    if (!anfrage) return;
    setBusy(true);
    setHinweis(null);
    setUebernommen(null);
    setErgebnis(null);
    try {
      const res = await repo.versorgerSuchen(anfrage);
      if (!res.ok) return setHinweis(res.message);
      const gefunden = VERSORGER_ROLLEN.filter((r) => res.vorschlaege[r]);
      if (!gefunden.length) return setHinweis("Die Suche hat zu diesem Ort nichts Verlässliches gefunden. Bitte von Hand eintragen.");
      setErgebnis(res);
      setWahl(new Set(gefunden.filter((r) => !belegt[r]?.trim() && res.vorschlaege[r]!.sicherheit !== "niedrig")));
    } catch (e) {
      setHinweis(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function uebernehmen() {
    if (!ergebnis) return;
    const namen: string[] = [];
    for (const r of VERSORGER_ROLLEN) {
      const v = ergebnis.vorschlaege[r];
      if (v && wahl.has(r)) {
        onUebernehmen(r, kontaktAusVorschlag(v));
        namen.push(ROLLE_TEXT[r]);
      }
    }
    setUebernommen(namen);
    setErgebnis(null);
  }

  const umschalten = (r: VersorgerRolle) =>
    setWahl((alt) => {
      const neu = new Set(alt);
      if (neu.has(r)) neu.delete(r);
      else neu.add(r);
      return neu;
    });

  return (
    <div className="pp-vorschlag pp-versorger">
      <div className="pp-vorschlag-kopf">
        <Button size="sm" icon={<Search size={14} />} disabled={busy || !anfrage} onClick={() => void suchen()}>
          {busy ? "Sucht … (bis zu einer Minute)" : "Behörden und Versorger ermitteln"}
        </Button>
        <span className="field-hint">
          {anfrage ? `Bauamt, Wasser, Abwasser und Strom zu ${anfrage.plz} ${anfrage.ort}${anfrage.ortsteil ? ` (${anfrage.ortsteil})` : ""} vorschlagen.` : fehlt}{" "}
          {!anfrage && <Link to={uebersicht}>Zum Bauort</Link>}
        </span>
      </div>

      {ergebnis && (
        <fieldset className="pp-kandidaten">
          <legend className="field-hint">
            {QUELLE_HINWEIS_VERSORGER}
            {ergebnis.gespeichert ? " (Ergebnis einer früheren Suche zu diesem Ort)" : ""}
          </legend>
          {VERSORGER_ROLLEN.map((r) => {
            const v = ergebnis.vorschlaege[r];
            if (!v) {
              return (
                <p key={r} className="field-hint">
                  {ROLLE_TEXT[r]}: nichts gefunden, bitte von Hand eintragen.
                </p>
              );
            }
            return (
              <label key={r} className="pp-kandidat">
                <input type="checkbox" checked={wahl.has(r)} onChange={() => umschalten(r)} aria-label={`${ROLLE_TEXT[r]} übernehmen`} />
                <span className="pp-kandidat-text">
                  <span className="muted">{ROLLE_TEXT[r]}</span>
                  <strong>{v.name}</strong>
                  <span className="muted">{[v.anschrift, v.tel, v.email].filter(Boolean).join(" · ") || "ohne Kontaktdaten"}</span>
                  {v.hinweis && <span className="muted">{v.hinweis}</span>}
                  {belegt[r]?.trim() && <span className="muted">Im Formular steht schon: {belegt[r]}</span>}
                  {v.quelle && (
                    <a href={v.quelle} target="_blank" rel="noreferrer noopener">
                      Quelle öffnen
                    </a>
                  )}
                </span>
                <Pill tone={SICHERHEIT[v.sicherheit].tone} dot={false}>
                  {SICHERHEIT[v.sicherheit].text}
                </Pill>
              </label>
            );
          })}
          <div className="pp-actions">
            <Button size="sm" variant="primary" disabled={!wahl.size} onClick={uebernehmen}>
              Übernehmen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setErgebnis(null)}>
              Verwerfen
            </Button>
          </div>
        </fieldset>
      )}

      <div className="pp-vorschlag-kopf">
        <span className="field-hint">Strom gegenprüfen (Bauadresse wird kopiert):</span>
        {STROM_PRUEFEN.map((l) => (
          <Button
            key={l.url}
            size="sm"
            variant="ghost"
            icon={adresse ? <Copy size={14} /> : <ExternalLink size={14} />}
            onClick={() => {
              if (adresse) void navigator.clipboard?.writeText(adresse).catch(() => undefined);
              window.open(l.url, "_blank", "noopener,noreferrer");
            }}
          >
            {l.label}
          </Button>
        ))}
      </div>

      {uebernommen && (
        <p className="field-hint" role="status">
          {uebernommen.join(", ")} ins Formular übernommen. Bitte prüfen und mit „Angaben speichern“ sichern.
        </p>
      )}
      {hinweis && (
        <p className="field-hint pp-vorschlag-hinweis" role="status">
          {hinweis}
        </p>
      )}
    </div>
  );
}
