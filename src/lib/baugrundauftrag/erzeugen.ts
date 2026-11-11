// Baugrundauftrag im Browser erzeugen: beide Vorlagen über das Repo laden (Speicher bzw. lokaler Ordner), Schrift aus dem
// Build, Werte aus dem Datenbestand. pdf-lib wird erst hier nachgeladen, damit es nicht im Hauptpaket landet.

import schriftUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import type { Repo } from "../repo";
import type { Dataset, Project } from "../types";
import { ankreuzen, baugrundDaten, baugrundDateiname, feldwerte } from "./daten";

/** Erzeugt die Datei, legt sie aber noch nicht ab (das macht repo.saveBaugrundauftrag). Fehler: ProtokollFehler bzw. Error. */
export async function baugrundauftragErzeugen(repo: Repo, data: Dataset, project: Project): Promise<{ blob: Blob; fileName: string }> {
  const [{ erzeugeBaugrundauftrag }, auftrag, anlage, schrift] = await Promise.all([
    import("./pdf"),
    repo.baugrundVorlageLaden("auftrag"),
    repo.baugrundVorlageLaden("anlage"),
    fetch(schriftUrl).then((r) => {
      if (!r.ok) throw new Error("Die Schrift für den Baugrundauftrag ließ sich nicht laden.");
      return r.arrayBuffer();
    }),
  ]);
  const d = baugrundDaten(data, project.id);
  const res = await erzeugeBaugrundauftrag({ auftrag, anlage, schrift, werte: feldwerte(d), ankreuzen: ankreuzen(d) });
  return { blob: new Blob([res.bytes as BlobPart], { type: "application/pdf" }), fileName: baugrundDateiname(project.bauherrLabel) };
}
