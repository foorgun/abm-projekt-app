// Einstieg: extractProjectFromDocument(file) wählt den Extractor über den Schalter VITE_PROJECT_EXTRACTOR.
// Standard und einzige aktive Variante ist "mock". "edge" ist nur vorbereitet und sendet nichts
// (Voraussetzungen: AVV und serverseitiger API-Schlüssel, siehe docs/vertrag-extraktion.md).

import { mockExtractor } from "./mockExtractor";
import type { ProjectDraft, ProjectExtractor } from "./types";

export type ExtractorKind = "mock" | "edge";

export function extractorKind(env: { VITE_PROJECT_EXTRACTOR?: string } = import.meta.env as { VITE_PROJECT_EXTRACTOR?: string }): ExtractorKind {
  return env.VITE_PROJECT_EXTRACTOR === "edge" ? "edge" : "mock";
}

/** Platzhalter für die Edge Function. Bewusst ohne Aufruf: wer den Schalter umlegt, bekommt eine klare Meldung. */
export const edgeExtractor: ProjectExtractor = {
  name: "edge",
  async extract(): Promise<ProjectDraft> {
    throw new Error("Der KI-Extractor ist noch nicht freigeschaltet (AVV und Edge Function fehlen). Bitte VITE_PROJECT_EXTRACTOR=mock verwenden.");
  },
};

export function getExtractor(kind: ExtractorKind = extractorKind()): ProjectExtractor {
  return kind === "edge" ? edgeExtractor : mockExtractor;
}

export function extractProjectFromDocument(file: File): Promise<ProjectDraft> {
  return getExtractor().extract(file);
}

export * from "./types";
export { checkContractFile, CONTRACT_ACCEPT, MAX_CONTRACT_BYTES } from "./contractFile";
