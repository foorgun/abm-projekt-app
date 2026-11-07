// ABM-Nr.: vier Ziffern (Nummernkreis der Hausbaufirma), Bindestrich, laufende Nummer ohne führende Nullen,
// variable Länge, z. B. 8161-1588, 8185-633, 8260-321. Der Nummernkreis steht bei der Hausbaufirma (Company.numberPrefix).
// Reine Funktionen (getestet); Formular "Neues Projekt", Projektseite und Einstellungen nutzen dieselben Regeln.

import type { Company, Project } from "./types";

/** Gültiges Format. Die Datenbank erzwingt die Eindeutigkeit nur für Nummern in diesem Format (Migration 0017). */
export const ABM_RE = /^\d{4}-\d+$/;
export const PREFIX_RE = /^\d{4}$/;

export function parseAbm(s: string | null | undefined): { prefix: string; num: number } | null {
  const t = s?.trim() ?? "";
  if (!ABM_RE.test(t)) return null;
  const [prefix, num] = t.split("-");
  return { prefix, num: Number(num) };
}

/** Sortierschlüssel als Zahl: erst Nummernkreis, dann Nummer (633 vor 1588). Ungültig oder leer: null (ans Ende). */
export function abmSortKey(s: string | null | undefined): number | null {
  const p = parseAbm(s);
  // Nummernkreis × 10^11 + Nummer bleibt unter Number.MAX_SAFE_INTEGER (9999 × 10^11 ≈ 10^15)
  return p && p.num < 1e11 ? Number(p.prefix) * 1e11 + p.num : null;
}

/** Nächste Nummer eines Nummernkreises: höchste vorhandene Nummer + 1, als Zahl verglichen. Ohne Nummernkreis: "". */
export function suggestAbmNr(prefix: string | null | undefined, projects: Pick<Project, "abmNr">[]): string {
  if (!prefix) return "";
  let max = 0;
  for (const p of projects) {
    const a = parseAbm(p.abmNr);
    if (a && a.prefix === prefix && a.num > max) max = a.num;
  }
  return `${prefix}-${max + 1}`;
}

// ---------------------------------------------------------------------------
// Anfrage-Nummer: "A-" + Kürzel der Hausbaufirma + laufende Nummer ohne führende Nullen, z. B. A-SH-12 (Migration 0027)
// ---------------------------------------------------------------------------

/** Gültiges Format. Die Datenbank erzwingt die Eindeutigkeit je Kürzel (Nummer als Zahl, Migration 0027). */
export const ANFRAGE_RE = /^A-[A-Z]{1,4}-\d+$/;
export const KUERZEL_RE = /^[A-Z]{1,4}$/;

export function parseAnfrageNr(s: string | null | undefined): { kuerzel: string; num: number } | null {
  const t = s?.trim() ?? "";
  if (!ANFRAGE_RE.test(t)) return null;
  const [, kuerzel, num] = t.split("-");
  return { kuerzel, num: Number(num) };
}

/** Nächste Anfrage-Nummer zum Kürzel: höchste vorhandene Nummer + 1 (auch über angenommene und abgesagte). Ohne Kürzel: "". */
export function suggestAnfrageNr(kuerzel: string | null | undefined, projects: Pick<Project, "abmNr">[]): string {
  if (!kuerzel) return "";
  let max = 0;
  for (const p of projects) {
    const a = parseAnfrageNr(p.abmNr);
    if (a && a.kuerzel === kuerzel && a.num > max) max = a.num;
  }
  return `A-${kuerzel}-${max + 1}`;
}

/** Nächste Nummer für ein Projekt (ABM-Nr. aus dem Nummernkreis) bzw. eine Anfrage (A-<Kürzel>-<Nummer>). */
export function suggestNummer(company: Pick<Company, "numberPrefix" | "kuerzel"> | null | undefined, projects: Pick<Project, "abmNr">[], anfrage: boolean): string {
  return anfrage ? suggestAnfrageNr(company?.kuerzel, projects) : suggestAbmNr(company?.numberPrefix, projects);
}

/** Kürzel für die Einstellungen prüfen: ein bis vier Buchstaben, wird groß geschrieben, eindeutig. Leer = keins. */
export function cleanKuerzel(raw: string, companyId: string | null, companies: Company[]): { ok: true; kuerzel: string | null } | { ok: false; reason: string } {
  const t = raw.trim().toUpperCase();
  if (!t) return { ok: true, kuerzel: null };
  if (!KUERZEL_RE.test(t)) return { ok: false, reason: "Ein bis vier Buchstaben ohne Umlaute, z. B. SH." };
  const other = companies.find((c) => c.kuerzel === t && c.id !== companyId);
  if (other) return { ok: false, reason: `${t} ist schon ${other.name} zugeordnet.` };
  return { ok: true, kuerzel: t };
}

/** Hausbaufirma zum Nummernkreis einer ABM-Nr. bzw. zum Kürzel einer Anfrage-Nummer, oder null. */
export function companyForAbm(abmNr: string | null | undefined, companies: Company[]): Company | null {
  const a = parseAbm(abmNr);
  if (a) return companies.find((c) => c.numberPrefix === a.prefix) ?? null;
  const r = parseAnfrageNr(abmNr);
  return r ? (companies.find((c) => c.kuerzel === r.kuerzel) ?? null) : null;
}

export interface AbmHint {
  /** "warn": Hinweis, speichern geht trotzdem. */
  tone: "warn" | "info";
  text: string;
  /** Vorschlag: diese Hausbaufirma passt zum Nummernkreis */
  company?: Company;
}

/**
 * Hinweise zu ABM-Nr. und Hausbaufirma (keine Fehler; das Format prüft validateProjectFields):
 * unbekannter Nummernkreis, Nummer passt nicht zur gewählten Firma, oder Firma fehlt und lässt sich ableiten.
 */
export function abmHints(abmNr: string | null | undefined, companyId: string | null | undefined, companies: Company[]): AbmHint[] {
  const a = parseAbm(abmNr);
  if (!a) return [];
  const match = companies.find((c) => c.numberPrefix === a.prefix) ?? null;
  const chosen = companyId ? (companies.find((c) => c.id === companyId) ?? null) : null;
  if (!match) {
    return [{ tone: "warn", text: `Nummernkreis ${a.prefix} ist keiner Hausbaufirma zugeordnet. Admins tragen ihn unter Einstellungen ein.` }];
  }
  if (!chosen) return [{ tone: "info", text: `Nummernkreis ${a.prefix} gehört zu ${match.name}.`, company: match }];
  if (chosen.id !== match.id) {
    const own = chosen.numberPrefix ? ` (Nummernkreis ${chosen.numberPrefix})` : "";
    return [{ tone: "warn", text: `ABM-Nr. und Hausbaufirma passen nicht zusammen: ${a.prefix} gehört zu ${match.name}, gewählt ist ${chosen.name}${own}.`, company: match }];
  }
  return [];
}

/** Nummernkreis für die Einstellungen prüfen. Liefert den bereinigten Wert (leer = keiner). */
export function cleanPrefix(raw: string, companyId: string | null, companies: Company[]): { ok: true; prefix: string | null } | { ok: false; reason: string } {
  const t = raw.trim();
  if (!t) return { ok: true, prefix: null };
  if (!PREFIX_RE.test(t)) return { ok: false, reason: "Genau vier Ziffern, z. B. 8161." };
  const other = companies.find((c) => c.numberPrefix === t && c.id !== companyId);
  if (other) return { ok: false, reason: `${t} ist schon ${other.name} zugeordnet.` };
  return { ok: true, prefix: t };
}
