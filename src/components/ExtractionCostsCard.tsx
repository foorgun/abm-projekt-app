import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { formatMonth } from "../lib/format";
import { useData } from "../lib/store";
import type { ExtractionCostRow, ExtractionCosts } from "../lib/types";
import { Card, CardBody, CardHead, DataTable, EmptyState, ErrorState, Skeleton, type Column } from "./ui";

const eur = (v: number) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const tokens = (v: number) => v.toLocaleString("de-DE");

/**
 * Nur Admin: Kosten der KI-Auslesung je Monat und je Projekt (aus extraction_log, geschätzt aus Tokens und Listenpreis;
 * maßgeblich bleibt die Abrechnung des Anbieters). Die Kostenbremse (20 € im Monat) zählt in UTC-Monaten.
 */
export function ExtractionCostsCard() {
  const { repo } = useData();
  const [costs, setCosts] = useState<ExtractionCosts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    repo.extractionCosts().then(
      (c) => alive && setCosts(c),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : "Kosten konnten nicht geladen werden"),
    );
    return () => {
      alive = false;
    };
  }, [repo, attempt]);

  const columns = (first: string, label: (r: ExtractionCostRow) => string): Column<ExtractionCostRow>[] => [
    { key: "label", header: first, render: label, sortValue: (r) => r.key },
    { key: "n", header: "Auslesungen", align: "right", render: (r) => `${r.auslesungen}${r.fehlgeschlagen ? ` (${r.fehlgeschlagen} fehlgeschlagen)` : ""}`, sortValue: (r) => r.auslesungen },
    { key: "tok", header: "Token Eingabe / Ausgabe", align: "right", render: (r) => `${tokens(r.inputTokens)} / ${tokens(r.outputTokens)}` },
    { key: "eur", header: "Kosten (geschätzt)", align: "right", strong: true, render: (r) => eur(r.kostenEur), sortValue: (r) => r.kostenEur },
  ];

  return (
    <Card>
      <CardHead title="KI-Auslesung: Kosten" sub="Nur für Admins. Geschätzt aus Token und Listenpreis; maßgeblich ist die Abrechnung des Anbieters. Budget: 20 € je Monat (UTC)." />
      <CardBody>
        {error ? (
          <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !costs ? (
          <Skeleton h={120} />
        ) : !costs.monate.length ? (
          <EmptyState icon={<Sparkles size={18} />} title="Noch keine Auslesungen" text={repo.mode === "demo" ? "Im Demo-Modus liest der Browser selbst; es fallen keine Kosten an." : "Sobald Dokumente ausgelesen werden, stehen hier die Kosten je Monat und je Projekt."} />
        ) : (
          <div className="stack">
            <DataTable compact label="Kosten je Monat" rows={costs.monate} rowKey={(r) => r.key} columns={columns("Monat", (r) => formatMonth(`${r.key}-01`))} />
            {(costs.projekte.length > 0 || costs.ohneProjekt) && (
              <DataTable
                compact
                label="Kosten je Projekt"
                rows={[...costs.projekte, ...(costs.ohneProjekt ? [costs.ohneProjekt] : [])]}
                rowKey={(r) => r.key}
                initialSort={{ key: "eur", dir: "desc" }}
                columns={columns("Projekt", (r) => r.label)}
              />
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
