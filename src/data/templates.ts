import ordnerstruktur from "../../docs/ordnerstruktur.md?raw";
import { extractCodeBlock, parseFolderTemplate } from "../lib/folders";
import { CORE_STEPS, type StepDefinition } from "../lib/steps";
import type { FolderTemplate } from "../lib/types";
import { FOLDER_KEYWORDS } from "./folderHints";

/** Ordnervorlage aus docs/ordnerstruktur.md plus Schlüsselwörter. Gleiche Daten wie in Migration 0002. */
export function buildFolderTemplates(): FolderTemplate[] {
  return parseFolderTemplate(extractCodeBlock(ordnerstruktur)).map((t) => ({ ...t, keywords: FOLDER_KEYWORDS[t.path] ?? [] }));
}

/**
 * Vorschlag weiterer Phasen (BUILD.md Abschnitt 6), mit ABM abzustimmen.
 * Die fünf Excel-Schritte (10–50) bleiben unverändert, neue Schritte liegen dazwischen bzw. dahinter.
 */
export const PROPOSED_STEPS: StepDefinition[] = [
  { key: "vermesser_beauftragt", label: "Vermesser beauftragt", sortOrder: 32 },
  { key: "entwurf_freigegeben", label: "Entwurf freigegeben", sortOrder: 34 },
  { key: "vorabzug_versendet", label: "Vorabzug versendet", sortOrder: 36 },
  { key: "baufreigabe", label: "Baufreigabe", sortOrder: 60 },
  { key: "bauanlaufgespraech", label: "Bauanlaufgespräch", sortOrder: 70 },
  { key: "hausanschluesse_beantragt", label: "Hausanschlüsse beantragt", sortOrder: 80 },
  { key: "hausaufstellung", label: "Hausaufstellung", sortOrder: 90 },
];

export function allStepDefinitions(): StepDefinition[] {
  return [...CORE_STEPS, ...PROPOSED_STEPS].sort((a, b) => a.sortOrder - b.sortOrder);
}
