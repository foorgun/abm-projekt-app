// Mehrere Dokumente beim Anlegen eines Projekts: Schema je Art, Zusammenführen, Ablauf je Datei, Grenzen.
import { describe, expect, it, vi } from "vitest";
import { initialJob, readDocuments, type JobState } from "./batch";
import { checkContractFile, MAX_CONTRACT_BYTES } from "./contractFile";
import { mergeDrafts, sameValueKey, type MergeInput } from "./merge";
import { FIELDS_BY_TYPE as EDGE_FIELDS_BY_TYPE, DOC_TYPES } from "../../../supabase/functions/extract-project/logic";
import { draftFromText } from "./mockExtractor";
import { emptyFields, ExtractUnavailable, FIELDS_BY_TYPE, normalizeFields, restrictToType, VERTRAGSARTEN, type DraftField, type DraftFieldKey, type ProjectDraft, type Vertragsart } from "./types";
import { VERMESSERVERTRAG_ZEILEN } from "./fixtures";

const field = (wert: string, sicherheit: DraftField["sicherheit"] = "mittel", text = "Stelle", seite = 1): DraftField => ({ wert, quelle: { text, seite }, sicherheit });

function doc(id: string, art: Vertragsart, felder: Partial<Record<DraftFieldKey, DraftField>>, hinweise: string[] = []): MergeInput {
  const f = { ...emptyFields(), ...felder, vertragsart: field(art, "hoch") };
  const draft: ProjectDraft = { datei: { name: `${id}.pdf`, size: 1000, type: "application/pdf" }, textquelle: "bild", extractor: "edge", gescannt: false, felder: restrictToType(f, art), hinweise };
  return { id, art, draft };
}

describe("Schema je Dokumentart", () => {
  it("App und Edge Function haben dieselben Arten und dasselbe Schema", () => {
    expect([...VERTRAGSARTEN].sort()).toEqual([...DOC_TYPES].sort());
    for (const art of VERTRAGSARTEN) expect([...FIELDS_BY_TYPE[art]].sort(), art).toEqual([...EDGE_FIELDS_BY_TYPE[art]].sort());
  });

  it("Werkvertrag: Bauherr und Vertragsdaten, nie das Grundstück; Vermesservertrag: Grundstück, nie die Hausbaufirma", () => {
    const all = Object.fromEntries((Object.keys(emptyFields()) as DraftFieldKey[]).map((k) => [k, field(k === "vertragsdatum" ? "2026-10-02" : `x-${k}`)]));
    const w = normalizeFields(all, false, "werkvertrag");
    expect(w.bauherrLabel.wert).toBe("x-bauherrLabel");
    expect(w.vertragsdatum.wert).toBe("2026-10-02");
    for (const k of ["buildingAddress", "location", "flurstueck", "gemarkung", "vermesser"] as const) expect(w[k].wert, k).toBeNull();
    const v = normalizeFields(all, false, "vermessungsvertrag");
    expect(v.flurstueck.wert).toBe("x-flurstueck");
    expect(v.vermesser.wert).toBe("x-vermesser");
    for (const k of ["company", "haustyp", "bauherr2Name"] as const) expect(v[k].wert, k).toBeNull();
    // feststehende Art geht vor der erkannten
    expect(normalizeFields({ vertragsart: field("werkvertrag") }, false, "baugrundauftrag").vertragsart.wert).toBe("baugrundauftrag");
    expect(normalizeFields({ vertragsart: field("quatsch") }, false).vertragsart.wert).toBe("sonstiges");
  });

  it("der Mock erkennt den Vermesservertrag und liest Grundstück und Bauort", () => {
    const d = draftFromText({ name: "v.pdf", size: 1, type: "application/pdf" }, [VERMESSERVERTRAG_ZEILEN.join("\n")], "pdf");
    expect(d.felder.vertragsart.wert).toBe("vermessungsvertrag");
    expect(d.felder.flurstueck.wert).toBe("1234/5");
    expect(d.felder.gemarkung.wert).toBe("Bermaringen");
    expect(d.felder.location.wert).toBe("Blaustein");
    expect(d.seiten).toEqual({ gelesen: [1], gesamt: 1 });
  });
});

describe("Zwei Dokumente zusammenführen", () => {
  const werk = doc("w", "werkvertrag", {
    bauherrLabel: field("Hoffmann", "mittel"),
    bauherrName: field("Jonas Hoffmann"),
    phone: field("0731 000111", "niedrig"),
    address: field("Lindenweg 12, 89073 Ulm"),
    company: field("Bien-Zenker"),
    vertragsdatum: field("2026-10-02"),
  });
  const verm = doc("v", "vermessungsvertrag", {
    bauherrLabel: field("HOFFMANN", "hoch"),
    phone: field("+49 731 000119", "hoch"),
    address: field("Lindenweg 12,  89073 Ulm"),
    buildingAddress: field("Am Hölzle 12, 89134 Blaustein"),
    location: field("Blaustein"),
    flurstueck: field("1234/5"),
    vertragsdatum: field("2026-10-05"),
  });

  it("gleicher Wert: übernommen, ohne Auswahl, mit der höchsten Sicherheit und Quelle", () => {
    const m = mergeDrafts([werk, verm]);
    expect(m.felder.bauherrLabel.wert).toBe("Hoffmann");
    expect(m.felder.bauherrLabel.sicherheit).toBe("hoch");
    expect(m.felder.bauherrLabel.quelle).toMatchObject({ dokumentId: "w", dokumentArt: "werkvertrag" });
    expect(m.felder.address.wert).toBe("Lindenweg 12, 89073 Ulm");
    expect(m.conflicts.bauherrLabel).toBeUndefined();
    expect(m.conflicts.address).toBeUndefined();
  });

  it("nur in einem Dokument: übernommen mit Quelle dieses Dokuments", () => {
    const m = mergeDrafts([werk, verm]);
    expect(m.felder.flurstueck).toMatchObject({ wert: "1234/5", quelle: { dokumentId: "v", dokumentArt: "vermessungsvertrag" } });
    expect(m.felder.company).toMatchObject({ wert: "Bien-Zenker", quelle: { dokumentArt: "werkvertrag" } });
  });

  it("abweichender Wert: beide Varianten mit Quelle, Vorschlag aus dem passenden Dokument", () => {
    const m = mergeDrafts([verm, werk]); // Reihenfolge der Dateien spielt für den Vorschlag keine Rolle
    expect(m.conflicts.phone?.map((o) => [o.wert, o.art])).toEqual([
      ["0731 000111", "werkvertrag"],
      ["+49 731 000119", "vermessungsvertrag"],
    ]);
    expect(m.felder.phone.wert).toBe("0731 000111");
    // Grundstück: der Vermesservertrag gilt zuerst
    const other = doc("h", "honorarvereinbarung", { location: field("Ulm") });
    const m2 = mergeDrafts([other, verm]);
    expect(m2.conflicts.location?.map((o) => o.art)).toEqual(["vermessungsvertrag", "honorarvereinbarung"]);
    expect(m2.felder.location.wert).toBe("Blaustein");
  });

  it("Vertragsdaten bleiben beim Dokument und werden nicht verglichen", () => {
    const m = mergeDrafts([werk, verm]);
    expect(m.conflicts.vertragsdatum).toBeUndefined();
    expect(m.felder.vertragsdatum.wert).toBeNull();
  });

  it("Vergleich ignoriert Schreibweise, Leerzeichen und bei Telefon die Vorwahl +49", () => {
    expect(sameValueKey("bauherrLabel", "Hoffmann")).toBe(sameValueKey("bauherrLabel", " HOFFMANN "));
    expect(sameValueKey("phone", "+49 731 000111")).toBe(sameValueKey("phone", "0731/000111"));
    expect(sameValueKey("phone", "0731 000111")).not.toBe(sameValueKey("phone", "0731 000119"));
  });

  it("Hinweise tragen bei mehreren Dokumenten die Art", () => {
    const m = mergeDrafts([doc("a", "werkvertrag", {}, ["Telefon schwer lesbar."]), doc("b", "vermessungsvertrag", {}, ["Leere Vorlage."])]);
    expect(m.hinweise).toEqual(["Werkvertrag: Telefon schwer lesbar.", "Vermesservertrag: Leere Vorlage."]);
  });
});

describe("Ablauf mit mehreren Dateien", () => {
  const pdf = (name: string, size = 2000) => {
    const f = new File(["%PDF-1.4"], name, { type: "application/pdf" });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };
  const draftFor = (art: Vertragsart): ProjectDraft => ({ ...doc("x", art, { bauherrLabel: field("Hoffmann") }).draft });

  function setup(extract: (file: File) => Promise<ProjectDraft>) {
    let n = 0;
    const deps = {
      save: vi.fn(async () => ({ fileId: `f${++n}` })),
      extract: vi.fn(async (file: File, _opts?: { draftFileId: string }) => extract(file)),
      record: vi.fn(async () => undefined),
      concurrency: 2,
    };
    return deps;
  }
  const run = (files: File[], deps: ReturnType<typeof setup>) => readDocuments(files, files.map((f, i) => initialJob(f, `k${i}`)), deps);

  it("Datei über 30 MB wird abgelehnt: nicht gespeichert, nicht ausgelesen, Meldung mit Größe", async () => {
    expect(MAX_CONTRACT_BYTES).toBe(30 * 1024 * 1024);
    expect(checkContractFile({ name: "a.pdf", type: "application/pdf", size: MAX_CONTRACT_BYTES })).toMatchObject({ ok: true });
    const big = pdf("gross.pdf", MAX_CONTRACT_BYTES + 1);
    const deps = setup(async () => draftFor("werkvertrag"));
    const [rejected, ok] = await run([big, pdf("werk.pdf")], deps);
    expect(rejected).toMatchObject({ phase: "abgelehnt", fileId: null, error: expect.stringContaining("größer als 30 MB (30,0 MB)") });
    expect(ok.phase).toBe("fertig");
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });

  it("eine Datei scheitert: die anderen behalten ihr Ergebnis, die Datei bleibt gespeichert, die Meldung nennt den Grund", async () => {
    const deps = setup(async (file) => {
      if (file.name === "kaputt.pdf") throw new ExtractUnavailable("Die Datei ließ sich nicht als Bild darstellen (beschädigt oder mit Passwort geschützt?).", "error");
      return draftFor(file.name.startsWith("verm") ? "vermessungsvertrag" : "werkvertrag");
    });
    const res = await run([pdf("werk.pdf"), pdf("kaputt.pdf"), pdf("verm.pdf")], deps);
    expect(res.map((r) => [r.name, r.phase, r.art])).toEqual([
      ["werk.pdf", "fertig", "werkvertrag"],
      ["kaputt.pdf", "fehler", "sonstiges"],
      ["verm.pdf", "fertig", "vermessungsvertrag"],
    ]);
    expect(res[1]).toMatchObject({ fileId: "f2", error: expect.stringContaining("beschädigt") });
    expect(deps.save).toHaveBeenCalledTimes(3);
    expect(deps.record).toHaveBeenCalledWith("f2", { status: "fehler", error: expect.stringContaining("beschädigt") });
    expect(deps.record).toHaveBeenCalledWith("f1", expect.objectContaining({ status: "ausgelesen", docType: "werkvertrag" }));
  });

  it("Zähler pro Dokument: jede Datei ist ein eigener Aufruf; ab dem Limit scheitern nur die übrigen, verständlich", async () => {
    let used = 18; // heute schon 18 von 20
    const deps = setup(async () => {
      if (used >= 20) throw new ExtractUnavailable("Dein Tageslimit ist erreicht: 20 ausgelesene Dokumente pro Person und Tag (jedes Dokument zählt einzeln).", "limit");
      used++;
      return draftFor("sonstiges");
    });
    deps.concurrency = 1;
    const res: JobState[] = await run([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf"), pdf("d.pdf")], deps);
    expect(deps.extract).toHaveBeenCalledTimes(4);
    expect(deps.extract.mock.calls.map((c) => (c as unknown[])[1])).toEqual(["f1", "f2", "f3", "f4"].map((draftFileId) => ({ draftFileId })));
    expect(res.map((r) => r.phase)).toEqual(["fertig", "fertig", "fehler", "fehler"]);
    expect(res[2]).toMatchObject({ errorCode: "limit", error: expect.stringContaining("jedes Dokument zählt einzeln"), fileId: "f3" });
  });

  it("meldet jeden Schritt (Fortschritt je Datei)", async () => {
    const seen: string[] = [];
    const deps = { ...setup(async () => draftFor("werkvertrag")), onUpdate: (s: JobState) => seen.push(`${s.name}:${s.phase}`) };
    await run([pdf("werk.pdf")], deps);
    expect(seen).toEqual(["werk.pdf:speichert", "werk.pdf:speichert", "werk.pdf:liest", "werk.pdf:fertig"]);
  });
});
