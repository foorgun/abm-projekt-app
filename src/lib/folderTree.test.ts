import { describe, expect, it } from "vitest";
import { buildFolderTemplates } from "../data/templates";
import { ancestorPaths, buildFolderTree, findNode } from "./folderTree";

const templates = buildFolderTemplates();
const BG = "09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige";
const WFL = "08 Bauantrag/03 Wohnflächenberechnung";
const BGDATE = `${BG}/01 Baugenehmigung/01 erhalten am 14.11.2026`;
const TERMIN = "11 Baubegleitung/10 Baustellentermine/01 Baustellentermin am 03.10.2026";

const docs = [
  { folderPath: WFL },
  { folderPath: WFL },
  { folderPath: BGDATE },
  { folderPath: `${BG}/01 Baugenehmigung/01 erhalten am 02.12.2026` },
  { folderPath: `${TERMIN}/01 Einladung versendet 01.10.2026` },
  { folderPath: `${TERMIN}/02 Fotos` },
];
const tree = buildFolderTree(templates, docs);

describe("Ordnerbaum", () => {
  it("hat die Hauptordner der Vorlage (00 Verträge und 01 bis 11)", () => {
    expect(tree.map((n) => n.label.slice(0, 2))).toEqual(["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]);
  });

  it("zählt Dateien je Ordner und je Teilbaum", () => {
    expect(findNode(tree, WFL)).toMatchObject({ own: 2, total: 2 });
    expect(findNode(tree, "08 Bauantrag")).toMatchObject({ own: 0, total: 2 });
    expect(findNode(tree, "05 Entwurf")).toMatchObject({ total: 0 });
  });

  it("zeigt Datumsordner direkt unter dem Elternordner, ohne Platzhalter-Ebene, neuestes Datum oben", () => {
    const parent = findNode(tree, `${BG}/01 Baugenehmigung`)!;
    expect(parent.children.map((c) => c.label)).toEqual(["01 erhalten am 02.12.2026", "01 erhalten am 14.11.2026"]);
    expect(parent.dateSlots).toEqual([{ path: `${BG}/01 Baugenehmigung/01 erhalten am {datum}`, label: "01 erhalten am …" }]);
    expect(parent.total).toBe(2);
    expect(findNode(tree, `${BG}/01 Baugenehmigung/01 erhalten am {datum}`)).toBeNull();
  });

  it("Ordner mit Datumsfach ohne Ablage ist ein leeres Blatt", () => {
    const n = findNode(tree, "10 Bodengutachten")!;
    expect(n.children).toEqual([]);
    expect(n.dateSlots[0].label).toBe("Bodengutachten erhalten am …");
  });

  it("wiederholt Vorlagen-Unterordner unter verschachtelten Datumsordnern", () => {
    const termin = findNode(tree, TERMIN)!;
    expect(termin.children.map((c) => c.label)).toEqual(["01 Einladung versendet 01.10.2026", "02 Fotos"]);
    expect(termin.dateSlots.map((d) => d.label)).toEqual(["01 Einladung versendet …"]);
    expect(termin.total).toBe(2);
    expect(findNode(tree, `${TERMIN}/02 Fotos`)?.own).toBe(1);
  });

  it("liefert die Vorfahren zum Aufklappen", () => {
    expect(ancestorPaths(tree, BGDATE)).toEqual([BG, `${BG}/01 Baugenehmigung`]);
  });
});
