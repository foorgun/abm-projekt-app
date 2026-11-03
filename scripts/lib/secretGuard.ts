// Regeln der Commit-Sperre (scripts/check-secrets.ts): welche Dateien nie ins Repo dürfen, wonach Inhalte durchsucht werden.
// Treffer nennen nur Datei, Zeile und Art, nie den gefundenen Wert.

/** Lokale Dateien der Umgebungen. Müssen in .gitignore stehen, die Prüfung schlägt sonst fehl. */
export const MUST_BE_IGNORED = [
  ".env",
  ".env.server",
  ".env.ziel.development",
  ".env.ziel.production",
  "konten.local.json",
  "konten.development.local.json",
  "konten.production.local.json",
  "backups/x.json",
  "supabase/.temp/project-ref",
  "supabase/.out/migrationen-gesamt.sql",
];

const FORBIDDEN_PATHS: { pattern: RegExp; what: string }[] = [
  { pattern: /(^|\/)\.env(\.(?!example$)[^/]+)?$/, what: "lokale Umgebungsdatei" },
  { pattern: /(^|\/)\.dev\.vars[^/]*$/, what: "lokale Umgebungsdatei" },
  { pattern: /(^|\/)konten(\.[^/]+)?\.local\.json$/, what: "lokale Kontenliste mit Passwörtern" },
  { pattern: /\.local$/, what: "lokale Datei" },
  { pattern: /(^|\/)backups\//, what: "Sicherung" },
  { pattern: /(^|\/)supabase\/\.(temp|out)\//, what: "erzeugte Supabase-Datei" },
  { pattern: /\.(pem|p12|pfx)$/, what: "Schlüsseldatei" },
];

// Längen so gewählt, dass die Platzhalter aus Doku und Tests (sb_secret_…, kurze erfundene Schlüssel) nicht anschlagen.
const SECRET_PATTERNS: { pattern: RegExp; what: string }[] = [
  { pattern: /sb_secret_[A-Za-z0-9_-]{20,}/, what: "Supabase Secret key" },
  { pattern: /sb_publishable_[A-Za-z0-9_-]{20,}/, what: "Supabase Publishable key" },
  { pattern: /sbp_[A-Za-z0-9]{20,}/, what: "Supabase-Zugangs-Token" },
  { pattern: /sk-ant-[A-Za-z0-9_-]{40,}/, what: "Anthropic-Schlüssel" },
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/, what: "JWT (z. B. alter anon- oder service_role-Schlüssel)" },
  { pattern: /postgres(ql)?:\/\/[^\s:/]+:[^\s@/]+@/, what: "Datenbank-Adresse mit Passwort" },
  { pattern: /BEGIN [A-Z ]*PRIVATE KEY/, what: "privater Schlüssel" },
];

export function forbiddenPath(path: string): string | null {
  return FORBIDDEN_PATHS.find((r) => r.pattern.test(path))?.what ?? null;
}

export function findSecrets(text: string): { line: number; what: string }[] {
  const hits: { line: number; what: string }[] = [];
  text.split("\n").forEach((content, i) => {
    for (const r of SECRET_PATTERNS) if (r.pattern.test(content)) hits.push({ line: i + 1, what: r.what });
  });
  return hits;
}
