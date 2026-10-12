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

async function imagePages(file: Blob): Promise<DocumentPages> {
  const bitmap = await createImageBitmap(file);
  const size = fitInside(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
  const { canvas, ctx } = canvasFor(size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return { pageCount: 1, pages: [{ page: 1, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), ...size }] };
}

async function pdfPageImages(file: Blob, wanted: number[]): Promise<DocumentPages> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // isEvalSupported aus: die Seite erlaubt kein eval (Content-Security-Policy)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const pages: PageImage[] = [];
    for (const n of [...new Set(wanted)].filter((p) => p >= 1 && p <= doc.numPages)) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const size = fitInside(base.width * 2, base.height * 2, MAX_IMAGE_EDGE);
      const viewport = page.getViewport({ scale: size.width / base.width });
      const { canvas, ctx } = canvasFor(size.width, size.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({ page: n, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), ...size });
    }
    return { pageCount: doc.numPages, pages };
  } finally {
    void doc.destroy();
  }
}

/**
 * Rendert die gewünschten Seiten (ab 1). Bilder haben genau eine Seite. DOCX hat keine Vorschau.
 * Liefert null, wenn sich nichts darstellen lässt; die Prüfmaske arbeitet dann ohne Vorschau.
 */
export async function renderPages(file: Blob & { name?: string; type: string }, kind: "pdf" | "docx" | "bild", wanted: number[] = [1]): Promise<DocumentPages | null> {
  try {
    if (kind === "bild") return await imagePages(file);
    if (kind === "pdf") return await pdfPageImages(file, wanted);
    return null;
  } catch {
    return null;
  }
}
