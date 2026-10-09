// Ordnervorlage: Parser für docs/ordnerstruktur.md und Hilfsfunktionen für Datumsordner.
//
// Format der Vorlage (Codeblock in der Markdown-Datei):
//   - Einrückung 3 Leerzeichen je Ebene
//   - "A / B" = B ist Unterordner von A (in einer Zeile notiert)
//   - "01 X, 02 Y" nach einem " / " = Geschwister
//   - Text in Klammern nach mehreren Leerzeichen = Beschreibung
//   - Zeilen mit Dateinamen (z. B. "Liste.docx") sind Dateien, keine Ordner
//   - Datumsplatzhalter (tt.mm.jjjj, xx.yy.xxxx, xxx …) und "… am" ohne Datum → "{datum}"

import type { FolderTemplate } from "./types";

export const DATE_TOKEN = "{datum}";
export const PATH_SEP = "/";

const PLACEHOLDER = /^(?=[a-z.]*[txyj])[txyjm]{2,4}(?:\.[txyjm]{2,4}){0,2}\.?$/i;
const FILE_LINE = /^\S+\.(docx?|xlsx?|pdf|dwg)\b/i;

/** Normalisiert einen Ordnernamen aus der Vorlage. */
export function normalizeLabel(raw: string): { label: string; hasDate: boolean } {
  const words = raw.trim().replace(/\s+/g, " ").split(" ");
  const last = words[words.length - 1];
  if (words.length > 1 && PLACEHOLDER.test(last)) {
    words[words.length - 1] = DATE_TOKEN;
    return { label: words.join(" "), hasDate: true };
  }
  if (words.length > 1 && last === "am") {
    return { label: `${words.join(" ")} ${DATE_TOKEN}`, hasDate: true };
  }
  return { label: words.join(" "), hasDate: false };
}

/** Den ersten Codeblock aus einer Markdown-Datei holen. */
export function extractCodeBlock(markdown: string): string {
  const m = markdown.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!m) throw new Error("Kein Codeblock mit der Ordnervorlage gefunden");
  return m[1];
}

export function parseFolderTemplate(block: string): FolderTemplate[] {
  const out: FolderTemplate[] = [];
  const byPath = new Map<string, FolderTemplate>();
  const stack: string[] = []; // Pfad je Einrückungsebene
  let sort = 0;

  function add(parent: string | null, rawName: string, description: string | null): string {
    const { label, hasDate } = normalizeLabel(rawName);
    const path = parent ? `${parent}${PATH_SEP}${label}` : label;
    if (!byPath.has(path)) {
      const t: FolderTemplate = { path, parentPath: parent, sort: sort++, label, hasDate, keywords: [], description };
      byPath.set(path, t);
      out.push(t);
    } else if (description) {
      byPath.get(path)!.description = description;
    }
    return path;
  }

  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)![0].length;
    const level = Math.floor(indent / 3);
    let text = line.trim();
    let description: string | null = null;
    const desc = text.match(/^(.*?)\s{2,}\((.*)\)\s*$/);
    if (desc) {
      text = desc[1].trim();
      description = desc[2].trim();
    }
    stack.length = level;
    if (FILE_LINE.test(text)) continue;

    const parent = level > 0 ? stack[level - 1] ?? null : null;
    const segments = text.split(/\s+\/\s+/);
    let current = add(parent, segments[0], segments.length === 1 ? description : null);
    for (let i = 1; i < segments.length; i++) {
      const siblings = segments[i].split(/,\s*(?=\d{2}\s)/);
      const isLast = i === segments.length - 1;
      const paths = siblings.map((s) => add(current, s, isLast && siblings.length === 1 ? description : null));
      current = paths[0];
    }
    // Nachfolgende, tiefer eingerückte Zeilen hängen am ersten Segment der Zeile
    stack[level] = parent ? `${parent}${PATH_SEP}${normalizeLabel(segments[0]).label}` : normalizeLabel(segments[0]).label;
  }
  return out;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "2026-11-14" → "14.11.2026" */
export function folderDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** Setzt das Datum in alle Platzhalter eines Vorlagenpfads ein. */
export function concretePath(templatePath: string, isoDate: string): string {
  return templatePath.split(DATE_TOKEN).join(folderDate(isoDate));
}

/**
 * Ordnet einen konkreten Pfad (mit echtem Datum) seinem Vorlagenpfad zu.
 * Liefert null, wenn der Pfad nicht aus der Vorlage stammt.
 */
export function templateOf(concrete: string, templates: FolderTemplate[]): FolderTemplate | null {
  const direct = templates.find((t) => t.path === concrete);
  if (direct) return direct;
  const parts = concrete.split(PATH_SEP);
  return (
    templates.find((t) => {
      const tp = t.path.split(PATH_SEP);
      if (tp.length !== parts.length) return false;
      return tp.every((seg, i) => {
        if (!seg.includes(DATE_TOKEN)) return seg === parts[i];
        const [pre, post] = seg.split(DATE_TOKEN);
        const mid = parts[i].slice(pre.length, parts[i].length - post.length);
        return parts[i].startsWith(pre) && parts[i].endsWith(post) && /^\d{2}\.\d{2}\.\d{4}$/.test(mid);
      });
    }) ?? null
  );
}

/** Ist `path` ein gültiges Ablageziel (Vorlagenpfad oder daraus konkretisierter Datumspfad)? */
export function isAllowedFolder(path: string, templates: FolderTemplate[]): boolean {
  return templateOf(path, templates) !== null;
}

/** Anzeige eines Pfads mit " › " statt "/". */
export function displayPath(path: string): string {
  return path.split(PATH_SEP).join(" › ");
}
