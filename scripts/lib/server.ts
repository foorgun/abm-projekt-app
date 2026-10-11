// Gemeinsames für die Skripte gegen das echte Supabase-Projekt (Konten, Seed, Sicherung, Prüfungen).
// Schlüssel und Konten stehen nur in lokalen, nicht eingecheckten Dateien:
//   .env               VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (Publishable key)
//   .env.server        SUPABASE_SECRET_KEY=sb_secret_…   (umgeht RLS, nur für diese Skripte)
//   konten.local.json  Testkonten (siehe konten.beispiel.json)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
}

export function publicConfig(): { url: string; key: string } {
  const env = { ...readEnvFile(".env"), ...readEnvFile(".env.local") };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) die("VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen in .env");
  return { url, key };
}

/** Client mit dem Publishable key, ohne gespeicherte Sitzung: verhält sich wie ein Browser ohne Anmeldung. */
export function publicClient(): SupabaseClient {
  const { url, key } = publicConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Client mit dem Secret key (umgeht RLS). Der Schlüssel wird nie ausgegeben und nie geschrieben. */
export function adminClient(): SupabaseClient {
  const { url } = publicConfig();
  const secret = readEnvFile(".env.server").SUPABASE_SECRET_KEY;
  if (!secret) {
    die(
      "Der Secret key fehlt. Lege die Datei .env.server an (sie ist in .gitignore) mit der Zeile\n" +
        "  SUPABASE_SECRET_KEY=sb_secret_…\n" +
        "Den Schlüssel findest du im Dashboard unter Project Settings → API Keys → Secret keys.",
    );
  }
  if (secret.startsWith("sb_publishable_")) die("In .env.server steht der Publishable key. Gebraucht wird der Secret key (sb_secret_…).");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export type Rolle = "admin" | "mitarbeiter" | "freiberufler";
export interface Konto {
  email: string;
  name: string;
  rolle: Rolle;
  /** Vom Skript erzeugt (neue Konten) oder von Hand eingetragen. Ohne Passwort wird das Konto bei check:roles übersprungen. */
  passwort?: string;
}
export const KONTEN_DATEI = "konten.local.json";

export function readKonten(): Konto[] {
  if (!existsSync(KONTEN_DATEI)) {
    die(`${KONTEN_DATEI} fehlt. Kopiere konten.beispiel.json nach ${KONTEN_DATEI} und trage die E-Mail-Adressen ein (die Datei wird nicht eingecheckt).`);
  }
  const raw = JSON.parse(readFileSync(KONTEN_DATEI, "utf8")) as { konten?: Konto[] };
  const konten = raw.konten ?? [];
  for (const k of konten) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email ?? "")) die(`${KONTEN_DATEI}: ungültige E-Mail "${k.email}"`);
    if (!["admin", "mitarbeiter", "freiberufler"].includes(k.rolle)) die(`${KONTEN_DATEI}: unbekannte Rolle "${k.rolle}" bei ${k.email}`);
    if (!k.name?.trim()) die(`${KONTEN_DATEI}: Name fehlt bei ${k.email}`);
    if (/@example\.|beispiel/i.test(k.email)) die(`${KONTEN_DATEI}: "${k.email}" ist noch die Beispieladresse. Bitte echte Adressen eintragen.`);
  }
  return konten;
}

export function writeKonten(konten: Konto[]): void {
  writeFileSync(KONTEN_DATEI, JSON.stringify({ konten }, null, 2) + "\n");
}

export function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Einfache Texttabelle für die Ausgabe im Terminal. */
export function table(head: string[], rows: (string | number)[][]): string {
  const all = [head, ...rows.map((r) => r.map(String))];
  const w = head.map((_, i) => Math.max(...all.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) => r.map((c, i) => (c ?? "").padEnd(w[i])).join("  ").trimEnd();
  return [line(head), w.map((n) => "-".repeat(n)).join("  "), ...all.slice(1).map(line)].join("\n");
}

/** Alle Zeilen einer Tabelle, seitenweise (die API liefert höchstens 1000 je Anfrage). */
export async function fetchAll(sb: SupabaseClient, tableName: string, order: string[], cols = "*"): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(tableName).select(cols);
    for (const o of order) q = q.order(o);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${tableName}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if ((data ?? []).length < 1000) return out;
  }
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
