// Die drei Vorlagen des Planungsprotokolls (ausfüllbare PDFs der Hausbaufirmen). Die PDFs selbst liegen nur lokal in
// vorlagen/planungsprotokoll/ und werden nicht eingecheckt (Dokumente der Hausbaufirmen, zusammen rund 17 MB).
export const VORLAGEN_DIR = "vorlagen/planungsprotokoll";

export const VORLAGEN = [
  { key: "schwabenhaus", firma: "Schwabenhaus", datei: "1_SH-Planungs-Dokumentation_2026-04.pdf", titel: "SH-Planungs-Dokumentation (Stand 2026-04)" },
  { key: "living-haus", firma: "Living Haus", datei: "FB-22-201-03_Planungsprotokoll_LH_Bauantrag (1).pdf", titel: "FB-22-201-03 Planungsprotokoll LH Bauantrag" },
  { key: "bien-zenker", firma: "Bien-Zenker", datei: "FB-22-201-03_Planungsprotokoll_Bauantrag.pdf", titel: "FB-22-201-03 Planungsprotokoll Bauantrag" },
];
