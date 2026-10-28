// Einstieg: wählt den Extractor über den Schalter VITE_PROJECT_EXTRACTOR ("mock" | "edge").
//   mock (Standard): liest im Browser, nichts verlässt den Rechner. Für den Demo-Modus.
//   edge: sendet je Dokument die ersten Seiten (auf Wunsch eine weitere) als Bild an die Edge Function extract-project.
//         Der API-Schlüssel liegt nur dort. Solange die Funktion nicht freigeschaltet ist (EXTRACTOR_ENABLED),
//         meldet sie das, und die Oberfläche bietet die manuelle Anlage an. Siehe docs/vertrag-extraktion.md.

import { checkContractFile } from "./contractFile";
import { createMockExtractor } from "./mockExtractor";
import { base64Size, MAX_SEND_BYTES, renderPages, SMALL_IMAGE_EDGE, toExtractImage, type DocumentPages } from "./pageImage";
import { pdfPages } from "./readText";
import { ExtractUnavailable, isVertragsart, normalizeFields, type ExtractOptions, type ExtractRequest, type ExtractResponse, type ProjectDraft, type ProjectExtractor } from "./types";

export type ExtractorKind = "mock" | "edge";

export function extractorKind(env: { VITE_PROJECT_EXTRACTOR?: string } = import.meta.env as { VITE_PROJECT_EXTRACTOR?: string }): ExtractorKind {
  return env.VITE_PROJECT_EXTRACTOR === "edge" ? "edge" : "mock";
}

/** Seiten, die je Dokument gelesen werden: die ersten zwei (Vertragsdaten und Beteiligte stehen dort fast immer). */
export const PAGES_PER_DOCUMENT = 2;
/** Höchstens so viele Bilder je Aufruf (Grenze der Edge Function). */
export const MAX_EXTRACT_IMAGES = 4;

type Render = (file: File, kind: "pdf" | "docx" | "bild", pages: number[], maxEdge?: number) => Promise<DocumentPages | null>;

/** Welche Seiten gelesen werden: ausdrücklich gewünschte, sonst die ersten Seiten plus ggf. die Plan-Seite. */
export function pagesToRead(options: ExtractOptions | undefined, perDocument = PAGES_PER_DOCUMENT): number[] {
  if (options?.pages?.length) return [...new Set(options.pages)].filter((p) => p >= 1).slice(0, MAX_EXTRACT_IMAGES);
  const first = Array.from({ length: perDocument }, (_, i) => i + 1);
  const plan = options?.planPage && options.planPage > perDocument ? [options.planPage] : [];
  return [...first, ...plan].slice(0, MAX_EXTRACT_IMAGES);
}

/**
 * Extractor über die Edge Function. `call` ist der Aufruf über das Repo (die Oberfläche spricht nie direkt mit Supabase),
 * `render` erzeugt die Seitenbilder (austauschbar für Tests).
 */
export function createEdgeExtractor(deps: {
  call: (request: ExtractRequest) => Promise<ExtractResponse>;
  render?: Render;
  /** Für DOCX gibt es kein Seitenbild: dort liest der Mock den Text lokal. */
  fallback: ProjectExtractor;
}): ProjectExtractor {
  const render: Render = deps.render ?? renderPages;
  return {
    name: "edge",
    async extract(file, options): Promise<ProjectDraft> {
      const datei = { name: file.name, size: file.size, type: file.type };
      const check = checkContractFile(datei);
      if (!check.ok) throw new Error(check.reason);
      if (check.kind === "docx") return deps.fallback.extract(file, options);

      const wanted = pagesToRead(options);
      let rendered = await render(file, check.kind, wanted);
      if (!rendered?.pages.length) throw new ExtractUnavailable("Die Datei ließ sich nicht als Bild darstellen (beschädigt oder mit Passwort geschützt?).", "error");
      let images = rendered.pages.map((p) => toExtractImage(p.dataUrl));
      // Sehr dichte Scans: erst verkleinern statt abzuschneiden; klappt auch das nicht, verständlich melden
      if (images.some((i) => base64Size(i.data) > MAX_SEND_BYTES)) {
        rendered = (await render(file, check.kind, wanted, SMALL_IMAGE_EDGE)) ?? rendered;
        images = rendered.pages.map((p) => toExtractImage(p.dataUrl));
        if (images.some((i) => base64Size(i.data) > MAX_SEND_BYTES)) throw new ExtractUnavailable("Die Seiten sind auch verkleinert noch zu groß zum Auslesen (über 5 MB je Seite).", "error");
      }

      let response: ExtractResponse;
      try {
        response = await deps.call({ images, art: options?.art, draftFileId: options?.draftFileId, pages: rendered.pages.map((p) => p.page) });
      } catch (e) {
        throw new ExtractUnavailable(e instanceof Error ? e.message : "Die Auslesung ist gerade nicht erreichbar.", "error");
      }
      if (!response.ok) throw new ExtractUnavailable(response.message, response.code);

      // Scan = PDF ohne Textebene oder Foto. Dann gilt höchstens "mittel".
      let gescannt = check.kind === "bild";
      if (check.kind === "pdf") {
        try {
          gescannt = (await pdfPages(await file.arrayBuffer())).length === 0;
        } catch {
          gescannt = true;
        }
      }
      const art = options?.art ?? (isVertragsart(response.dokumentart) ? response.dokumentart : undefined);
      const felder = normalizeFields(response.felder, gescannt, art);
      // Seitenzahl der Quelle: das Modell zählt die gesendeten Bilder, die Prüfmaske zeigt die Seite im Dokument
      for (const f of Object.values(felder)) if (f.quelle?.seite) f.quelle.seite = rendered.pages[f.quelle.seite - 1]?.page ?? null;
      return {
        datei,
        seiten: { gelesen: rendered.pages.map((p) => p.page), gesamt: rendered.pageCount },
        textquelle: "bild",
        extractor: "edge",
        gescannt,
        felder,
        hinweise: response.hinweise.slice(0, 5).map((h) => String(h).slice(0, 200)),
      };
    },
  };
}

/**
 * Der Extractor für die laufende App.
 * `demo`: Demo-Modus (erfundene Daten). `call`: Aufruf der Edge Function, fehlt im Demo-Modus.
 */
export function getExtractor(opts: { demo: boolean; call?: (request: ExtractRequest) => Promise<ExtractResponse>; kind?: ExtractorKind }): ProjectExtractor {
  const mock = createMockExtractor({ demo: opts.demo });
  const kind = opts.kind ?? extractorKind();
  if (kind === "edge" && opts.call && !opts.demo) return createEdgeExtractor({ call: opts.call, fallback: mock });
  return mock;
}

export * from "./types";
export { checkContractFile, CONTRACT_ACCEPT, MAX_CONTRACT_BYTES } from "./contractFile";

/** Liest ein Dokument und liefert den Entwurf mit {wert, quelle, sicherheit} je Feld. */
export function extractProjectFromDocument(file: File, env: Parameters<typeof getExtractor>[0], options?: Parameters<ProjectExtractor["extract"]>[1]): Promise<ProjectDraft> {
  return getExtractor(env).extract(file, options);
}
