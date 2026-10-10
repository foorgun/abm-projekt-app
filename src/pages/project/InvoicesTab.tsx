import { Receipt } from "lucide-react";
import { useToast } from "../../components/Toast";
import { Button, Card, DataTable, EmptyState, Pill, type Column, type Tone } from "../../components/ui";
import { addDays, formatDate, formatMoney } from "../../lib/format";
import { unsentAges } from "../../lib/invoiceStats";
import { useData } from "../../lib/store";
import type { Invoice, InvoiceStatus } from "../../lib/types";

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  geplant: { label: "Geplant", tone: "neutral" },
  faellig: { label: "Fällig", tone: "danger" },
  versendet: { label: "Versendet", tone: "info" },
  bezahlt: { label: "Bezahlt", tone: "ok" },
};

/** Rechnungen eines Projekts (nur Mitarbeiter). */
export function InvoicesTab({ invoices }: { invoices: Invoice[] }) {
  const { data, mutate, today, alerts } = useData();
  const toast = useToast();
  const stepLabel = (k: string | null) => data?.stepDefinitions.find((s) => s.key === k)?.label ?? "–";
  // Alter in Tagen je fälliger, nicht versendeter Rechnung (wie auf der Seite Rechnungen)
  const ages = unsentAges(alerts);
  const due = { has: (id: string) => ages.has(id) };
  const dueDate = (i: Invoice) => i.dueOn ?? (ages.has(i.id) ? addDays(today, -ages.get(i.id)!) : null);

  async function markSent(i: Invoice) {
    const res = await mutate((r) => r.markInvoiceSent(i.id, today));
    toast(res.ok ? `${i.label} als versendet markiert` : res.error, res.ok ? "ok" : "danger");
  }

  const columns: Column<Invoice>[] = [
    { key: "label", header: "Rechnung", strong: true, render: (i) => i.label },
    { key: "amount", header: "Betrag", align: "right", render: (i) => formatMoney(i.amountCents), sortValue: (i) => i.amountCents },
    { key: "trigger", header: "Auslöser", render: (i) => stepLabel(i.triggerStep) },
    {
      key: "status",
      header: "Status",
      render: (i) =>
        ages.has(i.id) ? (
          <Pill tone={ages.get(i.id)! > 7 ? "danger" : "warn"}>
            {ages.get(i.id)} {ages.get(i.id) === 1 ? "Tag" : "Tage"} fällig
          </Pill>
        ) : (
          <Pill tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Pill>
        ),
    },
    { key: "due", header: "Fällig", render: (i) => formatDate(dueDate(i)) },
    { key: "sent", header: "Versendet", render: (i) => formatDate(i.sentOn) },
    { key: "paid", header: "Bezahlt", render: (i) => formatDate(i.paidOn) },
    {
      key: "action",
      header: <span className="sr-only">Aktion</span>,
      align: "right",
      render: (i) =>
        i.status === "geplant" || i.status === "faellig" ? (
          <Button size="sm" variant={due.has(i.id) ? "primary" : "outline"} onClick={() => void markSent(i)} aria-label={`${i.label} als versendet markieren`} title="Als versendet markieren">
            Als versendet
          </Button>
        ) : null,
    },
  ];

  const sum = (f: (i: Invoice) => boolean) => formatMoney(invoices.filter(f).reduce((s, i) => s + i.amountCents, 0));

  return (
    <Card>
      {invoices.length ? (
        <>
          <div className="invoice-sums">
            <span>
              Gesamt <strong>{sum(() => true)}</strong>
            </span>
            <span>
              Noch nicht versendet <strong>{sum((i) => i.status === "geplant" || i.status === "faellig")}</strong>
            </span>
            <span>
              Versendet, offen <strong>{sum((i) => i.status === "versendet")}</strong>
            </span>
            <span>
              Bezahlt <strong>{sum((i) => i.status === "bezahlt")}</strong>
            </span>
          </div>
          <DataTable label="Rechnungen des Projekts" rows={invoices} columns={columns} rowKey={(i) => i.id} />
        </>
      ) : (
        <EmptyState icon={<Receipt size={18} />} title="Keine Rechnungen" text="Für dieses Projekt sind noch keine Rechnungen geplant." />
      )}
    </Card>
  );
}
