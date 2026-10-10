import { Receipt } from "lucide-react";
import { useToast } from "../../components/Toast";
import { Button, Card, DataTable, EmptyState, Pill, type Column, type Tone } from "../../components/ui";
import { formatDate, formatMoney } from "../../lib/format";
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
  const due = new Set(alerts.filter((a) => a.kind === "invoice_unsent").map((a) => a.invoiceId));

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
      render: (i) => (due.has(i.id) && i.status === "geplant" ? <Pill tone="warn">Jetzt fällig</Pill> : <Pill tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Pill>),
    },
    { key: "due", header: "Fällig", render: (i) => formatDate(i.dueOn) },
    { key: "sent", header: "Versendet", render: (i) => formatDate(i.sentOn) },
    { key: "paid", header: "Bezahlt", render: (i) => formatDate(i.paidOn) },
    {
      key: "action",
      header: <span className="sr-only">Aktion</span>,
      align: "right",
      render: (i) =>
        i.status === "geplant" || i.status === "faellig" ? (
          <Button size="sm" variant={due.has(i.id) ? "primary" : "outline"} onClick={() => void markSent(i)}>
            Als versendet markieren
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
              Offen <strong>{sum((i) => i.status === "geplant" || i.status === "faellig")}</strong>
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
