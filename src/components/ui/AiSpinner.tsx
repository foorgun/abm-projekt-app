import { Sparkles } from "lucide-react";

/** Ladeanzeige, während die KI ein Dokument liest: drehender Ring um ein Funkel-Symbol. */
export function AiSpinner({ label, hint, size = "lg" }: { label?: string; hint?: string; size?: "lg" | "sm" }) {
  return (
    <span className="ai-spinner" data-size={size} role="status" aria-live="polite">
      <span className="ai-spinner-mark" aria-hidden>
        <span className="ai-spinner-ring" />
        <Sparkles size={size === "lg" ? 26 : 14} className="ai-spinner-icon" />
      </span>
      {label && (
        <span className="ai-spinner-text">
          <span className="ai-spinner-label">{label}</span>
          {hint && <span className="ai-spinner-hint">{hint}</span>}
        </span>
      )}
    </span>
  );
}
