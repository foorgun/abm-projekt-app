// Ordnerbaum eines Projekts: Vorlage (folder_templates) + konkrete Datumsordner aus den abgelegten Dokumenten.
//
// Ein Vorlagenordner mit Datum ("01 erhalten am {datum}") erscheint NICHT als eigene Ebene. Die konkreten Ordner
// mit echtem Datum ("01 erhalten am 14.11.2026") hängen direkt am Elternordner; der Elternordner merkt sich die
// Vorlage als "Datumsfach" (dateSlots), damit neue Ablagen dort einen Datumsordner anlegen können.
// Unterordner aus der Vorlage werden unter jedem konkreten Datumsordner wiederholt.

import { DATE_TOKEN, PATH_SEP } from "./folders";
import type { FolderTemplate, ProjectDocument } from "./types";

export interface DateSlot {
  /** Pfad mit "{datum}" im letzten Segment, z. B. ".../01 Baugenehmigung/01 erhalten am {datum}". */
  path: string;
  /** Anzeige, z. B. "01 erhalten am …" */
  label: string;
}

export interface FolderNode {
  /** Konkreter Pfad (ohne Platzhalter). */
  path: string;
  label: string;
  /** Datumsordner, die in diesem Ordner angelegt werden können (aus der Vorlage). */
  dateSlots: DateSlot[];
  description: string | null;
  children: FolderNode[];
  /** Dateien direkt in diesem Ordner */
  own: number;
  /** Dateien in diesem Ordner und allen Unterordnern */
  total: number;
}

function segmentPattern(label: string): RegExp {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(DATE_TOKEN.replace(/[{}]/g, "\\$&"), "\\d{2}\\.\\d{2}\\.\\d{4}");
  return new RegExp(`^${esc}$`);
}

/** Anzeige eines Datums-Sammelknotens: "01 erhalten am …" */
export function dateTemplateLabel(label: string): string {
  return label.replace(DATE_TOKEN, "…").replace(/\s+…$/, " …");
}

export function buildFolderTree(templates: FolderTemplate[], documents: Pick<ProjectDocument, "folderPath">[]): FolderNode[] {
  const byParent = new Map<string | null, FolderTemplate[]>();
  for (const t of templates) {
    const list = byParent.get(t.parentPath) ?? [];
    list.push(t);
    byParent.set(t.parentPath, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sort - b.sort);

  const counts = new Map<string, number>();
  for (const d of documents) counts.set(d.folderPath, (counts.get(d.folderPath) ?? 0) + 1);
  const docPaths = [...counts.keys()];

  /** Kinder eines Ordners: normale Vorlagenordner plus konkrete Datumsordner; Datumsvorlagen als Fächer. */
  function build(templateParent: string | null, concreteParent: string | null): { children: FolderNode[]; slots: DateSlot[] } {
    const children: FolderNode[] = [];
    const slots: DateSlot[] = [];
    for (const t of byParent.get(templateParent) ?? []) {
      const base = concreteParent ? `${concreteParent}${PATH_SEP}${t.label}` : t.label;
      if (!t.label.includes(DATE_TOKEN)) {
        const sub = build(t.path, base);
        children.push(finish({ path: base, label: t.label, dateSlots: sub.slots, description: t.description, children: sub.children }));
        continue;
      }
      slots.push({ path: base, label: dateTemplateLabel(t.label) });
      // Konkrete Instanzen: Segment an dieser Tiefe passt zum Muster, alles davor ist gleich
      const depth = base.split(PATH_SEP).length;
      const prefix = concreteParent ? `${concreteParent}${PATH_SEP}` : "";
      const re = segmentPattern(t.label);
      const instances = new Set<string>();
      for (const p of docPaths) {
        if (prefix && !p.startsWith(prefix)) continue;
        const segs = p.split(PATH_SEP);
        if (segs.length >= depth && re.test(segs[depth - 1])) instances.add(segs.slice(0, depth).join(PATH_SEP));
      }
      for (const inst of [...instances].sort((a, b) => dateKey(b).localeCompare(dateKey(a)))) {
        const sub = build(t.path, inst);
        children.push(finish({ path: inst, label: inst.split(PATH_SEP).pop()!, dateSlots: sub.slots, description: t.description, children: sub.children }));
      }
    }
    return { children, slots };
  }

  function finish(n: Omit<FolderNode, "own" | "total">): FolderNode {
    const own = counts.get(n.path) ?? 0;
    const total = own + n.children.reduce((s, c) => s + c.total, 0);
    return { ...n, own, total };
  }

  return build(null, null).children;
}

/** "…/01 erhalten am 14.11.2026" → "2026-11-14" (zum Sortieren). */
function dateKey(path: string): string {
  const m = path.match(/(\d{2})\.(\d{2})\.(\d{4})(?!.*\d{2}\.\d{2}\.\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Knoten per Pfad finden (Tiefensuche). */
export function findNode(nodes: FolderNode[], path: string): FolderNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    const hit = findNode(n.children, path);
    if (hit) return hit;
  }
  return null;
}

/** Alle Vorfahren-Pfade eines Pfads (zum Aufklappen). */
export function ancestorPaths(nodes: FolderNode[], path: string): string[] {
  const trail: string[] = [];
  function walk(list: FolderNode[], acc: string[]): boolean {
    for (const n of list) {
      if (n.path === path) {
        trail.push(...acc);
        return true;
      }
      if (walk(n.children, [...acc, n.path])) return true;
    }
    return false;
  }
  walk(nodes, []);
  return trail;
}
