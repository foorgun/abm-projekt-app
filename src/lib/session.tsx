import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authErrorMessage, type AuthApi, type AuthUser } from "./auth";

export type AppRole = "admin" | "mitarbeiter" | "freiberufler";

export interface SessionUser {
  /** Benutzer-ID der Anmeldung (nur im Echtbetrieb). */
  id?: string;
  name: string;
  role: AppRole;
  email?: string;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  mitarbeiter: "Mitarbeiter",
  freiberufler: "Freiberufler",
};

/** Zustand der Anmeldung im Echtbetrieb. Im Demo-Modus immer "bereit". */
export type SessionStatus = "laden" | "abgemeldet" | "ohne-rolle" | "bereit" | "fehler";

interface SessionValue {
  user: SessionUser;
  status: SessionStatus;
  /** Fehlermeldung, wenn die Sitzung nicht geladen werden konnte. */
  error: string | null;
  /** Nur im Demo-Modus: Rolle wechseln, um die Sichten zu zeigen. Echter Schutz liegt in der Datenbank (RLS). */
  setRole: (role: AppRole) => void;
  demo: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Demo-Benutzer, Standardrolle Admin. Im Echtbetrieb kommt der Benutzer aus der Anmeldung. */
export const DEMO_USER: SessionUser = { name: "Mehmet Cetin", role: "admin" };
const NOBODY: SessionUser = { name: "", role: "freiberufler" };

/** Vorname für Begrüßungen. */
export function firstName(user: SessionUser): string {
  return user.name.trim().split(/\s+/)[0] ?? user.name;
}

function toSessionUser(u: AuthUser): SessionUser {
  return { id: u.id, email: u.email, name: u.profile?.name ?? u.email, role: u.profile?.role ?? "freiberufler" };
}

export function SessionProvider({ auth, children }: { auth: AuthApi | null; children: ReactNode }) {
  const demo = !auth;
  const [user, setUser] = useState<SessionUser>(demo ? DEMO_USER : NOBODY);
  const [status, setStatus] = useState<SessionStatus>(demo ? "bereit" : "laden");
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((u: AuthUser | null) => {
    setError(null);
    if (!u) {
      setUser(NOBODY);
      setStatus("abgemeldet");
    } else {
      // Gleicher Benutzer, gleiche Rolle: Objekt behalten, damit die Daten nicht unnötig neu laden
      setUser((old) => {
        const next = toSessionUser(u);
        return old.id === next.id && old.role === next.role && old.name === next.name ? old : next;
      });
      setStatus(u.profile ? "bereit" : "ohne-rolle");
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!auth) return;
    try {
      apply(await auth.current());
    } catch (e) {
      setError(authErrorMessage(e));
      setStatus("fehler");
    }
  }, [auth, apply]);

  useEffect(() => {
    if (!auth) return;
    void refresh();
    // Abmeldung in einem anderen Tab oder abgelaufene Sitzung
    return auth.onChange((signedIn) => {
      if (!signedIn) apply(null);
    });
  }, [auth, refresh, apply]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      status,
      error,
      demo,
      setRole: (role) => {
        if (demo) setUser((u) => ({ ...u, role }));
      },
      signIn: async (email, password) => {
        if (!auth) return { ok: true };
        try {
          apply(await auth.signIn(email, password));
          return { ok: true };
        } catch (e) {
          return { ok: false, error: authErrorMessage(e) };
        }
      },
      signOut: async () => {
        if (!auth) return;
        try {
          await auth.signOut();
        } finally {
          apply(null);
        }
      },
      retry: () => {
        setStatus("laden");
        void refresh();
      },
    }),
    [user, status, error, demo, auth, apply, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession außerhalb von SessionProvider");
  return v;
}
