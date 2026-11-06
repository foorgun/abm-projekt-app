// Bauherren je Projekt (erster bis vierter): Felder, Beschriftungen und Namen an einer Stelle.
// Weitere Bauherren liegen bei den Kontaktdaten des ersten Bauherrn (keine eigene Entität, Migrationen 0010 und 0023).
// Vorname und Nachname sind getrennt gespeichert (Migration 0024); `name`, `name2` … bleiben der zusammengesetzte Name,
// den Planungsprotokoll, Suche und Anzeige nutzen. Er wird beim Speichern aus Vorname und Nachname gebildet.

import type { BauherrContact } from "./types";

export const WEITERE_BAUHERREN = [
  { nr: 2, label: "Bauherr 2", hinzufuegen: "Bauherr 2 hinzufügen", name: "name2", vorname: "vorname2", nachname: "nachname2", phone: "phone2", email: "email2" },
  { nr: 3, label: "Bauherr 3", hinzufuegen: "Bauherr 3 hinzufügen", name: "name3", vorname: "vorname3", nachname: "nachname3", phone: "phone3", email: "email3" },
  { nr: 4, label: "Bauherr 4", hinzufuegen: "Bauherr 4 hinzufügen", name: "name4", vorname: "vorname4", nachname: "nachname4", phone: "phone4", email: "email4" },
] as const;

/** Namensfelder aller Bauherren, der erste vorne. */
export const NAMENS_FELDER = [{ nr: 1, label: "Bauherr 1", name: "name", vorname: "vorname", nachname: "nachname" }, ...WEITERE_BAUHERREN] as const;

export type WeitererBauherrKey = (typeof WEITERE_BAUHERREN)[number]["name" | "vorname" | "nachname" | "phone" | "email"];
export type NamensKey = (typeof NAMENS_FELDER)[number]["name" | "vorname" | "nachname"];
/** Nur die Teile (Vorname, Nachname), nicht der zusammengesetzte Name. */
export type NamensTeilKey = (typeof NAMENS_FELDER)[number]["vorname" | "nachname"];
export const NAMENS_TEILE: ReadonlySet<string> = new Set(NAMENS_FELDER.flatMap((b) => [b.vorname, b.nachname]));

/** Die Felder der weiteren Bauherren, soweit eingetragen (auch aus Formularständen). */
export type WeitereBauherrenWerte = Partial<Record<WeitererBauherrKey, string | null>> | Partial<Pick<BauherrContact, WeitererBauherrKey>>;

/**
 * Wie viele weitere Bauherren das Formular zeigt: so viele wie angefordert, mindestens aber bis zum letzten ausgefüllten.
 * So verschwinden eingetragene Werte nie aus dem Blick, auch nicht beim Fortsetzen eines Entwurfs.
 */
export function weitereSichtbar(werte: WeitereBauherrenWerte | null | undefined, angefordert: number): number {
  let n = Math.min(Math.max(angefordert, 0), WEITERE_BAUHERREN.length);
  WEITERE_BAUHERREN.forEach((b, i) => {
    if (werte?.[b.name] || werte?.[b.vorname] || werte?.[b.nachname] || werte?.[b.phone] || werte?.[b.email]) n = Math.max(n, i + 1);
  });
  return n;
}

const clean = (v: string | null | undefined): string | null => v?.trim().replace(/\s+/g, " ") || null;

/** Vorname und Nachname zu einem Namen ("Anna Hoffmann"); null, wenn beides leer ist. */
export function vollerName(vorname: string | null | undefined, nachname: string | null | undefined): string | null {
  return clean([clean(vorname), clean(nachname)].filter(Boolean).join(" "));
}

/** Anreden und Sammelbezeichnungen vor dem Namen gehören nicht zum Vornamen. */
const ANREDE = /^(?:familie|fam\.?|eheleute|ehepaar|herrn?|frau|hr\.|fr\.)\s+/i;

/**
 * Einen gespeicherten Namen in Vorname und Nachname teilen (Bestand vor Migration 0024 und Namen aus Dokumenten).
 * Ist der Nachname bekannt (beim ersten Bauherrn der Projektname) und steht er im Namen, gilt alles davor als Vorname.
 * Sonst "Nachname, Vorname" oder Teilung am letzten Leerzeichen. Ein Vorschlag fürs Formular, der Mensch prüft ihn.
 */
export function teileName(name: string | null | undefined, nachnameHinweis?: string | null): { vorname: string | null; nachname: string | null } {
  const n = clean(name);
  const hinweis = clean(nachnameHinweis);
  if (!n) return { vorname: null, nachname: hinweis };
  const ohneAnrede = (s: string) => clean(s.replace(ANREDE, "")) ?? null;
  const komma = n.match(/^([^,]+),\s*(.+)$/);
  if (komma) return { vorname: ohneAnrede(komma[2]), nachname: clean(komma[1]) };
  if (hinweis && n.toLowerCase() !== hinweis.toLowerCase() && n.toLowerCase().endsWith(` ${hinweis.toLowerCase()}`)) {
    const davor = n.slice(0, n.length - hinweis.length);
    const vorname = ANREDE.test(`${davor.trim()} `) ? null : ohneAnrede(davor);
    return { vorname, nachname: n.slice(n.length - hinweis.length) };
  }
  const rest = ohneAnrede(n) ?? n;
  const i = rest.lastIndexOf(" ");
  if (i < 0) return { vorname: null, nachname: rest };
  return { vorname: clean(rest.slice(0, i)), nachname: clean(rest.slice(i + 1)) };
}

type NamensWerte = Partial<Record<NamensKey, string | null>>;

/**
 * Den zusammengesetzten Namen aus Vorname und Nachname bilden, für jeden Bauherrn, bei dem einer der Teile genannt ist.
 * Fehlen beide Teile (undefined), bleibt der Name wie übergeben (ältere Aufrufer, Import).
 */
export function namenErgaenzen<T extends NamensWerte>(b: T): T {
  const out = { ...b } as NamensWerte;
  for (const f of NAMENS_FELDER) {
    if (b[f.vorname] === undefined && b[f.nachname] === undefined) continue;
    out[f.vorname] = clean(b[f.vorname]);
    out[f.nachname] = clean(b[f.nachname]);
    out[f.name] = vollerName(b[f.vorname], b[f.nachname]);
  }
  return out as T;
}

/**
 * Vorname und Nachname fürs Formular: gespeicherte Teile, sonst aus dem Namen geteilt. Beim ersten Bauherrn dient der
 * Projektname als Nachname, wenn kein Name eingetragen ist. Liefert alle Teile als Text (leer statt null).
 */
export function namenVorbelegen(b: NamensWerte | null | undefined, projektName?: string | null): Record<NamensTeilKey, string> {
  const out = {} as Record<NamensTeilKey, string>;
  for (const f of NAMENS_FELDER) {
    const gespeichert = b?.[f.vorname] != null || b?.[f.nachname] != null;
    const geteilt = gespeichert ? { vorname: b?.[f.vorname] ?? null, nachname: b?.[f.nachname] ?? null } : teileName(b?.[f.name], f.nr === 1 ? projektName : null);
    out[f.vorname] = geteilt.vorname ?? "";
    out[f.nachname] = geteilt.nachname ?? "";
  }
  return out;
}

/**
 * Fehlende Teile aus dem Namen ergänzen (Entwurf aus einem Dokument, älterer Formularstand): nur bei Bauherren, bei denen
 * weder Vorname noch Nachname gesetzt ist. Der erste Bauherr nutzt den Projektnamen als Nachnamen-Hinweis.
 */
export function namenTeilen<T extends NamensWerte>(b: T, projektName?: string | null): T {
  const out = { ...b } as NamensWerte;
  for (const f of NAMENS_FELDER) {
    if (b[f.vorname] != null || b[f.nachname] != null || !clean(b[f.name])) continue;
    const t = teileName(b[f.name], f.nr === 1 ? projektName : null);
    out[f.vorname] = t.vorname;
    out[f.nachname] = t.nachname;
  }
  return out as T;
}

/** Formularschlüssel für "von Hand geändert": Vorname und Nachname zählen zum Namen des jeweiligen Bauherrn. */
export function namensFormKey(k: string): string {
  if (k === "name" || k === "vorname" || k === "nachname") return "bauherrName";
  const f = WEITERE_BAUHERREN.find((b) => b.vorname === k || b.nachname === k);
  return f ? f.name : k;
}
