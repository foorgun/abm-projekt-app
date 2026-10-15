import { existsSync, readFileSync } from "node:fs";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRadioGroup, PDFTextField, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";
import bienZenker from "../../../docs/planungsprotokoll/bien-zenker.json";
import livingHaus from "../../../docs/planungsprotokoll/living-haus.json";
import schwabenhaus from "../../../docs/planungsprotokoll/schwabenhaus.json";
import type { BauherrContact, BueroDaten, Dataset, ProjectParty, Project, ProtokollVorlage } from "../types";
import { architektKontakt, istMobil, protokollDaten, splitAnschrift, splitKontaktzeile, type ProtokollDaten } from "./daten";
import { abweichungen, einbrennen, erzeugeProtokoll, feldZustand, passendeGroesse, ProtokollFehler, SCHRIFT_MIN_PT, SCHRIFT_PT } from "./pdf";
import { protokollDateiname, VORLAGEN, VORLAGEN_ORDNER, vorlageFuerFirma } from "./vorlagen";
import { feldStand, feldwerte, ZUORDNUNG } from "./zuordnung";

interface InventarFeld {
  name: string;
  typ: "Text" | "Checkbox" | "Radio" | "Button";
  seite: number;
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  exportwert: string | null;
}
const INVENTAR: Record<ProtokollVorlage, { seiten: number; felder: InventarFeld[] }> = {
  schwabenhaus: schwabenhaus as never,
  "living-haus": livingHaus as never,
  "bien-zenker": bienZenker as never,
};
const ALLE: ProtokollVorlage[] = ["schwabenhaus", "living-haus", "bien-zenker"];
const SCHRIFT = readFileSync("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");

/**
 * Nachbau einer Vorlage aus dem Feld-Inventar: gleiche Feldnamen, Typen, Seiten und Positionen. So laufen die Tests ohne
 * die Firmen-PDFs (die nicht im Repo liegen). Einige Ankreuzfelder sind angekreuzt und ein Textfeld auf Seite 2 ist
 * gefüllt: das muss nach dem Befüllen genau so bleiben.
 */
async function nachbau(vorlage: ProtokollVorlage): Promise<{ bytes: Uint8Array; angekreuzt: string[]; radio: Record<string, string>; vorher: string | null }> {
  const inv = INVENTAR[vorlage];
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < inv.seiten; i++) doc.addPage([595, 842]);
  const form = doc.getForm();
  const pages = doc.getPages();
  const seen = new Map<string, PDFTextField | PDFCheckBox | PDFRadioGroup>();
  const angekreuzt: string[] = [];
  const radio: Record<string, string> = {};
  let vorher: string | null = null;
  for (const f of inv.felder) {
    const page = pages[f.seite - 1];
    const rect = { x: f.x, y: f.y, width: f.breite, height: f.hoehe, borderWidth: 0 };
    if (f.typ === "Text") {
      let t = seen.get(f.name) as PDFTextField | undefined;
      if (!t) {
        t = form.createTextField(f.name);
        if (f.hoehe > 20) t.enableMultiline();
        seen.set(f.name, t);
      }
      t.addToPage(page, { ...rect, font: helv });
    } else if (f.typ === "Checkbox" && !seen.has(f.name)) {
      const c = form.createCheckBox(f.name);
      c.addToPage(page, rect);
      seen.set(f.name, c);
      if (angekreuzt.length < 15 && f.seite > 1 && seen.size % 7 === 0) {
        c.check();
        angekreuzt.push(f.name);
      }
    } else if (f.typ === "Radio") {
      let r = seen.get(f.name) as PDFRadioGroup | undefined;
      if (!r) {
        r = form.createRadioGroup(f.name);
        seen.set(f.name, r);
      }
      const opts = r.getOptions();
      const wert = f.exportwert && !opts.includes(f.exportwert) ? f.exportwert : `opt${opts.length}`;
      r.addOptionToPage(wert, page, rect);
    }
  }
  // je eine Radio-Gruppe auswählen, die erste Option
  for (const [name, f] of seen) {
    if (f instanceof PDFRadioGroup && Object.keys(radio).length < 5) {
      const opt = f.getOptions()[0];
      f.select(opt);
      radio[name] = opt;
    }
  }
  // ein Textfeld auf Seite 2 oder später mit Inhalt
  const spaeter = inv.felder.find((f) => f.typ === "Text" && f.seite > 1 && !(f.name in ZUORDNUNG[vorlage]));
  if (spaeter) {
    (seen.get(spaeter.name) as PDFTextField).setText("Schon da: Größe");
    vorher = spaeter.name;
  }
  form.updateFieldAppearances(helv);
  return { bytes: await doc.save(), angekreuzt, radio, vorher };
}

const k = (name: string) => ({ name, anschrift: "Hauptstraße 1, 89000 Überall", tel: "0731 0000001", mobil: "0170 0000001", mail: "info@example.de", fax: "0731 0000009" });
/** Vollständig erfundene Protokolldaten mit Umlauten und ß. */
const VOLL: ProtokollDaten = {
  projektNr: "HB-2026-0815",
  bauherr: { name: "Jörg und Bärbel Müller-Weißgerber", strasse: "Größlestraße 7", plzOrt: "89077 Ulm-Söflingen", mobil: "0170 0000001", mail: "mueller-weissgerber@example.de" },
  bauort: { strasse: "Am Hölzle 12", plzOrt: "89134 Blaustein", gemarkung: "Bermaringen", ortsteil: "Bermaringen", flurstueck: "Flur 3, Flst. 1234/5", bundesland: "Baden-Württemberg" },
  beteiligte: {
    architekt: k("ABM Demo-Büro, Dörte Fuß"),
    vermesser: k("Vermessungsbüro Kößler"),
    baugrundgutachter: k("Baugrund Süß"),
    erdbauer: k("Erdbau Grübel"),
    kellerbauer: k("Kellerbau Löffler"),
    gemeinde: k("Gemeinde Blaustein"),
    bauamt: k("Baurechtsamt Ämterweg"),
    schornsteinfeger: k("Schornsteinfeger Rußwurm"),
    strom: k("Stadtwerke Überall"),
    gas: k("Gas Höhenweg"),
    fernwaerme: k("Wärme Ölmühle"),
    wasser: k("Wasser Älbler"),
    abwasser: k("Abwasser Flußtal"),
    sonstige: k("Sonstige GmbH"),
  },
};
const leerKontakt = { name: null, anschrift: null, tel: null, mobil: null, mail: null, fax: null };

async function seitenText(bytes: Uint8Array, seite = 1): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false }).promise;
  const tc = await (await doc.getPage(seite)).getTextContent();
  await doc.destroy();
  return tc.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}

describe("Zuordnung je Vorlage", () => {
  for (const v of ALLE) {
    it(`${v}: jedes zugeordnete Feld ist ein Textfeld auf Seite 1 der Vorlage`, () => {
      const felder = INVENTAR[v].felder;
      for (const name of Object.keys(ZUORDNUNG[v])) {
        const f = felder.filter((x) => x.name === name);
        expect(f.length, name).toBeGreaterThan(0);
        expect(f.every((x) => x.typ === "Text"), name).toBe(true);
        expect(f.some((x) => x.seite === 1), name).toBe(true);
      }
    });
  }
  it("Schwabenhaus füllt 40 Felder, Living Haus und Bien-Zenker je 51 mit denselben Feldnamen", () => {
    expect(Object.keys(ZUORDNUNG.schwabenhaus)).toHaveLength(40);
    expect(Object.keys(ZUORDNUNG["living-haus"])).toHaveLength(51);
    expect(Object.keys(ZUORDNUNG["bien-zenker"]).sort()).toEqual(Object.keys(ZUORDNUNG["living-haus"]).sort());
  });
  it("lässt das Rich-Text-Feld (Schwabenhaus) und die Summenfelder (FB-22) unberührt", () => {
    expect(ZUORDNUNG.schwabenhaus).not.toHaveProperty("WasserschutzgebietAuflagen");
    for (const n of ["4.09", "4.14", "4.19", "4.24"]) expect(ZUORDNUNG["living-haus"]).not.toHaveProperty(`Textfeld ${n}`);
  });
  it("ordnet die Werte richtig zu (Stichproben)", () => {
    const sh = feldwerte("schwabenhaus", VOLL);
    expect(sh["BV-Nr"]).toBe("HB-2026-0815");
    expect(sh.BauherrStraße).toBe("Größlestraße 7");
    expect(sh.VermesserName).toBe("Vermessungsbüro Kößler, Hauptstraße 1, 89000 Überall");
    expect(sh.BGGutachterTel).toBe("0731 0000001");
    expect(sh.GemeindeFax).toBe("0731 0000009");
    const lh = feldwerte("living-haus", VOLL);
    expect(lh["Textfeld 1.02"]).toBe("Jörg und Bärbel Müller-Weißgerber");
    expect(lh["Textfeld 1.21"]).toContain("Rußwurm");
    // Genehmigungsbehörde: das Bauamt, ohne Bauamt die Gemeinde
    expect(lh["Textfeld 1.20"]).toContain("Baurechtsamt");
    expect(feldwerte("living-haus", { ...VOLL, beteiligte: { ...VOLL.beteiligte, bauamt: leerKontakt } })["Textfeld 1.20"]).toContain("Gemeinde Blaustein");
  });
  it("zählt gefüllte Felder", () => {
    expect(feldStand("bien-zenker", VOLL)).toEqual({ gefuellt: 51, gesamt: 51 });
    const ohne = { ...VOLL, beteiligte: { ...VOLL.beteiligte, gas: leerKontakt } };
    expect(feldStand("bien-zenker", ohne)).toEqual({ gefuellt: 48, gesamt: 51 });
  });
});

describe("Vorlagen", () => {
  it("wählt die Vorlage nach der Hausbaufirma", () => {
    expect(vorlageFuerFirma("Schwabenhaus")).toBe("schwabenhaus");
    expect(vorlageFuerFirma("Living Haus")).toBe("living-haus");
    expect(vorlageFuerFirma("Bien-Zenker GmbH")).toBe("bien-zenker");
    expect(vorlageFuerFirma("Hausbau Muster")).toBeNull();
    expect(vorlageFuerFirma(null)).toBeNull();
  });
  it("Dateiname mit Vorlage, Bauherr, Datum, Uhrzeit und Fassung", () => {
    expect(protokollDateiname("living-haus", "flach", "Müller Weiß", new Date(2026, 9, 15, 9, 5))).toBe("Planungsprotokoll_LH_Müller-Weiß_2026-10-15_0905_flach.pdf");
  });
});

// ---------------------------------------------------------------------------
// Daten aus dem Projekt
// ---------------------------------------------------------------------------

const PROJEKT: Project = {
  id: "p1",
  abmNr: "8185-001",
  hausbauNr: "SH-4711",
  kind: "neubau",
  status: "aktiv",
  companyId: "c-sh",
  salespersonId: null,
  bauherrLabel: "Müller",
  location: "Blaustein",
  architectId: null,
  planerId: null,
  baubetreuung: null,
  intakeMonth: null,
  notes: null,
  flurstueck: "1234/5",
  gemarkung: "Bermaringen",
  flur: "3",
  steps: {},
};
const BUERO: BueroDaten = { name: "ABM Demo-Büro", anschrift: "Musterweg 1, 89073 Ulm", tel: "0731 0000000", mobil: null, email: "buero@example.de" };
function dataset(over: { bauherr?: Partial<BauherrContact> | null; parties?: ProjectParty[]; buero?: BueroDaten | null; project?: Partial<Project> } = {}): Pick<Dataset, "projects" | "bauherren" | "parties" | "buero"> {
  return {
    projects: [{ ...PROJEKT, ...over.project }],
    bauherren: over.bauherr === null ? [] : [{ projectId: "p1", name: "Familie Müller", address: null, phone: null, email: null, buildingAddress: null, ...over.bauherr }],
    parties: over.parties ?? [],
    buero: over.buero === undefined ? BUERO : over.buero,
  };
}

describe("Protokolldaten aus dem Projekt", () => {
  it("Projekt-Nr. ist die Hausbau-Nr.", () => {
    expect(protokollDaten(dataset(), "p1").projektNr).toBe("SH-4711");
  });
  it("Bauherr: getrennte Felder gehen vor, zweiter Bauherr im Namen", () => {
    const d = protokollDaten(dataset({ bauherr: { name: "Jörg Müller", name2: "Bärbel Müller", street: "Größlestraße 7", postalCode: "89077", city: "Ulm", mobile: "0170 1", address: "Alt 1, 11111 Altort", email: "a@example.de" } }), "p1");
    expect(d.bauherr).toEqual({ name: "Jörg Müller und Bärbel Müller", strasse: "Größlestraße 7", plzOrt: "89077 Ulm", mobil: "0170 1", mail: "a@example.de" });
  });
  it("Bauherr: ohne getrennte Felder wird die alte Anschrift aufgeteilt; Mobil nur aus einer Handynummer", () => {
    const d = protokollDaten(dataset({ bauherr: { address: "Größlestraße 7, 89077 Ulm-Söflingen", phone: "0731 123456" } }), "p1");
    expect(d.bauherr.strasse).toBe("Größlestraße 7");
    expect(d.bauherr.plzOrt).toBe("89077 Ulm-Söflingen");
    expect(d.bauherr.mobil).toBeNull();
    expect(protokollDaten(dataset({ bauherr: { phone: "0171 2345678" } }), "p1").bauherr.mobil).toBe("0171 2345678");
  });
  it("ohne Kontaktdaten: Name aus dem Projekt, alles andere leer", () => {
    const d = protokollDaten(dataset({ bauherr: null }), "p1");
    expect(d.bauherr).toEqual({ name: "Müller", strasse: null, plzOrt: null, mobil: null, mail: null });
  });
  it("Bauort: getrennte Felder, sonst Bauadresse aufteilen, Ort notfalls aus dem Projekt; Flur und Flurstück zusammen", () => {
    const a = protokollDaten(dataset({ bauherr: { siteStreet: "Am Hölzle 12", sitePostalCode: "89134", siteDistrict: "Bermaringen", siteState: "Baden-Württemberg" } }), "p1").bauort;
    expect(a).toEqual({ strasse: "Am Hölzle 12", plzOrt: "89134 Blaustein", gemarkung: "Bermaringen", ortsteil: "Bermaringen", flurstueck: "Flur 3, Flst. 1234/5", bundesland: "Baden-Württemberg" });
    const b = protokollDaten(dataset({ bauherr: { buildingAddress: "Am Hölzle 12, 89134 Blaustein" }, project: { flur: null } }), "p1").bauort;
    expect([b.strasse, b.plzOrt, b.flurstueck]).toEqual(["Am Hölzle 12", "89134 Blaustein", "1234/5"]);
    // nicht aufteilbar: unverändert als Straße/Baugebiet
    expect(protokollDaten(dataset({ bauherr: { buildingAddress: "Baugebiet Kühäcker, Flst. 412/3" } }), "p1").bauort.strasse).toBe("Baugebiet Kühäcker, Flst. 412/3");
  });
  it("Beteiligte: getrennte Felder, sonst Telefon und E-Mail aus der alten Kontaktzeile; fehlende Rollen leer", () => {
    const d = protokollDaten(
      dataset({
        parties: [
          { projectId: "p1", role: "vermesser", name: "Vermessung Kößler", contact: "0731 99999, info@koessler.example" },
          { projectId: "p1", role: "kellerbauer", name: "Keller Löffler", contact: null, phone: "0731 1", mobile: "0170 2", email: "k@example.de", address: "Weg 1, 89000 Ort" },
        ],
      }),
      "p1",
    );
    expect(d.beteiligte.vermesser).toMatchObject({ name: "Vermessung Kößler", tel: "0731 99999", mail: "info@koessler.example", mobil: null });
    expect(d.beteiligte.kellerbauer).toMatchObject({ tel: "0731 1", mobil: "0170 2", mail: "k@example.de", anschrift: "Weg 1, 89000 Ort" });
    expect(d.beteiligte.gas).toEqual(leerKontakt);
    expect(d.beteiligte.schornsteinfeger).toEqual(leerKontakt);
  });
  it("Architekt: Bürodaten; ein Sachbearbeiter ergänzt den Namen und ersetzt Tel./Mobil/E-Mail, soweit vorhanden", () => {
    expect(architektKontakt(BUERO, undefined)).toEqual({ name: "ABM Demo-Büro", anschrift: "Musterweg 1, 89073 Ulm", tel: "0731 0000000", mobil: null, mail: "buero@example.de", fax: null });
    const sb: ProjectParty = { projectId: "p1", role: "sachbearbeiter", name: "Dörte Fuß", contact: null, mobile: "0170 3", email: "fuss@example.de" };
    expect(architektKontakt(BUERO, sb)).toEqual({ name: "ABM Demo-Büro, Dörte Fuß", anschrift: "Musterweg 1, 89073 Ulm", tel: "0731 0000000", mobil: "0170 3", mail: "fuss@example.de", fax: null });
    expect(architektKontakt(null, undefined)).toEqual(leerKontakt);
  });
  it("Hilfen: Anschrift und Kontaktzeile aufteilen, Handynummer erkennen", () => {
    expect(splitAnschrift("89077 Ulm")).toEqual({ strasse: null, plz: "89077", ort: "Ulm" });
    expect(splitAnschrift("irgendwo")).toEqual({ strasse: null, plz: null, ort: null });
    expect(splitKontaktzeile("netzanschluss@example.com")).toEqual({ tel: null, mail: "netzanschluss@example.com" });
    expect(istMobil("+49 170 1234567")).toBe(true);
    expect(istMobil("0731 1234567")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PDF erzeugen (Nachbau der Vorlagen)
// ---------------------------------------------------------------------------

describe("PDF erzeugen", () => {
  const vorlagen = {} as Record<ProtokollVorlage, Awaited<ReturnType<typeof nachbau>>>;
  beforeAll(async () => {
    for (const v of ALLE) vorlagen[v] = await nachbau(v);
  }, 30_000);

  for (const v of ALLE) {
    it(`${v}: bearbeitbare Fassung setzt Seite 1 mit Umlauten und lässt alles andere unverändert`, async () => {
      const t = vorlagen[v];
      const r = await erzeugeProtokoll({ vorlage: t.bytes, schrift: SCHRIFT, werte: feldwerte(v, VOLL), variante: "bearbeitbar" });
      expect(r.gesetzt).toHaveLength(Object.keys(ZUORDNUNG[v]).length);
      expect(r.leer).toEqual([]);
      const doc = await PDFDocument.load(r.bytes);
      const form = doc.getForm();
      const name = v === "schwabenhaus" ? "BauherrName" : "Textfeld 1.02";
      expect(form.getTextField(name).getText()).toBe("Jörg und Bärbel Müller-Weißgerber");
      expect(form.getTextField(v === "schwabenhaus" ? "BauherrStraße" : "Textfeld 1.03").getText()).toBe("Größlestraße 7");
      // eingebettete Unicode-Schrift im Feld, Größe zwischen 6 und 9 pt
      const da = String(form.getTextField(name).acroField.getDefaultAppearance());
      expect(da).toMatch(/\/LiberationSans[^ ]* (\d+(\.\d+)?) Tf/);
      const pt = Number(da.match(/ (\d+(?:\.\d+)?) Tf/)![1]);
      expect(pt).toBeGreaterThanOrEqual(SCHRIFT_MIN_PT);
      expect(pt).toBeLessThanOrEqual(SCHRIFT_PT);
      // Ankreuzfelder und Felder anderer Seiten unverändert, Felder weiter bearbeitbar
      for (const c of t.angekreuzt) expect(form.getCheckBox(c).isChecked(), c).toBe(true);
      for (const [g, opt] of Object.entries(t.radio)) expect(form.getRadioGroup(g).getSelected()).toBe(opt);
      if (t.vorher) expect(form.getTextField(t.vorher).getText()).toBe("Schon da: Größe");
      const vorher = feldZustand(await PDFDocument.load(t.bytes));
      expect(Object.keys(feldZustand(doc))).toEqual(Object.keys(vorher));
      expect(form.getFields().length).toBeGreaterThan(100);
    });

    it(`${v}: flache Fassung hat keine Felder mehr und zeigt die Werte als Text (Umlaute lesbar)`, async () => {
      const r = await erzeugeProtokoll({ vorlage: vorlagen[v].bytes, schrift: SCHRIFT, werte: feldwerte(v, VOLL), variante: "flach" });
      const doc = await PDFDocument.load(r.bytes);
      expect(doc.getForm().getFields()).toHaveLength(0);
      expect(doc.getPageCount()).toBe(INVENTAR[v].seiten);
      const widgets = doc.getPages().flatMap((p) => {
        const a = p.node.Annots();
        return a ? a.asArray().filter((x) => (doc.context.lookup(x) as { get?: (n: PDFName) => unknown })?.get?.(PDFName.of("Subtype")) === PDFName.of("Widget")) : [];
      });
      expect(widgets).toHaveLength(0);
      const text = await seitenText(r.bytes);
      expect(text).toContain("Müller-Weißgerber");
      expect(text).toContain("Größlestraße 7");
      expect(text).toContain("Ulm-Söflingen");
    });
  }

  it("fehlende Rollen ergeben leere Felder, keinen Fehler", async () => {
    const ohne: ProtokollDaten = { ...VOLL, beteiligte: { ...VOLL.beteiligte, gas: leerKontakt, fernwaerme: leerKontakt, schornsteinfeger: leerKontakt, kellerbauer: leerKontakt } };
    const r = await erzeugeProtokoll({ vorlage: vorlagen["living-haus"].bytes, schrift: SCHRIFT, werte: feldwerte("living-haus", ohne), variante: "bearbeitbar" });
    expect(r.leer.sort()).toEqual(["1.18", "1.21", "1.23", "1.24", "1.30", "1.31", "1.32", "1.39", "1.40", "1.41", "1.42", "1.45", "1.46", "1.47"].map((n) => `Textfeld ${n}`).sort());
    const form = (await PDFDocument.load(r.bytes)).getForm();
    expect(form.getTextField("Textfeld 1.23").getText() ?? "").toBe("");
    expect(form.getTextField("Textfeld 1.22").getText()).toContain("Stadtwerke Überall");
  });

  it("ganz ohne Daten: nur leere Felder, trotzdem ein gültiges PDF", async () => {
    const leer = feldwerte("schwabenhaus", { projektNr: null, bauherr: { name: null, strasse: null, plzOrt: null, mobil: null, mail: null }, bauort: { strasse: null, plzOrt: null, gemarkung: null, ortsteil: null, flurstueck: null, bundesland: null }, beteiligte: Object.fromEntries(Object.keys(VOLL.beteiligte).map((r) => [r, leerKontakt])) as ProtokollDaten["beteiligte"] });
    const r = await erzeugeProtokoll({ vorlage: vorlagen.schwabenhaus.bytes, schrift: SCHRIFT, werte: leer, variante: "flach" });
    expect(r.gesetzt).toEqual([]);
    expect((await PDFDocument.load(r.bytes)).getForm().getFields()).toHaveLength(0);
  });

  it("passt die Vorlage nicht zur Zuordnung, gibt es eine Fehlermeldung statt eines PDFs", async () => {
    await expect(erzeugeProtokoll({ vorlage: vorlagen["bien-zenker"].bytes, schrift: SCHRIFT, werte: feldwerte("schwabenhaus", VOLL), variante: "bearbeitbar" })).rejects.toBeInstanceOf(ProtokollFehler);
    await expect(erzeugeProtokoll({ vorlage: new Uint8Array([1, 2, 3]), schrift: SCHRIFT, werte: {}, variante: "bearbeitbar" })).rejects.toThrow("keine lesbare PDF");
  });

  it("die Prüfung erkennt veränderte Ankreuzfelder und falsche Werte", async () => {
    const doc = await PDFDocument.load(vorlagen["living-haus"].bytes);
    const vorher = feldZustand(doc);
    const box = vorlagen["living-haus"].angekreuzt[0];
    doc.getForm().getCheckBox(box).uncheck();
    doc.getForm().getTextField("Textfeld 1.02").setText("Falsch");
    const nachher = feldZustand(doc);
    expect(abweichungen(vorher, nachher, {})).toEqual(expect.arrayContaining([`Ankreuzfeld „${box}“ wurde verändert`, "Feld „Textfeld 1.02“ wurde verändert"]));
    expect(abweichungen(vorher, nachher, { "Textfeld 1.02": "Richtig" })).toContain("Feld „Textfeld 1.02“ hat nicht den eingetragenen Wert");
    expect(abweichungen(vorher, vorher, {})).toEqual([]);
  });

  it("Einbrennen zeichnet angekreuzte Felder mit ihrem Zustand „an“ (nicht nur das leere Kästchen)", async () => {
    const doc = await PDFDocument.load(vorlagen["living-haus"].bytes);
    const box = doc.getForm().getCheckBox(vorlagen["living-haus"].angekreuzt[0]);
    const widget = box.acroField.getWidgets()[0];
    const an = (widget.dict.lookup(PDFName.of("AP")) as PDFDict).lookup(PDFName.of("N"), PDFDict).get(widget.dict.get(PDFName.of("AS")) as PDFName);
    const aus = (widget.dict.lookup(PDFName.of("AP")) as PDFDict).lookup(PDFName.of("N"), PDFDict).get(PDFName.of("Off"));
    const page = doc.getPages().find((p) => p.ref === widget.P())!;
    einbrennen(doc);
    // (getForm() ist hier noch zwischengespeichert; das Formular selbst ist aus dem Katalog entfernt)
    expect(doc.catalog.get(PDFName.of("AcroForm"))).toBeUndefined();
    const xobjects = page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    const gezeichnet = xobjects.values().map(String);
    expect(gezeichnet).toContain(String(an));
    expect(gezeichnet).not.toContain(String(aus));
  });

  it("Schriftgröße: 9 pt, bei langen Werten kleiner, nie unter 6 pt", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit((await import("@pdf-lib/fontkit")).default);
    const font = await doc.embedFont(SCHRIFT);
    expect(passendeGroesse("kurz", font, { width: 200, height: 14 }, false)).toBe(9);
    const lang = "mueller-weissgerber@example.de";
    const s = passendeGroesse(lang, font, { width: 142, height: 18 }, true);
    expect(s).toBeLessThan(9);
    expect(font.widthOfTextAtSize(lang, s)).toBeLessThanOrEqual(142 - 8);
    expect(passendeGroesse("x".repeat(200), font, { width: 50, height: 10 }, false)).toBe(6);
  });
});

// Mit den echten Vorlagen, wenn sie lokal liegen (nicht im Repo, z. B. nicht in CI)
const echt = ALLE.filter((v) => existsSync(`${VORLAGEN_ORDNER}/${VORLAGEN[v].datei}`));
describe.skipIf(!echt.length)("echte Vorlagen (lokal)", () => {
  for (const v of echt) {
    it(`${v}: beide Fassungen bestehen die Prüfung`, async () => {
      const vorlage = readFileSync(`${VORLAGEN_ORDNER}/${VORLAGEN[v].datei}`);
      const bearbeitbar = await erzeugeProtokoll({ vorlage, schrift: SCHRIFT, werte: feldwerte(v, VOLL), variante: "bearbeitbar" });
      expect(bearbeitbar.gesetzt).toHaveLength(Object.keys(ZUORDNUNG[v]).length);
      const flach = await erzeugeProtokoll({ vorlage, schrift: SCHRIFT, werte: feldwerte(v, VOLL), variante: "flach" });
      expect((await PDFDocument.load(flach.bytes)).getForm().getFields()).toHaveLength(0);
      expect(await seitenText(flach.bytes)).toContain("Müller-Weißgerber");
    }, 30_000);
  }
});
