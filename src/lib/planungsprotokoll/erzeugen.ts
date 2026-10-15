// Planungsprotokoll im Browser erzeugen: Vorlage über das Repo laden (Speicher bzw. lokaler Ordner), Schrift aus dem
// Build, Werte aus dem Datenbestand. pdf-lib wird erst hier nachgeladen, damit es nicht im Hauptpaket landet.

import schriftUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import type { Repo } from "../repo";
import type { Dataset, Project, ProtokollVariante, ProtokollVorlage } from "../types";
import { protokollDaten } from "./daten";
import { protokollDateiname } from "./vorlagen";
import { feldwerte } from "./zuordnung";

export interface ProtokollDatei {
  blob: Blob;
  fileName: string;
  gesetzt: number;
  leer: number;
}

/** Erzeugt die Datei, legt sie aber noch nicht ab (das macht repo.savePlanungsprotokoll). Fehler: ProtokollFehler bzw. Error. */
export async function protokollErzeugen(repo: Repo, data: Dataset, project: Project, vorlage: ProtokollVorlage, variante: ProtokollVariante): Promise<ProtokollDatei> {
  const [{ erzeugeProtokoll }, vorlageBytes, schrift] = await Promise.all([
    import("./pdf"),
    repo.vorlageLaden(vorlage),
    // Unicode-Schrift (Liberation Sans, SIL OFL) mit ä ö ü ß; die Vorlagen bringen keine passende mit
    fetch(schriftUrl).then((r) => {
      if (!r.ok) throw new Error("Die Schrift für das Protokoll ließ sich nicht laden.");
      return r.arrayBuffer();
    }),
  ]);
  const werte = feldwerte(vorlage, protokollDaten(data, project.id));
  const res = await erzeugeProtokoll({ vorlage: vorlageBytes, schrift, werte, variante });
  return {
    blob: new Blob([res.bytes as BlobPart], { type: "application/pdf" }),
    fileName: protokollDateiname(vorlage, variante, project.bauherrLabel),
    gesetzt: res.gesetzt.length,
    leer: res.leer.length,
  };
}

/** Datei im Browser speichern (Download), ohne neuen Tab. */
export function dateiSpeichern(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
