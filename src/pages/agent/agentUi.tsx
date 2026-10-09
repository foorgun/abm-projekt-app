import { Pill, type Tone } from "../../components/ui";
import type { InboxStatus, MailboxStatus } from "../../lib/types";

export const INBOX_STATUS: Record<InboxStatus, { label: string; tone: Tone }> = {
  neu: { label: "Neu", tone: "neutral" },
  abgelegt: { label: "Abgelegt", tone: "ok" },
  pruefen: { label: "Zur Prüfung", tone: "warn" },
  ignoriert: { label: "Ignoriert", tone: "neutral" },
  fehler: { label: "Fehler", tone: "danger" },
};

export const MAILBOX_STATUS: Record<MailboxStatus, { label: string; tone: Tone }> = {
  verbunden: { label: "Verbunden", tone: "ok" },
  pausiert: { label: "Pausiert", tone: "neutral" },
  fehler: { label: "Fehler", tone: "danger" },
};

export const PROVIDER_LABEL = { microsoft365: "Microsoft 365", imap: "IMAP", demo: "Demo" } as const;

export function InboxPill({ status }: { status: InboxStatus }) {
  return <Pill tone={INBOX_STATUS[status].tone}>{INBOX_STATUS[status].label}</Pill>;
}

/** Sicherheit in Prozent; Farbe nach Schwellen, Text immer dabei. */
export function ConfidencePill({ value, auto, suggest }: { value: number | null; auto: number; suggest: number }) {
  if (value == null) return <span className="muted">–</span>;
  const tone: Tone = value >= auto ? "ok" : value >= suggest ? "warn" : "neutral";
  return (
    <Pill tone={tone} dot={false}>
      {Math.round(value * 100)} %
    </Pill>
  );
}
