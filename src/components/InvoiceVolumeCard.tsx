import { AreaChart, AreaLegend, TrendPill, type AreaSeries } from "./charts/AreaChart";
import { Card, CardBody, CardHead } from "./ui";
import { formatMoney } from "../lib/format";
import { monthlyVolume, volumeTrend } from "../lib/invoiceStats";
import type { Invoice } from "../lib/types";

/**
 * Flächendiagramm "Rechnungsvolumen pro Monat" (12 Monate): versendet (Teal) und bezahlt (hell).
 * Trend-Pill: letzter vollständiger Monat gegenüber dem Monat davor. Auf der Rechnungsseite und im Dashboard.
 */
export function InvoiceVolumeCard({ invoices, today, height = 250 }: { invoices: Invoice[]; today: string; height?: number }) {
  const volume = monthlyVolume(invoices, today);
  const trend = volumeTrend(volume);
  const series: AreaSeries[] = [
    { name: "Versendet", values: volume.map((m) => m.sent), tone: "teal" },
    { name: "Bezahlt", values: volume.map((m) => m.paid), tone: "neutral" },
  ];
  return (
    <Card>
      <CardHead
        title={
          <>
            Rechnungsvolumen pro Monat
            <TrendPill percent={trend.percent} against={trend.against} label={`${trend.month} ggü. ${trend.against}`} />
          </>
        }
        sub={`Letzte 12 Monate, nach Versand- bzw. Zahlungsmonat. ${volume[volume.length - 1].title.split(" ")[0]} läuft noch (gestrichelt).`}
        actions={<AreaLegend series={series} />}
      />
      <CardBody>
        <AreaChart
          caption="Rechnungsvolumen pro Monat in Euro, versendet und bezahlt"
          height={height}
          labels={volume.map((m) => ({ label: m.label, title: m.title }))}
          series={series}
          partialLast
          partialNote="laufender Monat, unvollständig"
          format={(v) => formatMoney(Math.round(v * 100))}
        />
      </CardBody>
    </Card>
  );
}
