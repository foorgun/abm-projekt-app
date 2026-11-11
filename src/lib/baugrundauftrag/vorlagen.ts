// Vorlagen des Baugrundauftrags an clayton Umwelt-Consult GmbH: Auftragsformular (F324, 3 Seiten) und Anlage A.
// Die PDF-Dateien sind Firmendokumente und liegen nicht im Repo: im Echtbetrieb im privaten Speicher (Bucket "vorlagen",
// hochgeladen mit scripts/vorlagen-hochladen.ts), im Demo-Modus im lokalen Ordner vorlagen/clayton/.

import { vorlageFuerFirma } from "../planungsprotokoll/vorlagen";
import type { BaugrundVorlage } from "../types";

export interface BaugrundVorlagenInfo {
  key: BaugrundVorlage;
  label: string;
  /** Dateiname im lokalen Ordner vorlagen/clayton/ (so wie Clayton sie liefert) */
  datei: string;
  /** Pfad im Bucket "vorlagen" */
  speicherPfad: string;
}

export const BAUGRUND_VORLAGEN_ORDNER = "vorlagen/clayton";

export const BAUGRUND_VORLAGEN: Record<BaugrundVorlage, BaugrundVorlagenInfo> = {
  auftrag: {
    key: "auftrag",
    label: "Clayton Auftragsformular (F324)",
    datei: "Auftragsformular Bauherr allgemein 2 RKS 924,36 € netto F324 -2024- (1).pdf",
    speicherPfad: "clayton/auftrag.pdf",
  },
  anlage: {
    key: "anlage",
    label: "Clayton Anlage A zum Baugrundauftrag",
    datei: "Anlage zum Baugrundauftrag (1).pdf",
    speicherPfad: "clayton/anlage-a.pdf",
  },
};

export const BAUGRUND_VORLAGEN_LISTE: BaugrundVorlagenInfo[] = [BAUGRUND_VORLAGEN.auftrag, BAUGRUND_VORLAGEN.anlage];

/**
 * Nur bei Schwabenhaus beauftragt ABM den Baugrundgutachter für den Kunden. Bei Bien-Zenker und Living Haus ist das
 * Gutachten (auch Clayton) im Hauspreis, dort gibt es keinen Auftrag aus der App.
 */
export function brauchtBaugrundauftrag(firma: string | null | undefined): boolean {
  return vorlageFuerFirma(firma) === "schwabenhaus";
}
