import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent" | "outline";

export function Pill({ tone = "neutral", dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={dot ? "pill pill-dot" : "pill"} data-tone={tone}>
      {children}
    </span>
  );
}

export function Badge({ tone, children, label, title }: { tone?: "accent" | "danger" | "warn"; children: ReactNode; label?: string; title?: string }) {
  return (
    <span className="badge" data-tone={tone} aria-label={label} title={title}>
      {children}
    </span>
  );
}

/**
 * Trend-Badge. `good` sagt, ob die Richtung gut ist (z. B. mehr Projekte = gut, mehr Überfällige = schlecht).
 */
export function Trend({ value, good, suffix = "" }: { value: number; good: boolean; suffix?: string }) {
  const up = value >= 0;
  const tone = value === 0 ? undefined : good ? "ok" : "danger";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="trend" data-tone={tone}>
      {up ? "+" : "−"}
      {Math.abs(value)}
      {suffix}
      <Icon size={12} aria-hidden />
    </span>
  );
}
