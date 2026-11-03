// Läuft dieser Build gegen production? Hängt an der Projektadresse, nicht an einer eigenen Variable:
// So zeigt ein Build mit den Produktionswerten nie versehentlich Demo-Inhalte. Die Ref ist nicht geheim.
export const PRODUCTION_REF = "ydpqxjkcygpoynwpjwrk";

export function isProduction(env: { VITE_SUPABASE_URL?: string } = import.meta.env as { VITE_SUPABASE_URL?: string }): boolean {
  return Boolean(env.VITE_SUPABASE_URL?.includes(PRODUCTION_REF));
}
