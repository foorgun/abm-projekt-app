// Einziger Ort, an dem der Supabase-Client entsteht. Nur supabaseRepo und supabaseAuth importieren ihn;
// die Oberfläche spricht nie direkt mit Supabase.
// Verwendet wird ausschließlich der Publishable key (öffentlich, durch GRANT + RLS begrenzt), nie der Secret key.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseConfig(): { url: string; key: string } | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  return url && key ? { url, key } : null;
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen");
  if (/secret|service_role/i.test(cfg.key)) throw new Error("Im Frontend darf nur der Publishable key stehen, nie der Secret key.");
  client = createClient(cfg.url, cfg.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // HashRouter: die URL nach "#" gehört der App, nicht der Anmeldung
      detectSessionInUrl: false,
      storageKey: "abm.auth",
    },
  });
  return client;
}
