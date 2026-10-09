import { describe, expect, it } from "vitest";
import { checkFile, fileKind } from "./files";

describe("checkFile", () => {
  it("lässt Dokumente durch", () => {
    for (const n of ["Plan.pdf", "Foto.JPG", "Liste.docx", "Kalkulation.xlsx", "Mail.eml"]) expect(checkFile(n, 1000).ok, n).toBe(true);
  });

  it("hält CAD-Dateien auf dem Fileserver", () => {
    const r = checkFile("Grundriss.DWG", 1000);
    expect(r).toMatchObject({ ok: false, kind: "cad" });
    expect(checkFile("Haus.pln", 1)).toMatchObject({ kind: "cad" });
  });

  it("legt ausführbare Dateien nie ab", () => {
    expect(checkFile("rechnung.pdf.exe", 1)).toMatchObject({ ok: false, kind: "blocked" });
    expect(checkFile("script.js", 1)).toMatchObject({ kind: "blocked" });
  });

  it("prüft Größe und Namen", () => {
    expect(checkFile("gross.pdf", 60 * 1024 * 1024)).toMatchObject({ kind: "size" });
    expect(checkFile("../x.pdf", 1)).toMatchObject({ kind: "name" });
  });
});

describe("fileKind", () => {
  it("erkennt Dateiarten", () => {
    expect(fileKind("a.pdf")).toBe("pdf");
    expect(fileKind("IMG_1.heic")).toBe("bild");
    expect(fileKind("x", "image/png")).toBe("bild");
    expect(fileKind("a.docx")).toBe("office");
    expect(fileKind("a.zip")).toBe("datei");
  });
});
