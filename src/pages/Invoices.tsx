import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Send } from "lucide-react";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, DataTable, EmptyState, ErrorState, KpiCard, Pill, TableSkeleton, Tabs, type Column } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { projectTitle } from "../lib/projects";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Invoice, InvoiceStatus } from "../lib/types";
import { INVOICE_STATUS } from "./project/InvoicesTab";

type Filter = "offen" | InvoiceStatus | "alle";

/** Alle Rechnungen (nur Mitarbeiter). "Offen" = geplant oder fällig, also noch nicht versendet. */
export function Invoices() {
  const { data, loading, error, reload, allAlerts, today, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("offen");
  const projects = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);
  const due = new Set(allAlerts.filter((a) => a.kind === "invoice_unsent").map((a) => a.invoiceId));

  const head = <PageHead title="Rechnungen" sub="Rechnungen werden in der Buchhaltung erstellt; hier wird nur verfolgt, ob sie versendet und bezahlt sind." />;
  if (user.role === "freiberufler") {
    return (
      <>
        {head}
        <Card>
          <EmptyState title="Rechnungen sind nur für Mitarbeiter sichtbar" />
        </Card>
      </>
    );
  }
  if (error) {
    return (
      <>
        {head}
        <Card>
          <ErrorState message={error} onRetry={() => void reload()} />
        </Card>
      </>
    );
  }

  const invoices = data?.invoices ?? [];
  const isOpen = (i: Invoice) => i.status === "geplant" || i.status === "faellig";
  const match = (i: Invoice) => (filter === "alle" ? true : filter === "offen" ? isOpen(i) : i.status === filter);
  // Offene: jetzt fällige (Warnung) zuerst, dann nach Fälligkeit
  const list = invoices.filter(match).sort((a, b) => Number(due.has(b.id)) - Number(due.has(a.id)) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const sum = (f: (i: Invoice) => boolean) => invoices.filter(f).reduce((s, i) => s + i.amountCents, 0);

  async function markSent(i: Invoice) {
    const res = await mutate((r) => r.markInvoiceSent(i.id, today));
    toast(res.ok ? `${i.label} als versendet markiert` : res.error, res.ok ? "ok" : "danger");
  }

  const columns: Column<Invoice>[] = [
    {
      key: "project",
      header: "Projekt",
      strong: true,
      render: (i) => {
        const p = projects.get(i.projectId);
        return p ? (
          <Link to={`/projekte/${p.id}?tab=rechnungen`} onClick={(e) => e.stopPropagation()}>
            {projectTitle(p)}
          </Link>
        ) : (
          "–"
        );
      },
      sortValue: (i) => projects.get(i.projectId)?.bauherrLabel ?? "",
    },
    {
      key: "label",
      header: "Rechnung",
      render: (i) => (
        <span className="invoice-label" title={i.label}>
          {i.label}
        </span>
      ),
      sortValue: (i) => i.label,
    },
    { key: "amount", header: "Betrag", align: "right", render: (i) => formatMoney(i.amountCents), sortValue: (i) => i.amountCents },
    {
      key: "status",
      header: "Status",
      render: (i) => (due.has(i.id) && i.status === "geplant" ? <Pill tone="warn">Jetzt fällig</Pill> : <Pill tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Pill>),
      sortValue: (i) => i.status,
    },
    { key: "due", header: "Fällig", render: (i) => formatDate(i.dueOn), sortValue: (i) => i.dueOn ?? "" },
    { key: "sent", header: "Versendet", render: (i) => formatDate(i.sentOn), sortValue: (i) => i.sentOn ?? "" },
    { key: "paid", header: "Bezahlt", render: (i) => formatDate(i.paidOn), sortValue: (i) => i.paidOn ?? "" },
    {
      key: "action",
      header: <span className="sr-only">Aktion</span>,
      align: "right",
      render: (i) =>
        isOpen(i) ? (
          <Button
            size="sm"
            variant={due.has(i.id) ? "primary" : "outline"}
            icon={<Send size={13} />}
            onClick={() => void markSent(i)}
            aria-label={`${i.label} als versendet markieren`}
            title="Als versendet markieren"
          >
            Versendet
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      {head}
      <div className="stack">
        <div className="grid-kpi">
          <KpiCard icon={<Receipt size={16} />} tone="danger" label="Jetzt fällig, nicht versendet" value={formatMoney(sum((i) => due.has(i.id)))} valueTone={due.size ? "danger" : undefined} foot={`${due.size} Rechnungen`} />
          <KpiCard icon={<Receipt size={16} />} tone="warn" label="Geplant" value={formatMoney(sum((i) => i.status === "geplant" && !due.has(i.id)))} foot="Auslöser noch nicht erreicht" />
          <KpiCard icon={<Receipt size={16} />} tone="info" label="Versendet, offen" value={formatMoney(sum((i) => i.status === "versendet"))} foot="noch nicht bezahlt" />
          <KpiCard icon={<Receipt size={16} />} tone="ok" label="Bezahlt" value={formatMoney(sum((i) => i.status === "bezahlt"))} foot="gesamt" />
        </div>
        <Tabs<Filter>
          label="Rechnungsstatus"
          value={filter}
          onChange={setFilter}
          items={[
            { key: "offen", label: "Nicht versendet", count: invoices.filter(isOpen).length },
            { key: "versendet", label: "Versendet", count: invoices.filter((i) => i.status === "versendet").length },
            { key: "bezahlt", label: "Bezahlt", count: invoices.filter((i) => i.status === "bezahlt").length },
            { key: "alle", label: "Alle", count: invoices.length },
          ]}
        />
        <Card>
          {loading || !data ? (
            <TableSkeleton rows={6} cols={6} />
          ) : list.length ? (
            <DataTable label="Rechnungen" rows={list} columns={columns} rowKey={(i) => i.id} stickyFirst compact />
          ) : (
            <EmptyState icon={<Receipt size={18} />} title="Keine Rechnungen in dieser Ansicht" />
          )}
        </Card>
      </div>
    </>
  );
}
