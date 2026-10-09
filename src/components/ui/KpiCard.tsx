import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { InfoTip } from "./Tooltip";
import { Skeleton } from "./Skeleton";

export interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  info?: string;
  trend?: ReactNode;
  foot?: ReactNode;
  tone?: "accent" | "danger" | "warn" | "info" | "ok";
  /** Wert selbst einfärben (nur für echte Warnwerte, z. B. offene Rechnungssumme). */
  valueTone?: "danger";
  to?: string;
}

export function KpiCard({ icon, label, value, info, trend, foot, tone = "accent", valueTone, to }: KpiCardProps) {
  // Klickbare Kachel: der Link deckt per ::after die ganze Fläche ab, der Info-Button liegt darüber.
  // So steckt kein Button in einem Link (gültiges HTML, sauber per Tastatur bedienbar).
  return (
    <section className={to ? "card kpi kpi-clickable" : "card kpi"}>
      <div className="kpi-head">
        <span className="kpi-icon" data-tone={tone === "accent" ? undefined : tone} aria-hidden>
          {icon}
        </span>
        {to ? (
          <Link to={to} className="kpi-label kpi-link">
            {label}
          </Link>
        ) : (
          <span className="kpi-label">{label}</span>
        )}
        {info && <InfoTip text={info} />}
      </div>
      <div className="kpi-value-row">
        <span className="kpi-value" data-tone={valueTone}>
          {value}
        </span>
        {trend}
      </div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </section>
  );
}

export function KpiSkeleton() {
  return (
    <section className="card kpi" aria-hidden>
      <div className="kpi-head">
        <Skeleton w={32} h={32} round />
        <Skeleton w="50%" h={12} />
      </div>
      <Skeleton w="40%" h={28} />
      <Skeleton w="60%" h={10} />
    </section>
  );
}
