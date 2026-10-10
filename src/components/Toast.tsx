import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ToastMsg {
  id: number;
  title: string;
  description?: string;
  tone: "ok" | "danger";
}

type ShowToast = (title: string, tone?: ToastMsg["tone"], description?: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

/**
 * Kurze Rückmeldung nach Aktionen (Design v2): Karte mit Icon, fettem Titel und gedämpfter Beschreibung.
 * Wird per aria-live auch vorgelesen.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const show = useCallback<ShowToast>((title, tone = "ok", description) => setMsg({ id: Date.now(), title, description, tone }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.tone === "danger" ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">
        {msg && (
          <div className="toast" data-tone={msg.tone} key={msg.id}>
            {msg.tone === "danger" ? <AlertTriangle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
            <div className="toast-text">
              <span className="toast-title">{msg.title}</span>
              {msg.description && <span className="toast-desc">{msg.description}</span>}
            </div>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
