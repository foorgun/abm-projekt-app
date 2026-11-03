// Regeln für ein neues Passwort. Dieselbe Mindestlänge steht in den Auth-Einstellungen von Supabase (docs/umgebungen.md).
export const MIN_PASSWORD_LENGTH = 12;

/** Liefert die Fehlermeldung oder null, wenn die Eingaben in Ordnung sind. */
export function validateNewPassword(current: string, next: string, repeat: string): string | null {
  if (!current) return "Bitte das aktuelle Passwort eintragen.";
  if (next.length < MIN_PASSWORD_LENGTH) return `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (next !== repeat) return "Die beiden neuen Passwörter stimmen nicht überein.";
  if (next === current) return "Das neue Passwort muss sich vom bisherigen unterscheiden.";
  return null;
}
