// Supabase Management API für das aktive Ziel. Die Ref kommt immer aus dem Ziel, nie aus "supabase link".
import { die, zielWerte } from "./server";

export async function managementApi(pfad: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const { ref, env } = zielWerte();
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${pfad}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "content-type": "application/json" },
  });
  const text = await r.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Antwort ohne JSON: Text bleibt
  }
  if (r.status === 401 || r.status === 403) die(`Das Zugangs-Token hat keinen Zugriff auf ${zielWerte().ziel} (${r.status}). Token prüfen.`);
  return { status: r.status, body };
}
