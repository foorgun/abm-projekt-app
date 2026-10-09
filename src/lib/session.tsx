import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AppRole = "admin" | "mitarbeiter" | "freiberufler";

export interface SessionUser {
  name: string;
  role: AppRole;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  mitarbeiter: "Mitarbeiter",
  freiberufler: "Freiberufler",
};

interface SessionValue {
  user: SessionUser;
  /** Nur im Demo-Modus: Rolle wechseln, um die Sichten zu zeigen. Echter Schutz liegt in der Datenbank (RLS). */
  setRole: (role: AppRole) => void;
  demo: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Demo-Benutzer, Standardrolle Admin. Im Supabase-Modus (Schritt 8) kommt der Benutzer aus der Anmeldung. */
export const DEMO_USER: SessionUser = { name: "Mehmet Cetin", role: "admin" };

/** Vorname für Begrüßungen. */
export function firstName(user: SessionUser): string {
  return user.name.trim().split(/\s+/)[0] ?? user.name;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(DEMO_USER);
  const value = useMemo<SessionValue>(
    () => ({ user, demo: true, setRole: (role) => setUser((u) => ({ ...u, role })) }),
    [user],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession außerhalb von SessionProvider");
  return v;
}
