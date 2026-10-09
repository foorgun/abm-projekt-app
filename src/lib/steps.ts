// Schrittdefinitionen kommen aus der Datenbank (Tabelle step_definitions).
// Dieses Modul hält nur die zuletzt geladene Liste, damit reine Funktionen
// (z. B. Warnungstexte) Schrittnamen auflösen können.

export interface StepDefinition {
  key: string;
  label: string;
  sortOrder: number;
  /** Übergeordnete Stufe für die Pipeline (Migration 0003), z. B. "Planung". */
  stage: string;
}

/**
 * Die fünf Schritte aus der Excel-Liste (Migration 0001). Sie sind fest und werden
 * von der Warnlogik referenziert. Weitere Phasen kommen nur aus der Datenbank.
 */
export const CORE_STEPS: StepDefinition[] = [
  { key: "plangespraech", label: "Plangespräch", sortOrder: 10, stage: "Anbahnung" },
  { key: "vertrag_versendet", label: "Vertrag versendet", sortOrder: 20, stage: "Anbahnung" },
  { key: "vertrag_zurueck", label: "Vertrag zurück", sortOrder: 30, stage: "Anbahnung" },
  { key: "baugesuch_uebergabe", label: "Übergabe Baugesuch", sortOrder: 40, stage: "Genehmigung" },
  { key: "baugenehmigung", label: "Genehmigung", sortOrder: 50, stage: "Genehmigung" },
];

let definitions: StepDefinition[] = CORE_STEPS;

export function setStepDefinitions(defs: StepDefinition[]): void {
  definitions = [...defs].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getStepDefinitions(): StepDefinition[] {
  return definitions;
}

export function stepLabel(key: string): string {
  return definitions.find((d) => d.key === key)?.label ?? key;
}
