import { useId, type ReactNode } from "react";
import { Info } from "lucide-react";

/** Tooltip bei Hover und Tastaturfokus. Der Inhalt ist zusätzlich per aria-describedby erreichbar. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <span className="tip" aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="tip-bubble">
        {content}
      </span>
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip content={text}>
      <button type="button" className="tip-trigger" aria-label={`Info: ${text}`}>
        <Info size={14} aria-hidden />
      </button>
    </Tooltip>
  );
}
