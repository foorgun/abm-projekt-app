// Serverschlüssel der Edge Functions. SUPABASE_SECRET_KEYS ist ein JSON-Wörterbuch der neuen Secret keys, Eintrag "default".
// Der Rückfall auf den alten Namen bleibt, bis development und production umgestellt und geprüft sind; danach entfernen.
export function serviceKey(env: (name: string) => string | undefined): string | undefined {
  try {
    const key = JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "{}")?.default;
    if (typeof key === "string" && key) return key;
  } catch {
    // Unlesbarer Wert: wie nicht gesetzt behandeln. Der Wert selbst kommt nie ins Log.
  }
  return env("SUPABASE_SERVICE_ROLE_KEY");
}
