// Seiten eines Dokuments als Bild: für die Vorschau in der Prüfmaske und für die Auslesung durch das Bildmodell.
// PDFs rendert pdf.js lokal im Browser (kein CDN, Worker liegt im eigenen Build). Bilder werden nur verkleinert.

import type { ExtractImage } from "./types";

/**
 * Längste Kante der Bilder, die zur Auslesung gesendet werden (Datenminimierung, Kosten). 1568 px ist die Größe,
 * bis zu der ältere Modelle ohne Verkleinern auskommen; neuere verarbeiten mehr, für Vertragsseiten reicht es.
 * Als JPEG mit Qualität 85 bleibt eine Seite weit unter der Grenze des KI-Dienstes von 5 MB je Bild.
 */
export const MAX_IMAGE_EDGE = 1568;
export const JPEG_QUALITY = 0.85;

export interface PageImage {
  /** Seite ab 1 */
  page: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface DocumentPages {
  pageCount: number;
  pages: PageImage[];
}

/** Größe so, dass die längste Kante höchstens `max` misst (nie vergrößern). */
export function fitInside(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Kleinere Kante für den zweiten Versuch, wenn ein Seitenbild über der Grenze der Funktion liegt (sehr dichte Scans). */
export const SMALL_IMAGE_EDGE = 1024;
/** Grenze je Bild in der Edge Function (Bilddatei, nicht Base64); der KI-Dienst selbst nimmt bis 10 MB Base64. */
export const MAX_SEND_BYTES = 5 * 1024 * 1024;

/** Größe der Bilddatei aus einem Base64-Text. */
export function base64Size(data: string): number {
  return Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
}

/** data:-URL → Bild für die Edge Function (Base64 ohne Präfix). */
export function toExtractImage(dataUrl: string): ExtractImage {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!m) throw new Error("Seite konnte nicht als Bild gelesen werden.");
  return { mediaType: m[1] as ExtractImage["mediaType"], data: m[2] };
}

function canvasFor(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
  ctx.fillStyle = "#fff"; // Papier: PDFs und PNGs mit Transparenz sonst schwarz
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

/**
 * Geöffnetes Dokument, das Seiten einzeln und erst auf Anfrage als Bild liefert (Vorschau zum Blättern).
 * Nichts wird im Voraus gerendert und nichts gesendet: `render` erzeugt nur das Bild für die Anzeige im Browser.
 */
export interface PageSource {
  pageCount: number;
  /** Seite ab 1 als JPEG, längste Kante höchstens `maxEdge` Pixel. */
  render(page: number, maxEdge: number): Promise<PageImage>;
  close(): void;
}

async function openImage(file: Blob): Promise<PageSource> {
  const bitmap = await createImageBitmap(file);
  return {
    pageCount: 1,
    async render(_page, maxEdge) {
      const size = fitInside(bitmap.width, bitmap.height, maxEdge);
      const { canvas, ctx } = canvasFor(size.width, size.height);
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      return { page: 1, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), ...size };
    },
    close: () => bitmap.close(),
  };
}

async function openPdf(file: Blob): Promise<PageSource> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // isEvalSupported aus: die Seite erlaubt kein eval (Content-Security-Policy)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  return {
    pageCount: doc.numPages,
    async render(n, maxEdge) {
      if (n < 1 || n > doc.numPages) throw new Error(`Seite ${n} gibt es nicht.`);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // nie über das Vierfache der Seitengröße hinaus (ein Scan gewinnt dadurch nichts, kostet aber Speicher)
      const size = fitInside(base.width * 4, base.height * 4, maxEdge);
      const viewport = page.getViewport({ scale: size.width / base.width });
      const { canvas, ctx } = canvasFor(size.width, size.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      return { page: n, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), ...size };
    },
    close: () => void doc.destroy(),
  };
}

/** Öffnet ein PDF oder Bild zum Blättern. null, wenn es keine Vorschau gibt (DOCX) oder die Datei nicht lesbar ist. */
export async function openPages(file: Blob, kind: "pdf" | "docx" | "bild"): Promise<PageSource | null> {
  try {
    if (kind === "bild") return await openImage(file);
    if (kind === "pdf") return await openPdf(file);
    return null;
  } catch {
    return null;
  }
}

/**
 * Rendert die gewünschten Seiten (ab 1) in der Größe für die Auslesung (höchstens MAX_IMAGE_EDGE). Bilder haben genau
 * eine Seite. DOCX hat keine Seitenbilder. Liefert null, wenn sich nichts darstellen lässt.
 */
export async function renderPages(file: Blob & { name?: string; type: string }, kind: "pdf" | "docx" | "bild", wanted: number[] = [1], maxEdge = MAX_IMAGE_EDGE): Promise<DocumentPages | null> {
  const source = await openPages(file, kind);
  if (!source) return null;
  try {
    const pages: PageImage[] = [];
    for (const n of [...new Set(wanted)].filter((p) => p >= 1 && p <= source.pageCount)) pages.push(await source.render(n, maxEdge));
    return { pageCount: source.pageCount, pages };
  } catch {
    return null;
  } finally {
    source.close();
  }
}
