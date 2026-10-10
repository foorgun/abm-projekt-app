import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Hourglass, Info, MailWarning, Receipt, Send, Timer, X } from "lucide-react";
import { BarChart } from "../components/charts/BarChart";
import { InvoiceVolumeCard } from "../components/InvoiceVolumeCard";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, CardBody, CardHead, DataTable, EmptyState, ErrorState, KpiCard, KpiSkeleton, Pill, Skeleton, TableSkeleton, Tabs, type Column } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { AGE_BUCKETS, ageBucketOf, agingBuckets, invoiceKpis, unsentAges, type AgeBucket } from "../lib/invoiceStats";
import { projectTitle } from "../lib/projects";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Invoice } from "../lib/types";
import { INVOICE_STATUS } from "./project/InvoicesTab";

type Tab = "alle" | "unsent" | "versendet" | "bezahlt";

/**
 * Rechnungen (nur Mitarbeiter): Kennzahlen, Volumen pro Monat, nicht versendete nach Alter und die Tabelle.
 * "Nicht versendet" = fällig und noch nicht versendet. Geplante Rechnungen stehen unter "Alle".
 * Beträge und Auslöser sind im Prototyp Annahmen (docs/offene-fragen.md).
 */
export function Invoices() {
  const { data, loading, error, reload, allAlerts, today, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("alle");
  const [age, setAge] = useState<AgeBucket | null>(null);
  const projects = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);
  const ages = useMemo(() => unsentAges(allAlerts), [allAlerts]);

  const head = (
    <PageHead
      title="Rechnungen"
      sub="Rechnungen entstehen in der Buchhaltung. Hier wird verfolgt, ob sie versendet und bezahlt sind."
      actions={
        <span className="assumption-note" title="Im Prototyp erfunden: Beträge, Auslöser (welcher Schritt eine Rechnung fällig macht) und die Frist von 7 Tagen. Mit ABM abzustimmen.">
          <Info size={14} aria-hidden /> Beträge und Auslöser sind Annahmen
        </span>
      }
    />
  );

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
  if (loading || !data) {
    return (
      <>
        {head}
        <div className="stack">
          <div className="grid-kpi">
            {Array.from({ length: 4 }, (_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
          <Skeleton h={280} round />
          <Card>
            <TableSkeleton rows={6} cols={6} />
          </Card>
        </div>
      </>
    );
  }

  const invoices = data.invoices;
  const k = invoiceKpis(invoices, allAlerts, today);
  const buckets = agingBuckets(invoices, allAlerts);
  const isUnsent = (i: Invoice) => ages.has(i.id);
  const match = (i: Invoice) => {
    if (tab === "unsent") return isUnsent(i) && (!age || ageBucketOf(ages.get(i.id)!) === age);
    if (tab === "versendet") return i.status === "versendet";
    if (tab === "bezahlt") return i.status === "bezahlt";
    return true;
  };
  // Nicht versendete zuerst (älteste oben), dann nach Datum absteigend
  const list = invoices.filter(match).sort((a, b) => {
    const ua = ages.get(a.id) ?? -1;
    const ub = ages.get(b.id) ?? -1;
    if (ua !== ub) return ub - ua;
    return (b.sentOn ?? b.dueOn ?? "").localeCompare(a.sentOn ?? a.dueOn ?? "");
  });

  async function markSent(i: Invoice) {
    const res = await mutate((r) => r.markInvoiceSent(i.id, today));
    const p = projects.get(i.projectId);
    toast(res.ok ? "Als versendet markiert" : res.error, res.ok ? "ok" : "danger", res.ok ? `${i.label}${p ? ` · ${p.bauherrLabel}` : ""} · ${formatMoney(i.amountCents)}` : undefined);
  }

  function selectAge(index: number | null) {
    const next = index == null ? null : AGE_BUCKETS[index].key;
    setAge(next);
    if (next) setTab("unsent");
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
      render: (i) =>
        isUnsent(i) ? (
          <Pill tone={ages.get(i.id)! > 7 ? "danger" : "warn"}>
            {ages.get(i.id)} {ages.get(i.id) === 1 ? "Tag" : "Tage"} fällig
          </Pill>
        ) : (
          <Pill tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Pill>
        ),
      sortValue: (i) => (isUnsent(i) ? `0${String(999 - ages.get(i.id)!).padStart(3, "0")}` : i.status),
    },
    { key: "due", header: "Fällig", render: (i) => formatDate(i.dueOn), sortValue: (i) => i.dueOn ?? "" },
    { key: "sent", header: "Versendet", render: (i) => formatDate(i.sentOn), sortValue: (i) => i.sentOn ?? "" },
    { key: "paid", header: "Bezahlt", render: (i) => formatDate(i.paidOn), sortValue: (i) => i.paidOn ?? "" },
    {
      key: "action",
      header: <span className="sr-only">Aktion</span>,
      align: "right",
      render: (i) =>
        i.status === "geplant" || i.status === "faellig" ? (
          <Button size="sm" variant={isUnsent(i) ? "primary" : "outline"} icon={<Send size={13} />} onClick={() => void markSent(i)} aria-label={`${i.label} als versendet markieren`} title="Als versendet markieren">
            Versendet
          </Button>
        ) : null,
    },
  ];

  const selectedIndex = age ? AGE_BUCKETS.findIndex((b) => b.key === age) : null;

  return (
    <>
      {head}
      <div className="stack">
        <div className="grid-kpi">
          <KpiCard
            icon={<MailWarning size={16} />}
            tone="danger"
            label="Nicht versendet"
            value={formatMoney(k.unsentCents)}
            valueTone={k.unsentCount ? "danger" : undefined}
            foot={`${k.unsentCount} ${k.unsentCount === 1 ? "fällige Rechnung" : "fällige Rechnungen"}`}
            info="Fällig und noch nicht versendet. Geplante Rechnungen, deren Auslöser noch nicht erreicht ist, zählen nicht mit."
          />
          <KpiCard icon={<Hourglass size={16} />} tone="info" label="Versendet und offen" value={formatMoney(k.sentOpenCents)} foot={`${k.sentOpenCount} Rechnungen warten auf Zahlung`} />
          <KpiCard icon={<BadgeCheck size={16} />} tone="ok" label="Bezahlt (30 Tage)" value={formatMoney(k.paid30Cents)} foot={`${k.paid30Count} Zahlungen in den letzten 30 Tagen`} />
          <KpiCard
            icon={<Timer size={16} />}
            label="Fälligkeit bis Versand"
            value={k.avgDelayDays == null ? "–" : `${k.avgDelayDays.toLocaleString("de-DE")} Tage`}
            foot={`Durchschnitt, ${k.delayCount} Rechnungen in 12 Monaten`}
            info="Durchschnittliche Tage von der Fälligkeit bis zum Versand. Vor der Fälligkeit versendete Rechnungen zählen als 0."
          />
        </div>

        <div className="grid-21">
          <InvoiceVolumeCard invoices={invoices} today={today} />
          <Card>
            <CardHead title="Nicht versendet nach Alter" sub="Tage seit Fälligkeit. Balken anklicken filtert die Tabelle." />
            <CardBody>
              {k.unsentCount ? (
                <BarChart
                  caption="Nicht versendete Rechnungen nach Alter, Summe in Euro"
                  series={[{ name: "Summe" }]}
                  height={250}
                  showValues
                  format={(v) => formatMoney(Math.round(v * 100))}
                  selected={selectedIndex}
                  onSelect={selectAge}
                  data={buckets.map((b) => ({ label: b.label, title: `${b.label} · ${b.count} ${b.count === 1 ? "Rechnung" : "Rechnungen"}`, values: [b.euros] }))}
                />
              ) : (
                <EmptyState icon={<BadgeCheck size={18} />} title="Alles versendet" text="Keine fällige Rechnung wartet auf den Versand." />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="tabs-row">
          <Tabs<Tab>
            label="Rechnungen filtern"
            value={tab}
            onChange={(t) => {
              setTab(t);
              if (t !== "unsent") setAge(null);
            }}
            items={[
              { key: "alle", label: "Alle", count: invoices.length },
              { key: "unsent", label: "Nicht versendet", count: k.unsentCount },
              { key: "versendet", label: "Versendet", count: invoices.filter((i) => i.status === "versendet").length },
              { key: "bezahlt", label: "Bezahlt", count: invoices.filter((i) => i.status === "bezahlt").length },
            ]}
          />
          {age && (
            <span className="filter-chip">
              Alter: {AGE_BUCKETS.find((b) => b.key === age)!.label}
              <button type="button" aria-label="Altersfilter entfernen" onClick={() => setAge(null)}>
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        <Card>
          {list.length ? (
            <DataTable label="Rechnungen" rows={list} columns={columns} rowKey={(i) => i.id} stickyFirst compact pageSize={25} />
          ) : (
            <EmptyState icon={<Receipt size={18} />} title="Keine Rechnungen in dieser Ansicht" action={age ? <Button size="sm" onClick={() => setAge(null)}>Altersfilter entfernen</Button> : undefined} />
          )}
        </Card>
      </div>
    </>
  );
}
