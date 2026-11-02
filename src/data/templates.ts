import ordnerstruktur from "../../docs/ordnerstruktur.md?raw";
import { extractCodeBlock, parseFolderTemplate } from "../lib/folders";
import { BAUBEGLEITUNG_STAGE, CORE_STEPS, type StepDefinition } from "../lib/steps";
import type { FolderTemplate } from "../lib/types";
import { FOLDER_KEYWORDS } from "./folderHints";

/** Ordnervorlage aus docs/ordnerstruktur.md plus Schlüsselwörter. Gleiche Daten wie in Migration 0002. */
export function buildFolderTemplates(): FolderTemplate[] {
  return parseFolderTemplate(extractCodeBlock(ordnerstruktur)).map((t) => ({ ...t, keywords: FOLDER_KEYWORDS[t.path] ?? [] }));
}

/**
 * Vorschlag weiterer Phasen (BUILD.md Abschnitt 6), mit ABM abzustimmen.
 * Die fünf Excel-Schritte (10–50) bleiben unverändert, neue Schritte liegen dazwischen bzw. dahinter.
 * Stufe Baubegleitung: Reihenfolge der Ordner in "11 Baubegleitung" (Migration 0021).
 */
export const PROPOSED_STEPS: StepDefinition[] = [
  { key: "vermesser_beauftragt", label: "Vermesser beauftragt", sortOrder: 32, stage: "Planung" },
  { key: "entwurf_freigegeben", label: "Entwurf freigegeben", sortOrder: 34, stage: "Planung" },
  { key: "vorabzug_versendet", label: "Vorabzug versendet", sortOrder: 36, stage: "Planung" },
  { key: "baufreigabe", label: "Baufreigabe", sortOrder: 60, stage: "Genehmigung" },
  { key: "ausschreibung", label: "Ausschreibung", sortOrder: 70, stage: BAUBEGLEITUNG_STAGE },
  { key: "hausanschluesse_beantragt", label: "Hausanschlüsse", sortOrder: 80, stage: BAUBEGLEITUNG_STAGE },
  { key: "ausfuehrungsplaene", label: "Ausführungspläne", sortOrder: 90, stage: BAUBEGLEITUNG_STAGE },
  { key: "bauanlaufgespraech", label: "Bauanlaufgespräch", sortOrder: 100, stage: BAUBEGLEITUNG_STAGE },
  { key: "vermesser_baubegleitung", label: "Vermesser", sortOrder: 110, stage: BAUBEGLEITUNG_STAGE },
  { key: "strassensperrung", label: "Straßensperrung", sortOrder: 120, stage: BAUBEGLEITUNG_STAGE },
  { key: "bp_kellerbaufirma", label: "BP-Kellerbaufirma", sortOrder: 130, stage: BAUBEGLEITUNG_STAGE },
  // Schlüssel aus der Zeit vor 0021: erfasste Termine und Rechnungsauslöser hängen daran
  { key: "hausaufstellung", label: "Hausanschlüsse nach der Hausaufstellung", sortOrder: 140, stage: BAUBEGLEITUNG_STAGE },
  { key: "baustellentermine", label: "Baustellentermine", sortOrder: 150, stage: BAUBEGLEITUNG_STAGE },
];

export function allStepDefinitions(): StepDefinition[] {
  return [...CORE_STEPS, ...PROPOSED_STEPS].sort((a, b) => a.sortOrder - b.sortOrder);
}
