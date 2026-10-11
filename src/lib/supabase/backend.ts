import type { Backend } from "../createRepo";
import { createSupabaseRepo } from "../supabaseRepo";
import { createSupabaseAuth } from "./auth";

/** Echtbetrieb: Daten und Anmeldung über Supabase. Wird nur geladen, wenn VITE_SUPABASE_* gesetzt ist. */
export function createSupabaseBackend(): Backend {
  return { repo: createSupabaseRepo(), auth: createSupabaseAuth() };
}
