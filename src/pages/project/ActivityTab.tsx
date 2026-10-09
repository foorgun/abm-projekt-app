import { Bot, CheckCircle2, FileText, ListTodo, Receipt, Workflow } from "lucide-react";
import { Card, EmptyState } from "../../components/ui";
import { formatRelative } from "../../lib/format";
import type { Activity, ActivityKind } from "../../lib/types";

const ICON: Record<ActivityKind, typeof FileText> = {
  schritt: CheckCircle2,
  datei: FileText,
  agent: Bot,
  rechnung: Receipt,
  aufgabe: ListTodo,
  projekt: Workflow,
};

/** Zeitleiste der Aktivitäten eines Projekts. */
export function ActivityTab({ activities }: { activities: Activity[] }) {
  if (!activities.length) {
    return (
      <Card>
        <EmptyState title="Noch keine Aktivitäten" text="Schritte, Dateien und Rechnungen erscheinen hier." />
      </Card>
    );
  }
  return (
    <Card>
      <ol className="timeline">
        {activities.map((a) => {
          const Icon = ICON[a.kind];
          return (
            <li key={a.id} className="timeline-item" data-kind={a.kind}>
              <span className="timeline-icon" aria-hidden>
                <Icon size={14} />
              </span>
              <div className="timeline-main">
                <span className="timeline-text">{a.text}</span>
                <span className="timeline-meta">
                  {a.actor} · <time dateTime={a.at}>{formatRelative(a.at)}</time>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
