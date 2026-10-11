import type { AuthApi, AuthUser } from "../auth";
import type { AppRole } from "../session";
import { getSupabase } from "./client";

async function withProfile(id: string, email: string): Promise<AuthUser> {
  // Eigene Zeile aus user_roles (RLS: jeder liest nur die eigene, Admins alle → deshalb auf die eigene ID filtern)
  const { data, error } = await getSupabase().from("user_roles").select("role, full_name").eq("user_id", id).maybeSingle();
  if (error) throw new Error(`Profil konnte nicht geladen werden: ${error.message}`);
  if (!data) return { id, email, profile: null };
  const name = String(data.full_name ?? "").trim() || email.split("@")[0];
  return { id, email, profile: { name, role: data.role as AppRole } };
}

export function createSupabaseAuth(): AuthApi {
  return {
    async current() {
      const { data, error } = await getSupabase().auth.getSession();
      if (error) throw error;
      const u = data.session?.user;
      return u ? withProfile(u.id, u.email ?? "") : null;
    },
    async signIn(email, password) {
      const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      return withProfile(data.user.id, data.user.email ?? email);
    },
    async signOut() {
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;
    },
    onChange(cb) {
      const { data } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") cb(false);
        if (event === "SIGNED_IN") cb(true);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
