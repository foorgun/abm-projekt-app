import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { formatDateTime } from "../lib/format";
import { useData } from "../lib/store";
import type { Activity } from "../lib/types";
import { Button, Skeleton } from "./ui";

/** So viele Einträge zeigt der aufgeklappte Verlauf in der Projektliste; alle stehen im Projekt. */
export const HISTORY_LIMIT = 10;

type State = { status: "laden" } | { status: "fertig"; entries: Activity[] } | { status: "fehler"; message: string };

/**
 * Verlauf eines Projekts für die aufgeklappte Zeile der Projektliste: wer hat wann was gemacht.
 * Lädt erst, wenn die Komponente erscheint (also beim Aufklappen), und nur die letzten Einträge.
 */
export function ProjectHistory({ projectId, id, allHref }: { projectId: string; id: string; allHref: string }) {
  const { repo } = useData();
  const [state, setState] = useState<State>({ status: "laden" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: "laden" });
    repo.projectHistory(projectId, HISTORY_LIMIT).then(
      (entries) => alive && setState({ status: "fertig", entries }),
      (e) => alive && setState({ status: "fehler", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [repo, projectId, retry]);

  return (
    <div className="history" id={id} aria-busy={state.status === "laden"}>
      <p className="history-title">Verlauf</p>
      {state.status === "laden" && (
        <div className="history-loading">
          <span className="sr-only">Verlauf lädt …</span>
          <Skeleton h={14} />
          <Skeleton h={14} />
          <Skeleton h={14} />
        </div>
      )}
      {state.status === "fehler" && (
        <div className="history-error" role="alert">
          <span>Verlauf konnte nicht geladen werden: {state.message}</span>
          <Button size="sm" variant="ghost" icon={<RotateCw size={14} />} onClick={() => setRetry((n) => n + 1)}>
            Erneut versuchen
          </Button>
        </div>
      )}
      {state.status === "fertig" &&
        (state.entries.length ? (
          <ol className="history-list">
            {state.entries.map((a) => (
              <li key={a.id} className="history-item">
                <time className="history-time" dateTime={a.at}>
                  {formatDateTime(a.at)}
                </time>
                <span className="history-actor">{a.actor}</span>
                <span className="history-text">{a.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted history-empty">Noch keine Einträge</p>
        ))}
      <Link className="history-all" to={allHref}>
        Alle anzeigen
      </Link>
    </div>
  );
}
