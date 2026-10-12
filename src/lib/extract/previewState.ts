// Reine Logik der Dokument-Vorschau in der Prüfmaske: Blättern, Zoom, Einpassen, Zwischenspeicher der Seitenbilder.
// Die Vorschau zeigt nur an. Was an den KI-Dienst geht, bestimmt allein die Auslesung (pageImage.ts, MAX_IMAGE_EDGE).

export const ZOOM_MIN = 1; // 100 % = eingepasst
export const ZOOM_MAX = 4; // 400 %
/** Stufen der Schaltflächen + und − */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
/** Längste Kante der Seitenbilder für die Anzeige (reicht für 400 % auf einem Handy, 250 % in der Spalte am Bildschirm). */
export const VIEW_EDGE = 2000;
export const THUMB_EDGE = 160;
/** So viele gerenderte Seiten bleiben im Speicher (zuletzt angesehene zuerst). */
export const PAGE_CACHE = 4;

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) : ZOOM_MIN;
}

/** Nächste Stufe nach oben (dir 1) oder unten (dir -1), auch von einem Zwischenwert aus (Mausrad, Zwei-Finger-Geste). */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const z = clampZoom(zoom);
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_MIN;
}

/** Mausrad mit Strg/Cmd: nach oben drehen (deltaY < 0) vergrößert. Stufenlos, je Raststufe etwa 10 %. */
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-Math.max(-100, Math.min(100, deltaY)) / 500));
}

/** Zwei-Finger-Geste: Zoom zu Beginn mal Verhältnis der Fingerabstände. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !(distance > 0)) return clampZoom(startZoom);
  return clampZoom(startZoom * (distance / startDistance));
}

export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, pageCount), Math.max(1, Math.round(page)));
}

/** Eingabe im Seitenfeld: gültige Seite oder null (dann bleibt die Anzeige, wie sie ist). */
export function parsePage(input: string, pageCount: number): number | null {
  if (!/^\s*\d+\s*$/.test(input)) return null;
  const n = Number(input);
  return n >= 1 && n <= pageCount ? n : null;
}

/** Größe, in der ein Bild ganz in einen Kasten passt ("Einpassen" = 100 %). */
export function fitSize(image: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number } {
  if (!(image.width > 0) || !(image.height > 0) || !(box.width > 0) || !(box.height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(box.width / image.width, box.height / image.height);
  return { width: Math.floor(image.width * scale), height: Math.floor(image.height * scale) };
}

/**
 * Scrollposition nach einer Zoom-Änderung, sodass derselbe Punkt des Bildes unter `anchor` bleibt
 * (Mitte des Fensters bei den Schaltflächen, Mauszeiger bzw. Mitte der Finger bei Rad und Geste).
 */
export function scrollAfterZoom(scroll: number, anchor: number, oldSize: number, newSize: number): number {
  if (!(oldSize > 0)) return 0;
  return Math.max(0, ((scroll + anchor) / oldSize) * newSize - anchor);
}

/** Kleiner Zwischenspeicher: behält die zuletzt benutzten Einträge, höchstens `limit`. */
export class RecentCache<V> {
  private map = new Map<number, V>();
  constructor(private limit: number) {}
  get(key: number): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: number, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as number);
  }
  keys(): number[] {
    return [...this.map.keys()];
  }
  clear(): void {
    this.map.clear();
  }
}

/** Seite, auf die eine Quelle verweist, wenn es sie im Dokument gibt (für den Sprung aus der Feldliste). */
export function sourcePage(seite: number | null | undefined, pageCount: number): number | null {
  return typeof seite === "number" && Number.isInteger(seite) && seite >= 1 && seite <= pageCount ? seite : null;
}
