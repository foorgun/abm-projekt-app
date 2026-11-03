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
    async changePassword(current, next) {
      const auth = getSupabase().auth;
      const { data, error } = await auth.getSession();
      if (error) throw error;
      const email = data.session?.user.email;
      if (!email) throw new Error("Nicht angemeldet. Bitte neu anmelden.");
      // Eine offene Sitzung allein reicht nicht: Wer am fremden Rechner sitzt, kennt das aktuelle Passwort nicht
      const check = await auth.signInWithPassword({ email, password: current });
      if (check.error) throw /invalid login credentials/i.test(check.error.message) ? new Error("Das aktuelle Passwort stimmt nicht.") : check.error;
      const update = await auth.updateUser({ password: next });
      if (update.error) throw update.error;
      // Das Passwort ist schon geändert; schlägt nur dies fehl, laufen andere Sitzungen eben bis zu ihrem Ablauf weiter
      await auth.signOut({ scope: "others" }).catch(() => undefined);
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
