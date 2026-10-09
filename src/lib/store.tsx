// Datenzustand der App. Lädt über das Repo-Interface und stellt abgeleitete Werte bereit.
// Änderungen gehen immer über das Repo; danach wird neu geladen (im Demo-Modus sofort, später gezielt).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computeAlerts, type Alert } from "./alerts";
import { todayIso } from "./format";
import type { Repo } from "./repo";
import { useSession } from "./session";
import { setStepDefinitions } from "./steps";
import type { Dataset } from "./types";

interface DataValue {
  repo: Repo;
  data: Dataset | null;
  loading: boolean;
  error: string | null;
  today: string;
  alerts: Alert[];
  /** Offene Aufgaben, die heute fällig oder überfällig sind. */
  dueTaskCount: number;
  /** Offene Prüfungen des Agenten (Anhänge mit Status "pruefen"). */
  reviewCount: number;
  reload: () => Promise<void>;
  /** Führt eine Änderung über das Repo aus und lädt danach neu. Fehler werden zurückgegeben, nicht geworfen. */
  mutate: <T>(fn: (repo: Repo) => Promise<T>) => Promise<{ ok: true; value: T } | { ok: false; error: string }>;
}

const DataContext = createContext<DataValue | null>(null);

export function DataProvider({ repo, children }: { repo: Repo; children: ReactNode }) {
  const { user } = useSession();
  const [data, setData] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    try {
      const d = await repo.load(user);
      if (mine !== seq.current) return; // veraltete Antwort (z. B. nach Rollenwechsel)
      setStepDefinitions(d.stepDefinitions);
      setData(d);
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [repo, user]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const mutate = useCallback<DataValue["mutate"]>(
    async (fn) => {
      try {
        const value = await fn(repo);
        await reload();
        return { ok: true, value };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [repo, reload],
  );

  const value = useMemo<DataValue>(() => {
    const alerts = data ? computeAlerts(data, today) : [];
    const dueTaskCount = data ? data.tasks.filter((t) => t.status === "offen" && t.dueOn && t.dueOn <= today).length : 0;
    const reviewCount = data ? data.inboxAttachments.filter((a) => a.status === "pruefen").length : 0;
    return { repo, data, loading, error, today, alerts, dueTaskCount, reviewCount, reload, mutate };
  }, [repo, data, loading, error, today, reload, mutate]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const v = useContext(DataContext);
  if (!v) throw new Error("useData außerhalb von DataProvider");
  return v;
}
