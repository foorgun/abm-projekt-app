// Schrittdefinitionen kommen aus der Datenbank (Tabelle step_definitions).
// Dieses Modul hält nur die zuletzt geladene Liste, damit reine Funktionen
// (z. B. Warnungstexte) Schrittnamen auflösen können.

export interface StepDefinition {
  key: string;
  label: string;
  sortOrder: number;
}

/**
 * Die fünf Schritte aus der Excel-Liste (Migration 0001). Sie sind fest und werden
 * von der Warnlogik referenziert. Weitere Phasen kommen nur aus der Datenbank.
 */
export const CORE_STEPS: StepDefinition[] = [
  { key: "plangespraech", label: "Plangespräch", sortOrder: 10 },
  { key: "vertrag_versendet", label: "ABM-Vertrag versendet", sortOrder: 20 },
  { key: "vertrag_zurueck", label: "ABM-Vertrag zurück", sortOrder: 30 },
  { key: "baugesuch_uebergabe", label: "Übergabe Baugesuch", sortOrder: 40 },
  { key: "baugenehmigung", label: "Baugenehmigung", sortOrder: 50 },
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
