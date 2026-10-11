// Anmeldung: Schnittstelle zwischen Oberfläche und Anmeldedienst (wie das Repo-Interface für Daten).
// Im Demo-Modus gibt es keine Anmeldung; im Supabase-Modus liefert supabaseAuth die Umsetzung.

import type { AppRole } from "./session";

export interface AuthUser {
  id: string;
  email: string;
  /** Anzeigename aus der Tabelle user_roles; null, solange dem Konto keine Rolle zugewiesen ist. */
  profile: { name: string; role: AppRole } | null;
}

export interface AuthApi {
  /** Aktuelle Sitzung (aus dem Browser-Speicher) samt Profil, oder null. */
  current(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** Meldet An- und Abmeldung (auch aus einem anderen Tab). Gibt eine Funktion zum Abbestellen zurück. */
  onChange(cb: (signedIn: boolean) => void): () => void;
}

/** Verständliche Meldungen statt der englischen Texte des Dienstes. */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(msg)) return "E-Mail oder Passwort stimmt nicht.";
  if (/email not confirmed/i.test(msg)) return "Dieses Konto ist noch nicht bestätigt. Bitte beim Admin melden.";
  if (/rate limit|too many/i.test(msg)) return "Zu viele Versuche. Bitte kurz warten und erneut probieren.";
  if (/failed to fetch|network|load failed/i.test(msg)) return "Keine Verbindung zum Server. Bitte Internetverbindung prüfen.";
  return msg;
}
