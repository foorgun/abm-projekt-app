// Einverständniserklärung im Browser erzeugen: Schriften aus dem Build, Werte aus dem Datenbestand.
// pdf-lib wird erst hier nachgeladen, damit es nicht im Hauptpaket landet.

import schriftUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import schriftFettUrl from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url";
import type { Dataset, Project } from "../types";
import { einverstaendnisDaten, einverstaendnisDateiname } from "./daten";

const laden = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Die Schrift für die Einverständniserklärung ließ sich nicht laden.");
    return r.arrayBuffer();
  });

/** Erzeugt die Datei, legt sie aber noch nicht ab (das macht repo.saveEinverstaendnis). */
export async function einverstaendnisErzeugen(data: Dataset, project: Project, heute: string): Promise<{ blob: Blob; fileName: string }> {
  const [{ erzeugeEinverstaendnis }, schrift, schriftFett] = await Promise.all([import("./pdf"), laden(schriftUrl), laden(schriftFettUrl)]);
  const bytes = await erzeugeEinverstaendnis({ daten: einverstaendnisDaten(data, project.id, heute), schrift, schriftFett });
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), fileName: einverstaendnisDateiname(project.bauherrLabel) };
}
