import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { Button } from "./Button";

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <span className="state-icon" aria-hidden>
        {icon ?? <Inbox size={18} />}
      </span>
      <p className="state-title">{title}</p>
      {text && <p className="state-text">{text}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state" data-tone="danger" role="alert">
      <span className="state-icon" aria-hidden>
        <AlertTriangle size={18} />
      </span>
      <p className="state-title">Daten konnten nicht geladen werden</p>
      <p className="state-text">{message ?? "Bitte prüfe die Verbindung und versuche es erneut."}</p>
      {onRetry && (
        <div className="state-action">
          <Button icon={<RotateCw size={14} />} onClick={onRetry}>
            Erneut versuchen
          </Button>
        </div>
      )}
    </div>
  );
}
