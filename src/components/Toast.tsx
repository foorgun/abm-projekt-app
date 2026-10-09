import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ToastMsg {
  id: number;
  text: string;
  tone: "ok" | "danger";
}

const ToastContext = createContext<(text: string, tone?: ToastMsg["tone"]) => void>(() => {});

/** Kurze Rückmeldung nach Aktionen. Wird per aria-live auch vorgelesen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const show = useCallback((text: string, tone: ToastMsg["tone"] = "ok") => setMsg({ id: Date.now(), text, tone }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.tone === "danger" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">
        {msg && (
          <div className="toast" data-tone={msg.tone} key={msg.id}>
            {msg.tone === "danger" ? <AlertTriangle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
            {msg.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
