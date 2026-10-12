import { deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../../data/demoData";
import type { NewProject } from "../repo";
import { applyDraft, similarProjects } from "./applyDraft";
import { checkContractFile, MAX_CONTRACT_BYTES } from "./contractFile";
import { edgeExtractor, extractorKind, getExtractor } from "./index";
import { draftFromText, isoDate, mockExtractor } from "./mockExtractor";
import { docxText, pdfPages, textFromContentStream, textFromDocumentXml } from "./readText";
import { DRAFT_FIELDS } from "./types";

const TODAY = "2026-10-09";
const db = buildDemoDataset(TODAY);

// Erfundener Vertragstext (keine echten Personen)
const CONTRACT = [
  `Werkvertrag über Architektenleistungen
Vertragsdatum: 02.10.2026
Bauherr: Familie Anna und Jonas Hoffmann
wohnhaft in Lindenweg 12, 89073 Ulm
Telefon: 0731 000111
E-Mail: hoffmann@example.com
Hausbaufirma: ${db.companies[0].name}
Verkäufer: ${db.salespeople.find((s) => s.companyId === db.companies[0].id)!.name}
Auftrags-Nr.: HB-26301`,
  `Baugrundstück: Am Hang 7, 89134 Blaustein
Flurstück 412/3, Gemarkung Blaustein
Vermesser: Ingenieurbüro Beispiel Vermessung
Das Pauschalhonorar beträgt 12.500,00 € zuzüglich Umsatzsteuer.`,
];
const file = { name: "Werkvertrag_Hoffmann.pdf", size: 1000, type: "application/pdf" };

const baseForm: NewProject = {
  kind: "neubau",
  abmNr: null,
  hausbauNr: null,
  bauherrLabel: "",
  location: null,
  companyId: null,
  salespersonId: null,
  architectId: null,
  planerId: null,
  intakeMonth: "2026-10-01",
  vermesser: null,
  bauherr: { phone: null, email: null, address: null, buildingAddress: null },
  createFolders: true,
};

/** Kleinstes PDF mit einem Inhaltsstrom je Seite (für die Textextraktion genügt die Struktur der Ströme). */
function tinyPdf(pages: string[], compress: boolean): ArrayBuffer {
  const enc = (s: string) => Buffer.from(s, "latin1");
  const parts: Buffer[] = [enc("%PDF-1.4\n")];
  pages.forEach((text, i) => {
    const lines = text.split("\n").map((l, n) => `${n ? "0 -14 Td " : ""}(${l.replace(/[\\()]/g, "\\$&")}) Tj`);
    const content = enc(`BT /F1 11 Tf 50 780 Td ${lines.join("\n")} ET`);
    const data = compress ? deflateSync(content) : content;
    parts.push(enc(`${i + 1} 0 obj\n<< /Length ${data.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`), data, enc("\nendstream\nendobj\n"));
  });
  parts.push(enc("%%EOF"));
  const b = Buffer.concat(parts);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** ZIP mit genau einer Datei (Deflate), wie Word es schreibt. */
function tinyZip(path: string, content: string): ArrayBuffer {
  const name = Buffer.from(path);
  const raw = Buffer.from(content, "utf8");
  const data = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const b = Buffer.concat([local, name, data, central, name]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("Vertragsdatei prüfen", () => {
  it("nimmt PDF, DOCX und Bilder bis 10 MB", () => {
    expect(checkContractFile(file)).toEqual({ ok: true, kind: "pdf" });
    expect(checkContractFile({ name: "Vertrag.docx", size: 5, type: "" })).toEqual({ ok: true, kind: "docx" });
    expect(checkContractFile({ name: "scan.JPG", size: 5, type: "image/jpeg" })).toEqual({ ok: true, kind: "bild" });
    expect(checkContractFile({ ...file, size: MAX_CONTRACT_BYTES })).toMatchObject({ ok: true });
  });

  it("lehnt zu große, leere, fremde und falsch benannte Dateien ab", () => {
    expect(checkContractFile({ ...file, size: MAX_CONTRACT_BYTES + 1 })).toMatchObject({ ok: false, reason: expect.stringContaining("10 MB") });
    expect(checkContractFile({ ...file, size: 0 })).toMatchObject({ ok: false });
    expect(checkContractFile({ name: "plan.dwg", size: 5, type: "" })).toMatchObject({ ok: false });
    expect(checkContractFile({ name: "vertrag.exe", size: 5, type: "" })).toMatchObject({ ok: false });
    expect(checkContractFile({ name: "vertrag.pdf", size: 5, type: "image/png" })).toMatchObject({ ok: false });
    expect(checkContractFile({ name: "../vertrag.pdf", size: 5, type: "application/pdf" })).toMatchObject({ ok: false });
  });
});

describe("Textextraktion", () => {
  it("liest Tj und TJ aus einem Inhaltsstrom", () => {
    expect(textFromContentStream("BT (Bauherr: M\\374ller) Tj 0 -14 Td [(Tel)-300(0731)] TJ ET").trim()).toBe("Bauherr: Müller\nTel 0731");
    expect(textFromContentStream("BT (a \\(b\\) c) Tj ET").trim()).toBe("a (b) c");
  });

  it("liest Seiten aus einem PDF, komprimiert und unkomprimiert", async () => {
    for (const compress of [false, true]) {
      const pages = await pdfPages(tinyPdf(CONTRACT, compress));
      expect(pages).toHaveLength(2);
      expect(pages[0]).toContain("Bauherr: Familie Anna und Jonas Hoffmann");
      expect(pages[1]).toContain("Flurstück 412/3");
    }
  });

  it("liest Absätze aus einem DOCX", async () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Bauherr: Familie Hoffmann</w:t></w:r></w:p><w:p><w:r><w:t>M&amp;M GmbH</w:t><w:tab/><w:t>Ulm</w:t></w:r></w:p></w:body></w:document>`;
    expect(textFromDocumentXml(xml)).toBe("Bauherr: Familie Hoffmann\nM&M GmbH Ulm");
    expect(await docxText(tinyZip("word/document.xml", xml))).toBe("Bauherr: Familie Hoffmann\nM&M GmbH Ulm");
    expect(await docxText(tinyZip("anderes.xml", xml))).toBe("");
  });
});

describe("Mock-Extractor", () => {
  const draft = draftFromText(file, CONTRACT, "pdf");

  it("liefert jedes Feld mit Wert, Quelle und Sicherheit", () => {
    expect(Object.keys(draft.felder).sort()).toEqual([...DRAFT_FIELDS].sort());
    for (const k of DRAFT_FIELDS) {
      expect(draft.felder[k]).toHaveProperty("wert");
      expect(draft.felder[k]).toHaveProperty("quelle");
      expect(["hoch", "mittel", "niedrig"]).toContain(draft.felder[k].sicherheit);
    }
  });

  it("erkennt die Angaben aus dem Text, mit Seite", () => {
    const w = Object.fromEntries(DRAFT_FIELDS.map((k) => [k, draft.felder[k].wert]));
    expect(w).toMatchObject({
      bauherrLabel: "Hoffmann",
      bauherrName: "Familie Anna und Jonas Hoffmann",
      phone: "0731 000111",
      email: "hoffmann@example.com",
      address: "Lindenweg 12, 89073 Ulm",
      buildingAddress: "Am Hang 7, 89134 Blaustein",
      location: "Blaustein",
      company: db.companies[0].name,
      hausbauNr: "HB-26301",
      vermesser: "Ingenieurbüro Beispiel Vermessung",
      flurstueck: "Flurstück 412/3, Gemarkung Blaustein",
      vertragsart: "werkvertrag",
      vertragsdatum: "2026-10-02",
      honorar: "12.500,00 €",
    });
    expect(draft.felder.bauherrLabel).toMatchObject({ sicherheit: "hoch", quelle: { seite: 1, text: "Bauherr: Familie Anna und Jonas Hoffmann" } });
    expect(draft.felder.buildingAddress.quelle?.seite).toBe(2);
    expect(draft.felder.abmNr).toEqual({ wert: null, quelle: null, sicherheit: "niedrig" });
    expect(draft.hinweise).toEqual([]);
  });

  it("rät ohne Text nur aus dem Dateinamen, mit niedriger Sicherheit", () => {
    const d = draftFromText({ name: "Vermessungsvertrag_Kaiser_8260-046.jpg", size: 10, type: "image/jpeg" }, [], "dateiname");
    expect(d.felder.bauherrLabel).toMatchObject({ wert: "Kaiser", sicherheit: "niedrig", quelle: { seite: null } });
    expect(d.felder.vertragsart.wert).toBe("vermessungsvertrag");
    expect(d.felder.abmNr.wert).toBe("8260-046");
    expect(d.felder.phone.wert).toBeNull();
    expect(d.hinweise).toHaveLength(1);
    expect(draftFromText({ name: "scan.pdf", size: 10, type: "application/pdf" }, [], "dateiname").felder).toMatchObject({ bauherrLabel: { wert: null }, vertragsart: { wert: "sonstiges" } });
  });

  it("DOCX kennt keine Seiten", () => {
    expect(draftFromText(file, [CONTRACT.join("\n")], "docx").felder.bauherrLabel.quelle).toEqual({ text: "Bauherr: Familie Anna und Jonas Hoffmann", seite: null });
  });

  it("extrahiert aus einer Datei und lehnt unerlaubte ab", async () => {
    const pdf = new File([tinyPdf(CONTRACT, true)], "Werkvertrag.pdf", { type: "application/pdf" });
    const d = await mockExtractor.extract(pdf);
    expect(d.textquelle).toBe("pdf");
    expect(d.felder.bauherrLabel.wert).toBe("Hoffmann");
    const img = await mockExtractor.extract(new File([new Uint8Array(20)], "Vertrag_Kaiser.png", { type: "image/png" }));
    expect(img.textquelle).toBe("dateiname");
    expect(img.hinweise[0]).toContain("Bild");
    await expect(mockExtractor.extract(new File(["x"], "vertrag.exe"))).rejects.toThrow();
  });

  it("wandelt Datumsangaben", () => {
    expect(isoDate("2.10.2026")).toBe("2026-10-02");
    expect(isoDate("32.13.2026")).toBeNull();
  });
});

describe("Schalter für den Extractor", () => {
  it("nimmt den Mock, solange nicht ausdrücklich edge gesetzt ist", () => {
    expect(extractorKind({})).toBe("mock");
    expect(extractorKind({ VITE_PROJECT_EXTRACTOR: "irgendwas" })).toBe("mock");
    expect(extractorKind({ VITE_PROJECT_EXTRACTOR: "edge" })).toBe("edge");
    expect(getExtractor("mock").name).toBe("mock");
  });

  it("edge ist nur vorbereitet und sendet nichts", async () => {
    expect(getExtractor("edge")).toBe(edgeExtractor);
    await expect(edgeExtractor.extract(new File(["x"], "v.pdf"))).rejects.toThrow(/nicht freigeschaltet/);
  });
});

describe("Entwurf ins Formular", () => {
  const draft = draftFromText(file, CONTRACT, "pdf");

  it("gleicht Firma und Verkäufer mit den Stammdaten ab und hängt das Flurstück an die Bauadresse", () => {
    const { form, unmatched } = applyDraft(draft, baseForm, db);
    expect(form).toMatchObject({
      bauherrLabel: "Hoffmann",
      companyId: db.companies[0].id,
      hausbauNr: "HB-26301",
      location: "Blaustein",
      vermesser: "Ingenieurbüro Beispiel Vermessung",
      intakeMonth: "2026-10-01",
      bauherr: { name: "Familie Anna und Jonas Hoffmann", phone: "0731 000111", buildingAddress: "Am Hang 7, 89134 Blaustein (Flurstück 412/3, Gemarkung Blaustein)" },
    });
    expect(form.salespersonId).toBe(db.salespeople.find((s) => s.companyId === db.companies[0].id)!.id);
    expect(unmatched).toEqual({});
  });

  it("legt unbekannte Firmen nicht an, sondern meldet sie", () => {
    const other = draftFromText(file, ["Bauherr: Herr Max Beispiel\nHausbaufirma: Unbekannt Haus GmbH\nVerkäufer: Tom Fremd"], "pdf");
    const { form, unmatched } = applyDraft(other, baseForm, db);
    expect(form.companyId).toBeNull();
    expect(form.salespersonId).toBeNull();
    expect(unmatched).toEqual({ company: "Unbekannt Haus GmbH", salesperson: "Tom Fremd" });
  });
});

describe("Duplikatprüfung", () => {
  const p = db.projects.find((x) => x.status === "aktiv" && db.bauherren.some((b) => b.projectId === x.id && b.buildingAddress))!;
  const addr = db.bauherren.find((b) => b.projectId === p.id)!.buildingAddress!;

  it("findet denselben Bauherrn, unabhängig von Groß- und Kleinschreibung", () => {
    const hits = similarProjects({ bauherrLabel: p.bauherrLabel.toUpperCase(), buildingAddress: null }, db.projects, db.bauherren);
    expect(hits.map((h) => h.project.id)).toContain(p.id);
    expect(hits.find((h) => h.project.id === p.id)!.grund).toBe("bauherr");
  });

  it("findet dieselbe Bauadresse und dasselbe Flurstück", () => {
    const byAddr = similarProjects({ bauherrLabel: "Ganzanders", buildingAddress: `${addr.replace("weg", "weg ")} (Flurstück 1/2)` }, db.projects, db.bauherren);
    expect(byAddr.find((h) => h.project.id === p.id)?.grund).toBe("adresse");
    const withFlur = [{ projectId: p.id, name: "x", address: null, phone: null, email: null, buildingAddress: "Wiese (Flurstück 412/3)" }];
    expect(similarProjects({ bauherrLabel: "Ganzanders", buildingAddress: "Am Hang 7 (Flurstück 412/3, Gemarkung Blaustein)" }, db.projects, withFlur).map((h) => h.project.id)).toEqual([p.id]);
    expect(similarProjects({ bauherrLabel: p.bauherrLabel, buildingAddress: addr }, db.projects, db.bauherren).find((h) => h.project.id === p.id)?.grund).toBe("beides");
  });

  it("meldet nichts bei neuen Angaben, leerem Namen oder stornierten Projekten", () => {
    expect(similarProjects({ bauherrLabel: "Ganzanders", buildingAddress: "Nirgendwo 1, 00000 Ort" }, db.projects, db.bauherren)).toEqual([]);
    expect(similarProjects({ bauherrLabel: "", buildingAddress: null }, db.projects, db.bauherren)).toEqual([]);
    const storno = db.projects.map((x) => (x.id === p.id ? { ...x, status: "storno" as const } : x));
    expect(similarProjects({ bauherrLabel: p.bauherrLabel, buildingAddress: null }, storno, []).map((h) => h.project.id)).not.toContain(p.id);
  });
});
