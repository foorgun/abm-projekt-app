import { deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../../data/demoData";
import type { NewProject } from "../repo";
import { applyDraft, cleanMeta, similarProjects } from "./applyDraft";
import { checkContractFile, MAX_CONTRACT_BYTES } from "./contractFile";
import { CONTRACT_FOLDER, contractFolder } from "./filing";
import { SCAN_WERKVERTRAG_FELDER, textPdf, VORLAGE_VERMESSUNG_ZEILEN, vorlageVermessungFile } from "./fixtures";
import { createEdgeExtractor, extractorKind, getExtractor } from "./index";
import { createMockExtractor, draftFromText, isoDate, mockExtractor, splitName } from "./mockExtractor";
import { fitInside, toExtractImage } from "./pageImage";
import { docxText, pdfPages, textFromContentStream, textFromDocumentXml } from "./readText";
import { DRAFT_FIELDS, emptyDraft, emptyFields, ExtractUnavailable, foerderFrist, normalizeFields, type ExtractResponse } from "./types";

const TODAY = "2026-10-09";
const db = buildDemoDataset(TODAY);

// Erfundener Vertragstext mit Textebene (keine echten Personen)
const CONTRACT = [
  `Werkvertrag über die Errichtung eines Hauses
Vertragsdatum: 02.10.2026
1. Bauherr (Name, Vorname): Hoffmann, Jonas
2. Bauherr (Name, Vorname): Hoffmann, Anna
[x] Eheleute
Anschrift: Lindenweg 12, 89073 Ulm
Telefon: 0731 000111
E-Mail: hoffmann@example.com
Auftragnehmer: ${db.companies[0].name}
Angebot Nr.: A-2026-0417
Haustyp: Beispielhaus 140
Vertragspreis: 312.450,00 €
[x] KfW/WEF-Förderung wird beantragt
Geburtsdatum: 01.01.1990
Beruf: Lehrer`,
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

/** PDF nur aus Inhaltsströmen (für die Textextraktion genügt das), wahlweise komprimiert. */
function streamPdf(pages: string[], compress: boolean): ArrayBuffer {
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
      const pages = await pdfPages(streamPdf(["Seite eins\nBauherr: Hoffmann", "Seite zwei\nFlurstück 412/3"], compress));
      expect(pages).toEqual(["Seite eins\nBauherr: Hoffmann", "Seite zwei\nFlurstück 412/3"]);
    }
  });

  it("liest Absätze aus einem DOCX", async () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Bauherr: Familie Hoffmann</w:t></w:r></w:p><w:p><w:r><w:t>M&amp;M GmbH</w:t><w:tab/><w:t>Ulm</w:t></w:r></w:p></w:body></w:document>`;
    expect(textFromDocumentXml(xml)).toBe("Bauherr: Familie Hoffmann\nM&M GmbH Ulm");
    expect(await docxText(tinyZip("word/document.xml", xml))).toBe("Bauherr: Familie Hoffmann\nM&M GmbH Ulm");
    expect(await docxText(tinyZip("anderes.xml", xml))).toBe("");
  });
});

describe("Felder in fester Form (normalizeFields)", () => {
  it("lässt nur bekannte Felder, gültige Sicherheit und nicht leere Werte zu", () => {
    const f = normalizeFields({ bauherrLabel: { wert: " Hoffmann ", quelle: { text: "x", seite: 1 }, sicherheit: "hoch" }, phone: { wert: "", sicherheit: "hoch" }, geburtsdatum: { wert: "01.01.1990", sicherheit: "hoch" }, email: { wert: "a@example.com", sicherheit: "sehr hoch" } }, false);
    expect(Object.keys(f).sort()).toEqual([...DRAFT_FIELDS].sort());
    expect(f.bauherrLabel).toEqual({ wert: "Hoffmann", quelle: { text: "x", seite: 1 }, sicherheit: "hoch" });
    expect(f.phone.wert).toBeNull();
    expect(f.email.sicherheit).toBe("niedrig");
    expect("geburtsdatum" in f).toBe(false);
    expect(f.vertragsart.wert).toBe("sonstiges");
  });

  it("begrenzt Scans auf höchstens mittel", () => {
    const f = normalizeFields({ bauherrLabel: { wert: "Hoffmann", sicherheit: "hoch" }, phone: { wert: "0731", sicherheit: "niedrig" } }, true);
    expect(f.bauherrLabel.sicherheit).toBe("mittel");
    expect(f.phone.sicherheit).toBe("niedrig");
  });

  it("verwirft im Werkvertrag alles zum Baugrundstück, in anderen Dokumenten nicht", () => {
    const site = { buildingAddress: { wert: "Am Hang 7, 89134 Blaustein", sicherheit: "hoch" }, location: { wert: "Blaustein", sicherheit: "hoch" }, flurstueck: { wert: "412/3", sicherheit: "hoch" }, gemarkung: { wert: "Blaustein", sicherheit: "hoch" } };
    const werk = normalizeFields({ ...site, vertragsart: { wert: "werkvertrag", sicherheit: "hoch" } }, false);
    expect([werk.buildingAddress.wert, werk.location.wert, werk.flurstueck.wert, werk.gemarkung.wert]).toEqual([null, null, null, null]);
    const verm = normalizeFields({ ...site, vertragsart: { wert: "vermessungsvertrag", sicherheit: "hoch" } }, false);
    expect(verm.flurstueck.wert).toBe("412/3");
  });

  it("nimmt nur ein gültiges Vertragsdatum und nur 'ja' als Förderhinweis", () => {
    const f = normalizeFields({ vertragsdatum: { wert: "02.10.2026", sicherheit: "hoch" }, foerderung: { wert: "nein", sicherheit: "hoch" } }, false);
    expect(f.vertragsdatum.wert).toBeNull();
    expect(f.foerderung.wert).toBeNull();
  });

  it("rechnet die Förderfrist: 15 Monate ab Vertragsdatum", () => {
    expect(foerderFrist("2026-10-02")).toBe("2028-01-02");
    expect(foerderFrist(null)).toBeNull();
    expect(foerderFrist("02.10.2026")).toBeNull();
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

  it("erkennt beide Bauherren, Kontakt und die Metadaten des Vertrags", () => {
    const w = Object.fromEntries(DRAFT_FIELDS.map((k) => [k, draft.felder[k].wert]));
    expect(w).toMatchObject({
      bauherrLabel: "Hoffmann",
      bauherrName: "Jonas Hoffmann",
      bauherr2Name: "Anna Hoffmann",
      rechtsform: "Eheleute",
      phone: "0731 000111",
      email: "hoffmann@example.com",
      address: "Lindenweg 12, 89073 Ulm",
      company: db.companies[0].name,
      vertragsart: "werkvertrag",
      vertragsdatum: "2026-10-02",
      vertragspreis: "312.450,00 €",
      angebotsnummer: "A-2026-0417",
      haustyp: "Beispielhaus 140",
      foerderung: "ja",
    });
    expect(draft.felder.bauherrLabel).toMatchObject({ sicherheit: "hoch", quelle: { seite: 1, text: "1. Bauherr (Name, Vorname): Hoffmann, Jonas" } });
  });

  it("leitet aus dem Werkvertrag keine Bauadresse ab: die Anschrift ist die Wohnanschrift", () => {
    expect(draft.felder.buildingAddress.wert).toBeNull();
    expect(draft.felder.location.wert).toBeNull();
    expect(draft.felder.flurstueck.wert).toBeNull();
    expect(draft.felder.gemarkung.wert).toBeNull();
  });

  it("kennt weder Geburtsdatum noch Beruf noch Hausbau-Nr.", () => {
    expect(DRAFT_FIELDS.join(" ")).not.toMatch(/geburt|beruf|hausbau/i);
    expect(JSON.stringify(draft.felder)).not.toMatch(/1990|Lehrer/);
  });

  it("teilt Namen: 'Nachname, Vorname' und 'Familie Vorname Nachname'", () => {
    expect(splitName("Hoffmann, Jonas")).toEqual({ label: "Hoffmann", name: "Jonas Hoffmann" });
    expect(splitName("Familie Anna und Jonas Hoffmann")).toEqual({ label: "Hoffmann", name: "Anna und Jonas Hoffmann" });
  });

  it("DOCX kennt keine Seiten", () => {
    expect(draftFromText(file, CONTRACT, "docx").felder.bauherrLabel.quelle?.seite).toBeNull();
  });

  it("wandelt Datumsangaben", () => {
    expect(isoDate("2.10.2026")).toBe("2026-10-02");
    expect(isoDate("32.13.2026")).toBeNull();
  });
});

describe("Beispiel a: Scan ohne Textebene", () => {
  const scan = () => new File([new Uint8Array(2000).fill(7)], "Scan_Werkvertrag_Beispiel.jpg", { type: "image/jpeg" });

  it("liefert im Demo-Modus die erfundenen Beispielwerte, höchstens mit Sicherheit mittel, und sagt das dazu", async () => {
    const d = await createMockExtractor({ demo: true }).extract(scan());
    expect(d).toMatchObject({ textquelle: "bild", gescannt: true, extractor: "mock" });
    expect(d.felder.bauherrLabel.wert).toBe("Hoffmann");
    expect(d.felder.bauherr2Name.wert).toBe("Anna Hoffmann");
    expect(d.felder.vertragsart.wert).toBe("werkvertrag");
    expect(d.felder.buildingAddress.wert).toBeNull();
    expect(DRAFT_FIELDS.every((k) => d.felder[k].sicherheit !== "hoch")).toBe(true);
    expect(d.hinweise[0]).toMatch(/Demo.*erfundene Beispielwerte/);
  });

  it("erfindet außerhalb des Demo-Modus nichts: nur der Dateiname, niedrige Sicherheit", async () => {
    const d = await mockExtractor.extract(new File([new Uint8Array(2000)], "Werkvertrag_Kaiser.png", { type: "image/png" }));
    expect(d).toMatchObject({ textquelle: "dateiname", gescannt: true });
    expect(d.felder.bauherrLabel).toMatchObject({ wert: "Kaiser", sicherheit: "niedrig", quelle: { seite: null } });
    expect(d.felder.vertragsart.wert).toBe("werkvertrag");
    expect(d.felder.phone.wert).toBeNull();
    expect(d.hinweise.join(" ")).toMatch(/kein lesbarer Text/);
    await expect(mockExtractor.extract(new File(["x"], "vertrag.exe"))).rejects.toThrow();
  });

  it("die Beispielwerte halten sich an die Regeln (keine Bauadresse, keine Hausbau-Nr.)", () => {
    const keys = Object.keys(SCAN_WERKVERTRAG_FELDER);
    expect(keys.every((k) => (DRAFT_FIELDS as readonly string[]).includes(k))).toBe(true);
    expect(keys).not.toContain("buildingAddress");
    expect(keys).not.toContain("flurstueck");
  });
});

describe("Beispiel b: leere Vorlage mit Formularfeldern", () => {
  it("ist ein gültiges kleines PDF mit Textebene", async () => {
    const pages = await pdfPages(textPdf(VORLAGE_VERMESSUNG_ZEILEN).buffer as ArrayBuffer);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("Vermessungsauftrag");
    expect(new TextDecoder("latin1").decode(textPdf(["x"]))).toMatch(/^%PDF-1\.4[\s\S]*startxref\n\d+\n%%EOF$/);
  });

  it("erkennt die Vorlage: Typ und Büro aus dem Briefkopf, sonst nichts, mit Hinweis", async () => {
    const d = await createMockExtractor({ demo: true }).extract(vorlageVermessungFile());
    expect(d).toMatchObject({ textquelle: "pdf", gescannt: false });
    expect(d.felder.vertragsart.wert).toBe("vermessungsvertrag");
    expect(d.felder.vermesser.wert).toBe("Vermessungsbüro Beispiel");
    for (const k of ["bauherrLabel", "bauherrName", "phone", "email", "address", "buildingAddress", "flurstueck", "gemarkung"] as const) expect(d.felder[k].wert, k).toBeNull();
    expect(d.hinweise.join(" ")).toMatch(/leeren Vorlage/);
  });
});

describe("Schalter und Edge-Extractor", () => {
  const felder = { ...emptyFields(), bauherrLabel: { wert: "Hoffmann", quelle: { text: "1. Bauherr", seite: 1 }, sicherheit: "hoch" as const }, haustyp: { wert: "Beispielhaus 140", quelle: { text: "Haustyp", seite: 2 }, sicherheit: "hoch" as const }, vertragsart: { wert: "werkvertrag", quelle: null, sicherheit: "hoch" as const } };
  const render = async (_f: File, _k: string, pages: number[]) => ({ pageCount: 12, pages: pages.map((page) => ({ page, dataUrl: `data:image/jpeg;base64,${"A".repeat(200)}`, width: 10, height: 10 })) });
  const scan = () => new File([new Uint8Array(500).fill(1)], "scan.jpg", { type: "image/jpeg" });

  it("nimmt den Mock, solange nicht ausdrücklich edge gesetzt ist, und im Demo-Modus immer", () => {
    expect(extractorKind({})).toBe("mock");
    expect(extractorKind({ VITE_PROJECT_EXTRACTOR: "irgendwas" })).toBe("mock");
    expect(extractorKind({ VITE_PROJECT_EXTRACTOR: "edge" })).toBe("edge");
    const call = async (): Promise<ExtractResponse> => ({ ok: true, felder, hinweise: [] });
    expect(getExtractor({ demo: false, kind: "mock", call }).name).toBe("mock");
    expect(getExtractor({ demo: false, kind: "edge", call }).name).toBe("edge");
    expect(getExtractor({ demo: true, kind: "edge", call }).name).toBe("mock");
    expect(getExtractor({ demo: false, kind: "edge" }).name).toBe("mock");
  });

  it("sendet nur Seite 1, auf Wunsch zusätzlich die Plan-Seite, nie mehr als zwei Bilder", async () => {
    const sent: number[] = [];
    const edge = createEdgeExtractor({ call: async (r) => (sent.push(r.images.length), { ok: true, felder, hinweise: [] }), render, fallback: mockExtractor });
    const d = await edge.extract(scan());
    await edge.extract(scan(), { planPage: 7 });
    expect(sent).toEqual([1, 2]);
    expect(d).toMatchObject({ extractor: "edge", textquelle: "bild", gescannt: true });
    // Scan: höchstens mittel
    expect(d.felder.bauherrLabel.sicherheit).toBe("mittel");
  });

  it("rechnet die Bildnummer der Quelle auf die Seite im Dokument um", async () => {
    const edge = createEdgeExtractor({ call: async () => ({ ok: true, felder, hinweise: [] }), render, fallback: mockExtractor });
    const d = await edge.extract(scan(), { planPage: 7 });
    expect(d.felder.bauherrLabel.quelle?.seite).toBe(1);
    expect(d.felder.haustyp.quelle?.seite).toBe(7);
  });

  it("meldet 'nicht freigeschaltet', Limits und Ausfälle so, dass die manuelle Anlage angeboten werden kann", async () => {
    for (const [code, message] of [["disabled", "Auslesung noch nicht freigeschaltet."], ["limit", "Tageslimit erreicht"]] as const) {
      const edge = createEdgeExtractor({ call: async () => ({ ok: false, code, message }), render, fallback: mockExtractor });
      await expect(edge.extract(scan())).rejects.toMatchObject({ name: "ExtractUnavailable", code, message });
    }
    const broken = createEdgeExtractor({ call: async () => Promise.reject(new Error("Netz weg")), render, fallback: mockExtractor });
    await expect(broken.extract(scan())).rejects.toBeInstanceOf(ExtractUnavailable);
    const noImage = createEdgeExtractor({ call: async () => ({ ok: true, felder, hinweise: [] }), render: async () => null, fallback: mockExtractor });
    await expect(noImage.extract(scan())).rejects.toMatchObject({ code: "error" });
    const empty = emptyDraft({ name: "scan.jpg", size: 1, type: "image/jpeg" }, "edge", ["Hinweis"]);
    expect(empty).toMatchObject({ textquelle: "ohne", hinweise: ["Hinweis"] });
    expect(empty.felder.vertragsart.wert).toBe("sonstiges");
  });

  it("liest DOCX lokal (kein Seitenbild, kein Aufruf)", async () => {
    let called = 0;
    const edge = createEdgeExtractor({ call: async () => (called++, { ok: true, felder, hinweise: [] }), render, fallback: mockExtractor });
    const xml = `<w:document><w:body><w:p><w:r><w:t>Bauherr: Familie Hoffmann</w:t></w:r></w:p></w:body></w:document>`;
    const d = await edge.extract(new File([tinyZip("word/document.xml", xml)], "Vertrag.docx"));
    expect(called).toBe(0);
    expect(d.felder.bauherrLabel.wert).toBe("Hoffmann");
  });

  it("verkleinert Bilder auf höchstens 1600 px und zerlegt data:-URLs", () => {
    expect(fitInside(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitInside(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(toExtractImage("data:image/png;base64,QUJD")).toEqual({ mediaType: "image/png", data: "QUJD" });
    expect(() => toExtractImage("data:image/gif;base64,QUJD")).toThrow();
  });
});

describe("Entwurf ins Formular", () => {
  const draft = draftFromText(file, CONTRACT, "pdf");

  it("gleicht die Hausbaufirma mit den Stammdaten ab und trennt Projektfelder von Metadaten", () => {
    const { form, meta, unmatched } = applyDraft(draft, { ...baseForm, hausbauNr: null }, db);
    expect(form).toMatchObject({
      bauherrLabel: "Hoffmann",
      companyId: db.companies[0].id,
      hausbauNr: null,
      abmNr: null,
      location: null,
      flurstueck: null,
      gemarkung: null,
      intakeMonth: "2026-10-01",
      bauherr: { name: "Jonas Hoffmann", phone: "0731 000111", address: "Lindenweg 12, 89073 Ulm", buildingAddress: null, name2: "Anna Hoffmann", phone2: null, email2: null },
    });
    expect(meta).toEqual({ vertragsdatum: "2026-10-02", vertragspreis: "312.450,00 €", angebotsnummer: "A-2026-0417", haustyp: "Beispielhaus 140" });
    expect(unmatched).toEqual({});
    // der Vertragspreis ist kein Projektfeld und belegt nichts vor
    expect(JSON.stringify(form)).not.toContain("312.450");
  });

  it("legt unbekannte Firmen nicht an, sondern meldet sie", () => {
    const other = draftFromText(file, ["Bauherr: Herr Max Beispiel\nAuftragnehmer: Unbekannt Haus GmbH"], "pdf");
    const { form, unmatched } = applyDraft(other, baseForm, db);
    expect(form.companyId).toBeNull();
    expect(unmatched).toEqual({ company: "Unbekannt Haus GmbH" });
  });

  it("säubert Metadaten für die Ablage", () => {
    expect(cleanMeta({ vertragsdatum: " 2026-10-02 ", vertragspreis: "", haustyp: "  " })).toEqual({ vertragsdatum: "2026-10-02" });
  });
});

describe("Zielordner je Dokumenttyp", () => {
  it("Werkvertrag nach 00 Verträge, Vermessungsvertrag nach 04 Vermesser", () => {
    expect(contractFolder("werkvertrag", db.folderTemplates)).toBe("00 Verträge");
    expect(contractFolder("vermessungsvertrag", db.folderTemplates)).toBe("04 Vermesser");
    expect(contractFolder("sonstiges", db.folderTemplates)).toBe(CONTRACT_FOLDER.sonstiges);
  });

  it("meldet klar, wenn der Ordner in der Vorlage fehlt", () => {
    expect(() => contractFolder("werkvertrag", db.folderTemplates.filter((t) => t.path !== "00 Verträge"))).toThrow(/00 Verträge/);
  });
});

describe("Duplikatprüfung", () => {
  const p = db.projects.find((x) => x.status === "aktiv" && db.bauherren.some((b) => b.projectId === x.id && b.buildingAddress))!;
  const addr = db.bauherren.find((b) => b.projectId === p.id)!.buildingAddress!;
  const ids = (hits: ReturnType<typeof similarProjects>) => hits.map((h) => h.project.id);

  it("findet denselben Bauherrn, unabhängig von Groß- und Kleinschreibung", () => {
    const hits = similarProjects({ bauherrLabel: p.bauherrLabel.toUpperCase(), buildingAddress: null }, db.projects, db.bauherren);
    expect(hits.find((h) => h.project.id === p.id)!.gruende).toEqual(["bauherr"]);
  });

  it("findet dieselbe Bauadresse", () => {
    const hits = similarProjects({ bauherrLabel: "Ganzanders", buildingAddress: addr.replace(/(str\.|straße)/i, "Strasse") }, db.projects, db.bauherren);
    expect(hits.find((h) => h.project.id === p.id)?.gruende).toEqual(["adresse"]);
    expect(similarProjects({ bauherrLabel: p.bauherrLabel, buildingAddress: addr }, db.projects, db.bauherren).find((h) => h.project.id === p.id)?.gruende).toEqual(["bauherr", "adresse"]);
  });

  it("findet dasselbe Flurstück; die Gemarkung muss passen, wenn beide eine nennen", () => {
    const withParcel = db.projects.map((x) => (x.id === p.id ? { ...x, flurstueck: "Flst. 412/3", gemarkung: "Blaustein" } : x));
    const q = { bauherrLabel: "Ganzanders", buildingAddress: null };
    expect(ids(similarProjects({ ...q, flurstueck: "412 / 3", gemarkung: "blaustein" }, withParcel, []))).toEqual([p.id]);
    expect(ids(similarProjects({ ...q, flurstueck: "412/3" }, withParcel, []))).toEqual([p.id]);
    expect(similarProjects({ ...q, flurstueck: "412/3", gemarkung: "Söflingen" }, withParcel, [])).toEqual([]);
    expect(similarProjects({ ...q, flurstueck: "412/4", gemarkung: "Blaustein" }, withParcel, [])).toEqual([]);
  });

  it("meldet nichts bei neuen Angaben, leerem Namen oder stornierten Projekten", () => {
    expect(similarProjects({ bauherrLabel: "Ganzanders", buildingAddress: "Nirgendwo 1, 00000 Ort" }, db.projects, db.bauherren)).toEqual([]);
    expect(similarProjects({ bauherrLabel: "", buildingAddress: null, flurstueck: "" }, db.projects, db.bauherren)).toEqual([]);
    const storno = db.projects.map((x) => (x.id === p.id ? { ...x, status: "storno" as const } : x));
    expect(ids(similarProjects({ bauherrLabel: p.bauherrLabel, buildingAddress: null }, storno, []))).not.toContain(p.id);
  });
});
