// Vorlagen des Planungsprotokolls: welche es gibt, woher sie kommen, welche zu einer Hausbaufirma gehört.
// Die PDF-Dateien sind Firmendokumente und liegen nicht im Repo: im Echtbetrieb im privaten Speicher (Bucket "vorlagen",
// hochgeladen mit scripts/vorlagen-hochladen.ts), im Demo-Modus im lokalen Ordner vorlagen/planungsprotokoll/.

import type { ProtokollVariante, ProtokollVorlage } from "../types";

export interface VorlagenInfo {
  key: ProtokollVorlage;
  /** Hausbaufirma, wie sie in den Stammdaten heißt */
  firma: string;
  label: string;
  /** Dateiname im lokalen Ordner vorlagen/planungsprotokoll/ (so wie die Firmen sie liefern) */
  datei: string;
  /** Pfad im Bucket "vorlagen" */
  speicherPfad: string;
  /** Kurzform für Dateinamen */
  kurz: string;
}

export const VORLAGEN_BUCKET = "vorlagen";
export const VORLAGEN_ORDNER = "vorlagen/planungsprotokoll";

export const VORLAGEN: Record<ProtokollVorlage, VorlagenInfo> = {
  schwabenhaus: {
    key: "schwabenhaus",
    firma: "Schwabenhaus",
    label: "Schwabenhaus (SH-Planungs-Dokumentation)",
    datei: "1_SH-Planungs-Dokumentation_2026-04.pdf",
    speicherPfad: "planungsprotokoll/schwabenhaus.pdf",
    kurz: "SH",
  },
  "living-haus": {
    key: "living-haus",
    firma: "Living Haus",
    label: "Living Haus (FB-22-201-03)",
    datei: "FB-22-201-03_Planungsprotokoll_LH_Bauantrag (1).pdf",
    speicherPfad: "planungsprotokoll/living-haus.pdf",
    kurz: "LH",
  },
  "bien-zenker": {
    key: "bien-zenker",
    firma: "Bien-Zenker",
    label: "Bien-Zenker (FB-22-201-03)",
    datei: "FB-22-201-03_Planungsprotokoll_Bauantrag.pdf",
    speicherPfad: "planungsprotokoll/bien-zenker.pdf",
    kurz: "BZ",
  },
};

export const VORLAGEN_LISTE: VorlagenInfo[] = [VORLAGEN.schwabenhaus, VORLAGEN["living-haus"], VORLAGEN["bien-zenker"]];

export const VARIANTE_LABEL: Record<ProtokollVariante, string> = {
  bearbeitbar: "Bearbeitbar",
  flach: "Flache Fassung zum Versand",
};

/** Ordner im Projekt, in dem die erzeugten Protokolle abgelegt werden (Ordnervorlage). Annahme: docs/offene-fragen.md. */
export const PROTOKOLL_ORDNER = "08 Bauantrag";

const norm = (s: string) => s.toLocaleLowerCase("de").replace(/[^a-z0-9äöüß]/g, "");

/** Vorlage passend zur Hausbaufirma (Name aus den Stammdaten), sonst null: dann wählt der Mensch. */
export function vorlageFuerFirma(firma: string | null | undefined): ProtokollVorlage | null {
  if (!firma) return null;
  const n = norm(firma);
  if (n.includes("schwabenhaus")) return "schwabenhaus";
  if (n.includes("livinghaus")) return "living-haus";
  if (n.includes("bienzenker")) return "bien-zenker";
  return null;
}

/**
 * Dateiname eines erzeugten Protokolls. Enthält Datum und Uhrzeit, damit zwei Fassungen nie gleich heißen
 * (überschrieben wird ohnehin nie: jede Fassung ist ein eigenes Dokument).
 */
export function protokollDateiname(vorlage: ProtokollVorlage, variante: ProtokollVariante, bauherr: string, stamp: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const datum = `${stamp.getFullYear()}-${p(stamp.getMonth() + 1)}-${p(stamp.getDate())}_${p(stamp.getHours())}${p(stamp.getMinutes())}`;
  const name = bauherr.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-") || "Projekt";
  return `Planungsprotokoll_${VORLAGEN[vorlage].kurz}_${name}_${datum}_${variante}.pdf`;
}
