// Gemeinsames für die Skripte gegen das echte Supabase-Projekt (Konten, Seed, Sicherung, Prüfungen).
// Jedes Skript verlangt ein ausdrückliches Ziel (--ziel development|production), siehe docs/umgebungen.md.
// Schlüssel und Konten stehen nur in lokalen, nicht eingecheckten Dateien (scripts/lib/ziele.ts):
//   .env.ziel.<ziel>            Projekt-URL, Publishable und Secret key, Zugangs-Token, Anthropic-Schlüssel
//   konten.<ziel>.local.json    Konten (siehe konten.beispiel.json)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { setSupabaseConfig } from "../../src/lib/supabase/client";
import { BESTAETIGUNG_PRODUCTION, parseZiel, pruefeWerte, ZIELE, type Feld, type Ziel } from "./ziele";

export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
}

let aktiv: { ziel: Ziel; env: Record<string, string> } | null = null;

/**
 * Muss jedes Skript zuerst aufrufen: liest --ziel, prüft die verlangten Werte und fragt bei production nach.
 * Ohne eingetippte Bestätigung (auch ohne Eingabe) bricht es ab, einen Schalter zum Überspringen gibt es nicht.
 */
export async function waehleZiel(aktion: string, felder: Feld[] = ["oeffentlich"], opt: { nurDevelopment?: boolean } = {}): Promise<Ziel> {
  const ziel = parseZiel(process.argv);
  if (!ziel) die(`Ziel fehlt. Aufruf mit -- --ziel development oder -- --ziel production (${aktion}).`);
  if (opt.nurDevelopment && ziel === "production") die(`${aktion} ist für production gesperrt, es läuft nur gegen development.`);
  const { ref, datei } = ZIELE[ziel];
  if (felder.length && !existsSync(datei)) die(`${datei} fehlt. Siehe docs/umgebungen.md.`);
  const env = readEnvFile(datei);
  const probleme = pruefeWerte(ziel, env, felder);
  if (probleme.length) die(probleme.join("\n"));
  console.log(`Ziel: ${ziel} (${ref})`);
  if (ziel === "production") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const antwort = await new Promise<string>((resolve) => {
      rl.once("close", () => resolve("")); // Eingabe zu Ende: gilt als nicht bestätigt
      void rl.question(`ACHTUNG, PRODUCTION: ${aktion}. Zum Fortfahren ${BESTAETIGUNG_PRODUCTION} eintippen: `).then(resolve);
    });
    rl.close();
    if (antwort.trim() !== BESTAETIGUNG_PRODUCTION) die("Abgebrochen, nichts ausgeführt.");
  }
  aktiv = { ziel, env };
  // vite-node hat beim Start .env geladen. Client der App und aufgerufene Prozesse (vite build) sollen dieses Ziel nutzen.
  if (felder.includes("oeffentlich")) {
    setSupabaseConfig({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY });
    process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
  }
  return ziel;
}

export function zielWerte(): { ziel: Ziel; ref: string; env: Record<string, string> } {
  if (!aktiv) die("Programmfehler: waehleZiel() wurde nicht aufgerufen.");
  return { ziel: aktiv.ziel, ref: ZIELE[aktiv.ziel].ref, env: aktiv.env };
}

export function publicConfig(): { url: string; key: string } {
  const { env } = zielWerte();
  return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY };
}

/** Client mit dem Publishable key, ohne gespeicherte Sitzung: verhält sich wie ein Browser ohne Anmeldung. */
export function publicClient(): SupabaseClient {
  const { url, key } = publicConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Client mit dem Secret key (umgeht RLS). Der Schlüssel wird nie ausgegeben und nie geschrieben. */
export function adminClient(): SupabaseClient {
  const { url } = publicConfig();
  const { ziel, env } = zielWerte();
  const secret = env.SUPABASE_SECRET_KEY;
  const probleme = pruefeWerte(ziel, env, ["secret"]);
  if (probleme.length) die(`${probleme.join("\n")}\nDen Schlüssel findest du im Dashboard unter Project Settings → API Keys → Secret keys.`);
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
export const kontenDatei = (): string => ZIELE[zielWerte().ziel].konten;

export function readKonten(): Konto[] {
  const KONTEN_DATEI = kontenDatei();
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
  writeFileSync(kontenDatei(), JSON.stringify({ konten }, null, 2) + "\n", { mode: 0o600 });
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
