import { createDemoRepo } from "./demoRepo";
import type { Repo } from "./repo";
import { createSupabaseRepo } from "./supabaseRepo";

/** Ohne VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY läuft die App im Demo-Modus. */
export function createRepo(): Repo {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? createSupabaseRepo() : createDemoRepo();
}
