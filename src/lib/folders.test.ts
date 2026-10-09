import { describe, expect, it } from "vitest";
import template from "../../docs/ordnerstruktur.md?raw";
import { concretePath, extractCodeBlock, isAllowedFolder, normalizeLabel, parseFolderTemplate, templateOf } from "./folders";

const folders = parseFolderTemplate(extractCodeBlock(template));
const paths = folders.map((f) => f.path);

describe("normalizeLabel", () => {
  it("erkennt die uneinheitlichen Datumsplatzhalter", () => {
    expect(normalizeLabel("01 erhalten am xx.yy.yyyy")).toEqual({ label: "01 erhalten am {datum}", hasDate: true });
    expect(normalizeLabel("01 Überschrift tt.mm.jjjj")).toEqual({ label: "01 Überschrift {datum}", hasDate: true });
    expect(normalizeLabel("02 Preisspiegel versendet am xx.xxx").label).toBe("02 Preisspiegel versendet am {datum}");
    expect(normalizeLabel("01 Geländeprofile bestellt am").label).toBe("01 Geländeprofile bestellt am {datum}");
    expect(normalizeLabel("Bodengutachten erhalten am xx.xx.yy").hasDate).toBe(true);
  });

  it("lässt normale Namen in Ruhe", () => {
    expect(normalizeLabel("03 PP")).toEqual({ label: "03 PP", hasDate: false });
    expect(normalizeLabel("08 KG2000,Dichtheitsprüfung,Sichtabnahme").hasDate).toBe(false);
  });
});

describe("parseFolderTemplate", () => {
  it("enthält die Hauptordner 01 bis 11 in Reihenfolge", () => {
    const top = folders.filter((f) => f.parentPath === null).map((f) => f.label.slice(0, 2));
    expect(top).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]);
  });

  it("baut verschachtelte Pfade", () => {
    expect(paths).toContain("08 Bauantrag/03 Wohnflächenberechnung");
    expect(paths).toContain("08 Bauantrag/02 Bauantragspläne/01 Blanko/02 DWGs");
    expect(paths).toContain("09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung/01 erhalten am {datum}");
  });

  it("zerlegt Ein-Zeilen-Notation mit / und Geschwistern", () => {
    expect(paths).toContain("08 Bauantrag/07 Deckblatt/Deckblatt 2/01 Pläne");
    expect(paths).toContain("11 Baubegleitung/04 Bauanlaufgespräch/01 Einladung versendet/02 Absagen");
    expect(paths).toContain("11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus/03 Auftragsbestätigung");
    expect(paths).toContain("11 Baubegleitung/02 Hausanschlüsse/04 Wasser/01 Wasser beantragt am {datum}");
  });

  it("übernimmt Beschreibungen und überspringt Dateien", () => {
    const msh = folders.find((f) => f.path.endsWith("07 Lieferung MSH und Grabarbeiten"));
    expect(msh?.description).toContain("Mehrsparten-Hauseinführung");
    expect(paths.some((p) => p.includes("Liste.docx"))).toBe(false);
  });

  it("hat eindeutige Pfade und gültige Eltern", () => {
    expect(new Set(paths).size).toBe(paths.length);
    for (const f of folders) if (f.parentPath) expect(paths).toContain(f.parentPath);
  });
});

describe("Datumsordner", () => {
  const tpl = "09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung/01 erhalten am {datum}";

  it("setzt das Datum ein", () => {
    expect(concretePath(tpl, "2026-11-14")).toBe(
      "09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung/01 erhalten am 14.11.2026",
    );
  });

  it("findet zum konkreten Pfad die Vorlage und erkennt fremde Pfade", () => {
    expect(templateOf(concretePath(tpl, "2026-11-14"), folders)?.path).toBe(tpl);
    expect(isAllowedFolder("08 Bauantrag/03 Wohnflächenberechnung", folders)).toBe(true);
    expect(isAllowedFolder("08 Bauantrag/99 Erfunden", folders)).toBe(false);
    expect(isAllowedFolder("../../etc", folders)).toBe(false);
  });
});
