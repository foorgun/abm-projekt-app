import type { AuthApi } from "./auth";
import { createDemoRepo } from "./demoRepo";
import type { Repo } from "./repo";

export interface Backend {
  repo: Repo;
  /** null im Demo-Modus: keine Anmeldung, Rolle per Umschalter. */
  auth: AuthApi | null;
}

/**
 * Ohne VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY läuft die App im Demo-Modus.
 * Der Supabase-Teil wird nachgeladen und steht bewusst hinter dieser festen Bedingung: Ein Build ohne die beiden Werte
 * (öffentliche Demo) enthält dann weder den Supabase-Client noch irgendeine Adresse (siehe docs/demo-veroeffentlichen.md).
 */
export function createBackend(): Backend | Promise<Backend> {
  if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return import("./supabase/backend").then((m) => m.createSupabaseBackend());
  }
  return { repo: createDemoRepo(), auth: null };
}
