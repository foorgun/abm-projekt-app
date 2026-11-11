// Baugrundauftrag an Clayton: Werte aus dem Projekt, Feldzuordnung gegen das Feld-Inventar, PDF aus nachgebauten Vorlagen
// (die echten liegen nicht im Repo; mit ihnen läuft ein Test nur, wenn sie lokal liegen), Ablage im Demo-Modus.
import { existsSync, readFileSync } from "node:fs";
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFTextField, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import inventar from "../../../docs/baugrundauftrag/clayton.json";
import migration31 from "../../../supabase/migrations/0031_baugrundauftraege.sql?raw";
import { createDemoRepo } from "../demoRepo";
import { CONTRACT_FOLDER } from "../extract/filing";
import { ProtokollFehler } from "../planungsprotokoll/pdf";
import { PermissionError } from "../repo";
import { COLS, toBaugrundauftrag } from "../supabase/mappers";
import type { BauherrContact, BaugrundVorlage, BueroDaten, Dataset, Project, ProjectParty, Salesperson } from "../types";
import { ankreuzen, BAUGRUND_ORDNER, bauadresse, baugrundDaten, baugrundDateiname, fehlendeAngaben, feldwerte, kontaktZeile, ortGemarkung } from "./daten";
import { erzeugeBaugrundauftrag, vorlagenZusammenfuegen } from "./pdf";
import { BAUGRUND_VORLAGEN, BAUGRUND_VORLAGEN_LISTE, BAUGRUND_VORLAGEN_ORDNER, brauchtBaugrundauftrag } from "./vorlagen";

interface InventarFeld {
  name: string;
  typ: "Text" | "Checkbox" | "Radio" | "Dropdown";
  widget: number;
  seite: number;
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  nurLesen: boolean;
  wert: string | null;
  optionen: string[] | null;
}
const INVENTAR = inventar.teile as Record<BaugrundVorlage, { seiten: number; felder: InventarFeld[] }>;
const SCHRIFT = readFileSync("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");

/** Nachbau einer Clayton-Vorlage aus dem Feld-Inventar: gleiche Namen, Typen, Seiten, Lage, vorbelegte Clayton-Werte. */
async function nachbau(teil: BaugrundVorlage, extra: string[] = []): Promise<Uint8Array> {
  const inv = INVENTAR[teil];
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < inv.seiten; i++) doc.addPage([595.3, 841.9]);
  const form = doc.getForm();
  const pages = doc.getPages();
  const seen = new Map<string, PDFTextField | PDFCheckBox | PDFDropdown>();
  for (const f of inv.felder) {
    const page = pages[f.seite - 1];
    const rect = { x: f.x, y: f.y, width: f.breite, height: f.hoehe, borderWidth: 0 };
    if (f.typ === "Text") {
      let t = seen.get(f.name) as PDFTextField | undefined;
      if (!t) {
        t = form.createTextField(f.name);
        if (f.wert) t.setText(f.wert);
        if (f.nurLesen) t.enableReadOnly();
        seen.set(f.name, t);
      }
      t.addToPage(page, { ...rect, font: helv });
    } else if (f.typ === "Checkbox") {
      const c = form.createCheckBox(f.name);
      c.addToPage(page, rect);
      seen.set(f.name, c);
    } else if (f.typ === "Dropdown") {
      const d = form.createDropdown(f.name);
      d.addOptions(f.optionen ?? []);
      if (f.wert) d.select(f.wert);
      d.addToPage(page, { ...rect, font: helv });
      seen.set(f.name, d);
    }
  }
  for (const name of extra) form.createTextField(name).addToPage(pages[0], { x: 10, y: 10, width: 50, height: 12, font: helv });
  form.updateFieldAppearances(helv);
  return doc.save();
}

// Alle Namen, Anschriften und Nummern sind erfunden.
const PROJEKT: Project = {
  id: "p1", abmNr: "8185-001", hausbauNr: "SH-4711", kind: "neubau", status: "aktiv", companyId: "c-sh", salespersonId: "s1",
  bauherrLabel: "Müller", location: "Blaustein", architectId: null, planerId: null, baubetreuung: null, intakeMonth: null, notes: null,
  flurstueck: "1234/5", gemarkung: "Bermaringen", flur: "3", steps: {},
};
const BUERO: BueroDaten = { name: "ABM Demo-Büro", anschrift: "Musterweg 1, 89073 Ulm", tel: "0731 0000000", mobil: "0170 0000009", email: "buero@example.de" };
const KONTAKT: BauherrContact = {
  projectId: "p1", name: "Jörg Müller-Weißgerber", name2: "Bärbel Müller-Weißgerber", address: null, phone: "07304 000001", mobile: "0170 0000001", email: "mueller@example.de", buildingAddress: null,
  street: "Größlestraße 7", postalCode: "89077", city: "Ulm", siteStreet: "Am Hölzle 12", sitePostalCode: "89134", siteCity: "Blaustein",
};
const VERKAEUFER: Salesperson = { id: "s1", companyId: "c-sh", name: "Sven Verkäufer", email: "verkauf@example.de" };

function dataset(over: { project?: Partial<Project>; kontakt?: Partial<BauherrContact> | null; parties?: ProjectParty[]; buero?: BueroDaten | null; salespeople?: Salesperson[] } = {}) {
  return {
    companies: [
      { id: "c-sh", name: "Schwabenhaus", numberPrefix: null },
      { id: "c-bz", name: "Bien-Zenker", numberPrefix: null },
    ],
    salespeople: over.salespeople ?? [VERKAEUFER],
    projects: [{ ...PROJEKT, ...over.project }],
    bauherren: over.kontakt === null ? [] : [{ ...KONTAKT, ...over.kontakt }],
    parties: over.parties ?? [],
    buero: over.buero === undefined ? BUERO : over.buero,
  } satisfies Pick<Dataset, "projects" | "bauherren" | "parties" | "buero" | "companies" | "salespeople">;
}

describe("Werte des Baugrundauftrags", () => {
  it("füllt alles aus Bauherr, Projekt, Verkäufer, Bürodaten und Kellerregel", () => {
    const d = baugrundDaten(dataset(), "p1");
    expect(d.auftraggeber).toEqual({ namen: "Jörg Müller-Weißgerber und Bärbel Müller-Weißgerber", strasse: "Größlestraße 7", plzOrt: "89077 Ulm", tel: "07304 000001", email: "mueller@example.de" });
    expect(d.hersteller).toEqual({ firma: "Schwabenhaus", projektNr: "SH-4711", ansprechpartner: "Sven Verkäufer", tel: null, email: "verkauf@example.de" });
    // nur das Büro, keine Personennamen
    expect(d.planer).toEqual({ name: "ABM Demo-Büro", tel: "0731 0000000", email: "buero@example.de" });
    expect(d.bauort).toEqual({ strasse: "Am Hölzle 12", plzOrt: "89134 Blaustein", gemarkung: "Bermaringen", flurstueck: "Flur 3, Flst. 1234/5" });
    expect(d.keller).toBe("Schwabenhaus");
    expect(kontaktZeile(d)).toBe("07304 000001 / mueller@example.de");
    expect(ortGemarkung(d)).toBe("89134 Blaustein, Gemarkung Bermaringen");
    expect(bauadresse(d)).toBe("Am Hölzle 12, 89134 Blaustein");
    expect(fehlendeAngaben(d)).toEqual([]);
  });

  it("Kellerbauer: Eintrag im Projekt (z. B. „Bauseits“) geht vor", () => {
    expect(baugrundDaten(dataset({ parties: [{ projectId: "p1", role: "kellerbauer", name: "Bauseits", contact: null }] }), "p1").keller).toBe("Bauseits");
  });

  it("Tel.: Festnetz vor Mobil, ohne beides leer; Versand per E-Mail nur mit E-Mail", () => {
    expect(baugrundDaten(dataset({ kontakt: { phone: null } }), "p1").auftraggeber.tel).toBe("0170 0000001");
    const ohne = baugrundDaten(dataset({ kontakt: { phone: null, mobile: null, email: null } }), "p1");
    expect([ohne.auftraggeber.tel, ohne.auftraggeber.email, kontaktZeile(ohne)]).toEqual([null, null, null]);
    expect(ankreuzen(ohne)).toEqual(["beigefügt"]);
    expect(ankreuzen(baugrundDaten(dataset(), "p1"))).toEqual(["GA/RG per EMail im PDFFormat", "beigefügt"]);
  });

  it("fehlt etwas, bleibt es leer und wird genannt (nie geraten)", () => {
    const d = baugrundDaten(dataset({ kontakt: null, buero: null, salespeople: [], project: { hausbauNr: null, gemarkung: null, flur: null, flurstueck: null, companyId: null } }), "p1");
    expect(d.hersteller).toEqual({ firma: null, projektNr: null, ansprechpartner: null, tel: null, email: null });
    expect(d.planer).toEqual({ name: null, tel: null, email: null });
    expect(d.keller).toBeNull();
    expect(d.auftraggeber.strasse).toBeNull();
    // ohne Gemarkung nur PLZ und Ort
    expect(ortGemarkung(d)).toBe("Blaustein");
    expect(fehlendeAngaben(d)).toEqual(expect.arrayContaining(["Tel. des Bauherrn", "Projektnummer (Hausbau-Nr.)", "Verkäufer", "Bürodaten (Name)", "Gemarkung", "Flurstück", "Ausführung Keller/Bodenplatte"]));
    // Bürodaten ohne Tel.: Mobil des Büros
    expect(baugrundDaten(dataset({ buero: { ...BUERO, tel: null } }), "p1").planer.tel).toBe("0170 0000009");
  });

  it("nur bei Schwabenhaus (bei Bien-Zenker und Living Haus ist das Gutachten im Hauspreis)", () => {
    expect(brauchtBaugrundauftrag("Schwabenhaus")).toBe(true);
    expect(brauchtBaugrundauftrag("Schwabenhaus GmbH & Co. KG")).toBe(true);
    expect(brauchtBaugrundauftrag("Bien-Zenker")).toBe(false);
    expect(brauchtBaugrundauftrag("Living Haus")).toBe(false);
    expect(brauchtBaugrundauftrag(null)).toBe(false);
  });

  it("Dateiname mit Bauherr, Datum und Uhrzeit; Ablage im Ordner der Vertragsauslesung", () => {
    expect(baugrundDateiname("Müller Weiß", new Date(2026, 10, 11, 9, 5))).toBe("Baugrundauftrag_Clayton_Müller-Weiß_2026-11-11_0905.pdf");
    expect(baugrundDateiname("  ")).toMatch(/^Baugrundauftrag_Clayton_Projekt_/);
    expect(BAUGRUND_ORDNER).toBe(CONTRACT_FOLDER.baugrundauftrag);
    expect(BAUGRUND_ORDNER).toBe("10 Bodengutachten");
  });
});

describe("Zuordnung gegen das Feld-Inventar", () => {
  const w = feldwerte(baugrundDaten(dataset(), "p1"));
  it("jedes zugeordnete Feld ist ein beschreibbares Textfeld im richtigen Teil", () => {
    for (const teil of ["auftrag", "anlage"] as const) {
      for (const name of Object.keys(w[teil])) {
        const f = INVENTAR[teil].felder.filter((x) => x.name === name);
        expect(f.length, name).toBeGreaterThan(0);
        expect(f.every((x) => x.typ === "Text" && !x.nurLesen), name).toBe(true);
      }
    }
  });
  it("Auftraggeber, Hersteller, Planer und Bauort auf Seite 1, Ort/Datum auf Seite 2", () => {
    const seite = (name: string) => INVENTAR.auftrag.felder.find((x) => x.name === name)?.seite;
    for (const name of Object.keys(w.auftrag).filter((n) => n !== "Ort Datum")) expect(seite(name), name).toBe(1);
    expect(seite("Ort Datum")).toBe(2);
    expect(w.auftrag["Ort Datum"]).toBeNull();
    expect(w.anlage.Datum).toBeNull();
  });
  it("ankreuzen: E-Mail-Versand (Seite 1) und „Anlage A beigefügt“ (Seite 2) sind Kontrollkästchen", () => {
    const f = (name: string) => INVENTAR.auftrag.felder.find((x) => x.name === name);
    expect(f("GA/RG per EMail im PDFFormat")).toMatchObject({ typ: "Checkbox", seite: 1 });
    expect(f("beigefügt")).toMatchObject({ typ: "Checkbox", seite: 2 });
  });
  it("vorbelegte Clayton-Werte und alles, was der Kunde ankreuzt, fasst die App nicht an", () => {
    const vorbelegt = INVENTAR.auftrag.felder.filter((x) => x.nurLesen || x.typ === "Dropdown").map((x) => x.name);
    expect(new Set(vorbelegt)).toEqual(new Set(["FormularNr", "Anzahl Sondierungen", "€ brutto pauschal 1 Zur Ermittlung der Gründungsparameter für die GaragenCarportgründung wenn auf Seite 1 an", "gekreuzt entstehen zusätzliche Kosten Gleiches gilt wenn hierfür weitere Sondierungen erforderlich sind Die Kosten sind nachfol", "Anzahl Zusatzsondierungen", "Laga 1", "LAGA 2", "DepV"]));
    for (const n of vorbelegt) expect(w.auftrag).not.toHaveProperty(n);
    for (const n of ["nein", "ja voll", "EFH", "Vollgeschosse in", "Garage ja", "Unterschrift Bauherr  Auftraggeber", "ODER Firma"]) expect(w.auftrag).not.toHaveProperty(n);
    expect(ankreuzen(baugrundDaten(dataset(), "p1"))).not.toContain("Ich  Wir beauftragen clayton UmweltConsult GmbH In der Mörschgewanne 16 67065 Ludwigshafen mit der Durchfüh");
  });
  it("das Inventar enthält keine Personendaten, nur Clayton-Vorgaben", () => {
    const werte = Object.values(INVENTAR).flatMap((t) => t.felder.map((f) => f.wert).filter(Boolean));
    expect(new Set(werte)).toEqual(new Set(["324", "2", "924,36", "1.099,99", "0"]));
  });
});

describe("PDF aus den nachgebauten Vorlagen", () => {
  it("Auftrag (3 Seiten) + Anlage A in einem PDF, Werte gesetzt, Vorbelegtes unverändert, Felder bleiben ausfüllbar", async () => {
    const [auftrag, anlage] = await Promise.all([nachbau("auftrag"), nachbau("anlage")]);
    const d = baugrundDaten(dataset(), "p1");
    const res = await erzeugeBaugrundauftrag({ auftrag, anlage, schrift: SCHRIFT, werte: feldwerte(d), ankreuzen: ankreuzen(d) });
    const doc = await PDFDocument.load(res.bytes);
    expect(doc.getPageCount()).toBe(4);
    const form = doc.getForm();
    const anzahl = (t: BaugrundVorlage) => new Set(INVENTAR[t].felder.map((f) => f.name)).size;
    expect(form.getFields()).toHaveLength(anzahl("auftrag") + anzahl("anlage"));
    const text = (n: string) => form.getTextField(n).getText();
    expect(text("Vorund Zunamen AG")).toBe("Jörg Müller-Weißgerber und Bärbel Müller-Weißgerber");
    expect(text("Projektnummer")).toBe("SH-4711");
    expect(text("Planer")).toBe("ABM Demo-Büro");
    expect(text("PLZ Ort Gemarkung")).toBe("89134 Blaustein, Gemarkung Bermaringen");
    expect(text("Ausführung KellerBodenplatte durch Firma")).toBe("Schwabenhaus");
    expect(text("Name BH")).toBe("Jörg Müller-Weißgerber und Bärbel Müller-Weißgerber");
    expect(text("Ort des BV")).toBe("Am Hölzle 12, 89134 Blaustein");
    expect(text("Kontaktdaten BH TelEMail 1")).toBe("07304 000001 / mueller@example.de");
    // Anlage A auf Seite 4
    const seite4 = doc.getPages()[3].ref;
    expect(form.getTextField("Name BH").acroField.getWidgets()[0].P()).toBe(seite4);
    // vorbelegt und unverändert
    expect([text("FormularNr"), text("Anzahl Sondierungen")]).toEqual(["324", "2"]);
    expect(form.getTextField("FormularNr").isReadOnly()).toBe(true);
    // leer: Ort/Datum, Unterschrift, Tel. Hersteller
    for (const n of ["Ort Datum", "Datum", "TelNr HH", "Bauherrschaft falls abweichend vom Auftraggeber"]) expect(text(n) ?? "", n).toBe("");
    // angekreuzt nur E-Mail-Versand und „beigefügt“
    const an = form.getFields().filter((f) => f instanceof PDFCheckBox && f.isChecked()).map((f) => f.getName());
    expect(an.sort()).toEqual(["GA/RG per EMail im PDFFormat", "beigefügt"].sort());
    expect(res.leer.sort()).toEqual(["Bauherrschaft falls abweichend vom Auftraggeber", "Datum", "Ort Datum", "TelNr HH"].sort());
  }, 30_000);

  it("gleich benannte Felder in Auftrag und Anlage: kein PDF", async () => {
    const [auftrag, anlage] = await Promise.all([nachbau("auftrag"), nachbau("anlage", ["Planer"])]);
    await expect(vorlagenZusammenfuegen(auftrag, anlage)).rejects.toBeInstanceOf(ProtokollFehler);
  });

  it("neue Revision ohne ein zugeordnetes Feld: kein PDF", async () => {
    const [auftrag, anlage] = await Promise.all([nachbau("auftrag"), nachbau("anlage")]);
    const werte = feldwerte(baugrundDaten(dataset(), "p1"));
    await expect(erzeugeBaugrundauftrag({ auftrag, anlage, schrift: SCHRIFT, werte: { ...werte, anlage: { ...werte.anlage, "Name BH neu": "x" } }, ankreuzen: [] })).rejects.toThrow(/Name BH neu/);
    await expect(vorlagenZusammenfuegen(new Uint8Array([1, 2, 3]), anlage)).rejects.toBeInstanceOf(ProtokollFehler);
  });
});

// Mit den echten Vorlagen, wenn sie lokal liegen (nicht im Repo, z. B. nicht in CI)
const echt = BAUGRUND_VORLAGEN_LISTE.every((v) => existsSync(`${BAUGRUND_VORLAGEN_ORDNER}/${v.datei}`));
describe.skipIf(!echt)("echte Clayton-Vorlagen (lokal)", () => {
  it("Inventar passt zur Vorlage, PDF besteht die Prüfung, Clayton-Werte bleiben", async () => {
    const auftrag = readFileSync(`${BAUGRUND_VORLAGEN_ORDNER}/${BAUGRUND_VORLAGEN.auftrag.datei}`);
    const anlage = readFileSync(`${BAUGRUND_VORLAGEN_ORDNER}/${BAUGRUND_VORLAGEN.anlage.datei}`);
    for (const [teil, bytes] of [["auftrag", auftrag], ["anlage", anlage]] as const) {
      const namen = (await PDFDocument.load(bytes)).getForm().getFields().map((f) => f.getName());
      expect(new Set(namen)).toEqual(new Set(INVENTAR[teil].felder.map((f) => f.name)));
    }
    const d = baugrundDaten(dataset(), "p1");
    const res = await erzeugeBaugrundauftrag({ auftrag, anlage, schrift: SCHRIFT, werte: feldwerte(d), ankreuzen: ankreuzen(d) });
    const form = (await PDFDocument.load(res.bytes)).getForm();
    expect(form.getTextField("Vorund Zunamen AG").getText()).toContain("Müller-Weißgerber");
    expect(form.getTextField("FormularNr").getText()).toBe("324");
    expect(form.getCheckBox("beigefügt").isChecked()).toBe(true);
    expect(form.getCheckBox("nachgereicht").isChecked()).toBe(false);
  }, 30_000);
});

describe("Demo-Modus: Ablage", () => {
  const admin = { name: "Mehmet Cetin", role: "admin" as const };
  const mitarbeiter = { name: "Mia", role: "mitarbeiter" as const };
  const freelancer = { name: "Frei", role: "freiberufler" as const };
  const pdf = () => new Blob(["%PDF-1.7 Demo"], { type: "application/pdf" });

  it("legt jede Fassung als neues Dokument im Ordner „10 Bodengutachten“ ab, Download in derselben Sitzung", async () => {
    const r = createDemoRepo("2026-11-11", { delayMs: 0 });
    const d0 = await r.load(mitarbeiter);
    expect(d0.folderTemplates.some((t) => t.path === BAUGRUND_ORDNER)).toBe(true);
    const p = d0.projects.find((x) => d0.companies.find((c) => c.id === x.companyId)?.name === "Schwabenhaus")!;
    const a = await r.saveBaugrundauftrag({ projectId: p.id, fileName: "Baugrundauftrag_Clayton_A.pdf", blob: pdf() });
    const b = await r.saveBaugrundauftrag({ projectId: p.id, fileName: "Baugrundauftrag_Clayton_A.pdf", blob: pdf() });
    const d = await r.load(mitarbeiter);
    expect(d.baugrundauftraege?.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(a.erstelltVon).toBe("Mia");
    const docs = d.documents.filter((x) => [a, b].some((y) => y.dokumentId === x.id));
    expect(docs).toHaveLength(2);
    expect(docs.every((x) => x.folderPath === BAUGRUND_ORDNER)).toBe(true);
    expect(await (await r.baugrundauftragDatei(a)).text()).toContain("%PDF");
    // Projekt löschen nimmt die Fassungen mit
    await r.load(admin);
    await r.deleteProject(p.id);
    expect((await r.load(admin)).baugrundauftraege?.some((x) => x.projectId === p.id)).toBe(false);
  });

  it("Freiberufler: sieht keine Fassungen, darf weder Vorlage laden noch ablegen", async () => {
    const r = createDemoRepo("2026-11-11", { delayMs: 0 });
    const p = (await r.load(admin)).projects[0];
    await r.saveBaugrundauftrag({ projectId: p.id, fileName: "x.pdf", blob: pdf() });
    expect((await r.load(freelancer)).baugrundauftraege).toEqual([]);
    await expect(r.saveBaugrundauftrag({ projectId: p.id, fileName: "x.pdf", blob: pdf() })).rejects.toBeInstanceOf(PermissionError);
    await expect(r.baugrundVorlageLaden("auftrag")).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("Migration 0031 und Mapper", () => {
  it("Tabelle mit RLS: lesen und anlegen nur Admin und Mitarbeiter, kein Ändern oder Löschen", () => {
    expect(migration31).toContain("enable row level security");
    expect(migration31).toMatch(/for select to authenticated using \(public\.is_staff\(\)\)/);
    expect(migration31).toMatch(/for insert to authenticated\s+with check \(public\.is_staff\(\) and erstellt_von = auth\.uid\(\)/);
    expect(migration31).not.toMatch(/for (update|delete)/);
    expect(migration31).toMatch(/grant insert \(project_id, erstellt_von, dokument_id\)/);
    expect(COLS.baugrundauftraege).toBe("id, project_id, erstellt_von, erstellt_am, dokument_id");
  });
  it("Mapper", () => {
    expect(toBaugrundauftrag({ id: "x", project_id: "p", erstellt_von: "u", erstellt_am: "2026-11-11T09:05:00+00:00", dokument_id: "d" }, new Map([["u", "Mia"]]))).toMatchObject({ id: "x", projectId: "p", erstelltVon: "Mia", dokumentId: "d" });
  });
});
