// Einstieg: wählt den Extractor über den Schalter VITE_PROJECT_EXTRACTOR ("mock" | "edge").
//   mock (Standard): liest im Browser, nichts verlässt den Rechner. Für den Demo-Modus.
//   edge: sendet Seite 1 (und auf Wunsch die Plan-Seite) als Bild an die Edge Function extract-project.
//         Der API-Schlüssel liegt nur dort. Solange die Funktion nicht freigeschaltet ist (EXTRACTOR_ENABLED),
//         meldet sie das, und die Oberfläche bietet die manuelle Anlage an. Siehe docs/vertrag-extraktion.md.

import { checkContractFile } from "./contractFile";
import { createMockExtractor } from "./mockExtractor";
import { renderPages, toExtractImage, type DocumentPages } from "./pageImage";
import { pdfPages } from "./readText";
import { ExtractUnavailable, normalizeFields, type ExtractRequest, type ExtractResponse, type ProjectDraft, type ProjectExtractor } from "./types";

export type ExtractorKind = "mock" | "edge";

export function extractorKind(env: { VITE_PROJECT_EXTRACTOR?: string } = import.meta.env as { VITE_PROJECT_EXTRACTOR?: string }): ExtractorKind {
  return env.VITE_PROJECT_EXTRACTOR === "edge" ? "edge" : "mock";
}

/** Höchstens zwei Bilder je Auslesung: Seite 1 und optional die Plan-Seite. */
export const MAX_EXTRACT_IMAGES = 2;

/**
 * Extractor über die Edge Function. `call` ist der Aufruf über das Repo (die Oberfläche spricht nie direkt mit Supabase),
 * `render` erzeugt die Seitenbilder (austauschbar für Tests).
 */
export function createEdgeExtractor(deps: {
  call: (request: ExtractRequest) => Promise<ExtractResponse>;
  render?: (file: File, kind: "pdf" | "docx" | "bild", pages: number[]) => Promise<DocumentPages | null>;
  /** Für DOCX gibt es kein Seitenbild: dort liest der Mock den Text lokal. */
  fallback: ProjectExtractor;
}): ProjectExtractor {
  const render = deps.render ?? renderPages;
  return {
    name: "edge",
    async extract(file, options): Promise<ProjectDraft> {
      const datei = { name: file.name, size: file.size, type: file.type };
      const check = checkContractFile(datei);
      if (!check.ok) throw new Error(check.reason);
      if (check.kind === "docx") return deps.fallback.extract(file);

      const wanted = [1, ...(options?.planPage && options.planPage > 1 ? [options.planPage] : [])].slice(0, MAX_EXTRACT_IMAGES);
      const rendered = await render(file, check.kind, wanted);
      if (!rendered?.pages.length) throw new ExtractUnavailable("Die erste Seite ließ sich nicht als Bild lesen.", "error");

      let response: ExtractResponse;
      try {
        response = await deps.call({ images: rendered.pages.slice(0, MAX_EXTRACT_IMAGES).map((p) => toExtractImage(p.dataUrl)) });
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
      const felder = normalizeFields(response.felder, gescannt);
      // Seitenzahl der Quelle: das Modell zählt die gesendeten Bilder, die Prüfmaske zeigt die Seite im Dokument
      for (const f of Object.values(felder)) if (f.quelle?.seite) f.quelle.seite = rendered.pages[f.quelle.seite - 1]?.page ?? null;
      return { datei, textquelle: "bild", extractor: "edge", gescannt, felder, hinweise: response.hinweise.slice(0, 5).map((h) => String(h).slice(0, 200)) };
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
