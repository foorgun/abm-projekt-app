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

/** Hausbaufirma zum Nummernkreis einer ABM-Nr., oder null (unbekannt oder ungültig). */
export function companyForAbm(abmNr: string | null | undefined, companies: Company[]): Company | null {
  const a = parseAbm(abmNr);
  return a ? (companies.find((c) => c.numberPrefix === a.prefix) ?? null) : null;
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
