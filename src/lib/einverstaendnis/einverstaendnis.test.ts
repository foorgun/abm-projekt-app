import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { ALERT_RULES, computeAlerts } from "../alerts";
import { createDemoRepo } from "../demoRepo";
import { planAlertTaskSync } from "../taskSync";
import type { BauherrContact, BueroDaten, Dataset, Project, Snapshot, TeamMember } from "../types";
import {
  aufzaehlen,
  bauherrPersonen,
  bauherrschaftZeile,
  einverstaendnisDateiname,
  einverstaendnisDaten,
  ENTWURFSVERFASSER_REGEL,
  entwurfsverfasser,
  entwurfsverfasserWaehlen,
  fehlendeAngaben,
  plzOrtMitOrtsteil,
  vollmachtText,
  type EinverstaendnisDaten,
} from "./daten";
import { erzeugeEinverstaendnis } from "./pdf";

// Alle Namen und Anschriften sind erfunden.
const TODAY = "2026-11-09";
const SCHRIFT = readFileSync("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");
const FETT = readFileSync("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf");

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1", abmNr: "8161-1", kind: "neubau", status: "aktiv", companyId: null, salespersonId: null,
    bauherrLabel: "Sommer", location: null, architectId: "t1", planerId: null, baubetreuung: null,
    intakeMonth: null, notes: null, steps: {}, ...over,
  };
}

// Kürzel wie im Büro: BE ist der Standard, MC nur in Baden-Württemberg (Namen erfunden)
const ARCHITEKT: TeamMember = { id: "t1", code: "BE", name: "Paul Anders", role: "architekt", anrede: "Herr", titel: "Dipl.-Ing. (FH), Freier Architekt", anschrift: null, tel: null, email: "anders@example.de" };
const MC: TeamMember = { id: "t2", code: "MC", name: "Mara Cello", role: "architekt", anrede: "Frau", titel: "Freie Architektin" };
const BUERO: BueroDaten = { name: "Demo-Büro", anschrift: "Musterweg 1, 89073 Ulm", tel: "0731 000000", mobil: null, email: "info@example.de" };

const KONTAKT: BauherrContact = {
  projectId: "p1", name: "Lena Sommer", vorname: "Lena", nachname: "Sommer", vorname2: "Tim", nachname2: "Sommer", name2: "Tim Sommer",
  address: null, phone: null, email: null, buildingAddress: null,
  street: "Birkenweg 3", postalCode: "72000", city: "Musterstadt",
  siteStreet: "Am Rain 8", sitePostalCode: "72001", siteCity: "Beispielheim", siteDistrict: "Unterdorf",
};

function dataset(over: { project?: Partial<Project>; kontakt?: BauherrContact | null; team?: TeamMember[]; buero?: BueroDaten | null } = {}): Pick<Dataset, "projects" | "bauherren" | "team" | "buero"> {
  return {
    projects: [project({ flurstueck: "256/2", bauvorhaben: "Neubau Einfamilienhaus mit Doppelgarage", ...over.project })],
    bauherren: over.kontakt === null ? [] : [over.kontakt ?? KONTAKT],
    team: over.team ?? [ARCHITEKT, MC],
    buero: over.buero === undefined ? BUERO : over.buero,
  };
}

async function seitenText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false }).promise;
  const tc = await (await doc.getPage(1)).getTextContent();
  const seiten = doc.numPages;
  await doc.destroy();
  return `${seiten}|` + tc.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}

describe("Werte der Einverständniserklärung", () => {
  it("füllt alle Felder aus Projekt, Bauherr, Architekt und Bürodaten", () => {
    const d = einverstaendnisDaten(dataset(), "p1", "2026-10-21");
    expect(d.bauherrschaft).toEqual({ namen: "Lena und Tim Sommer", strasse: "Birkenweg 3", plzOrt: "72000 Musterstadt" });
    expect(d.bauvorhaben).toBe("Neubau Einfamilienhaus mit Doppelgarage");
    expect(d.grundstueck).toEqual({ plzOrt: "72001 Beispielheim-Unterdorf", strasse: "Am Rain 8", flurstueck: "256/2" });
    // eigene E-Mail des Architekten, Anschrift und Tel. aus den Bürodaten
    expect(d.entwurfsverfasser).toEqual({ name: "Paul Anders", anrede: "Herr", titel: "Dipl.-Ing. (FH), Freier Architekt", anschrift: "Musterweg 1, 89073 Ulm", tel: "0731 000000", email: "anders@example.de" });
    expect(d.personen).toEqual(["Lena Sommer", "Tim Sommer"]);
    expect(d.datum).toBe("21.10.2026");
    expect(d.wahl).toMatchObject({ teamMemberId: "t1", bundeslandFehlt: false });
    expect(fehlendeAngaben(d)).toEqual([]);
  });

  it("Bauherrschaft: gleicher Nachname zusammengefasst, sonst ausgeschrieben, ältere Einträge mit ganzem Namen", () => {
    expect(bauherrschaftZeile(bauherrPersonen(KONTAKT))).toBe("Lena und Tim Sommer");
    const verschieden = { ...KONTAKT, vorname2: "Ben", nachname2: "Maier" };
    expect(bauherrschaftZeile(bauherrPersonen(verschieden))).toBe("Lena Sommer und Ben Maier");
    const alt: BauherrContact = { projectId: "p1", name: "Eva Alt", name2: "Max Alt", address: null, phone: null, email: null, buildingAddress: null };
    expect(bauherrschaftZeile(bauherrPersonen(alt))).toBe("Eva Alt und Max Alt");
    expect(bauherrschaftZeile([])).toBeNull();
    expect(aufzaehlen(["A", "B", "C"])).toBe("A, B und C");
  });

  it("Ort des Grundstücks: Ortsteil mit Bindestrich, nicht doppelt", () => {
    expect(plzOrtMitOrtsteil("72001", "Beispielheim", "Unterdorf")).toBe("72001 Beispielheim-Unterdorf");
    expect(plzOrtMitOrtsteil("72001", "Beispielheim-Unterdorf", "Unterdorf")).toBe("72001 Beispielheim-Unterdorf");
    expect(plzOrtMitOrtsteil("89584", "Ehingen", "Ehingen-Süd")).toBe("89584 Ehingen-Süd");
    expect(plzOrtMitOrtsteil(null, "Beispielheim", null)).toBe("Beispielheim");
    expect(plzOrtMitOrtsteil(null, null, null)).toBeNull();
  });

  it("alte einzeilige Anschriften werden aufgeteilt; Flurstück ohne doppelte Vorsilbe; Ort notfalls aus dem Projekt", () => {
    const kontakt: BauherrContact = { projectId: "p1", name: "Eva Alt", address: "Lindenweg 12, 89073 Ulm", phone: null, email: null, buildingAddress: "Am Hang 4" };
    const d = einverstaendnisDaten(dataset({ kontakt, project: { flurstueck: "Flst. 12/3", location: "Blaustein" } }), "p1", TODAY);
    expect(d.bauherrschaft).toMatchObject({ strasse: "Lindenweg 12", plzOrt: "89073 Ulm" });
    expect(d.grundstueck).toEqual({ plzOrt: "Blaustein", strasse: "Am Hang 4", flurstueck: "12/3" });
  });

  it("Entwurfsverfasser: ohne eigene Angaben die Bürodaten, ohne Architekt leer", () => {
    expect(entwurfsverfasser({ ...ARCHITEKT, email: null }, BUERO).email).toBe("info@example.de");
    expect(entwurfsverfasser(undefined, null)).toEqual({ name: null, anrede: null, titel: null, anschrift: null, tel: null, email: null });
  });

  it("listet fehlende Angaben, ohne Fehler", () => {
    const d = einverstaendnisDaten(dataset({ kontakt: null, team: [], buero: null, project: { flurstueck: null, bauvorhaben: null } }), "p1", TODAY);
    expect(fehlendeAngaben(d)).toEqual([
      "Name der Bauherrschaft",
      "Straße der Bauherrschaft",
      "PLZ und Ort der Bauherrschaft",
      "Bauvorhaben",
      "PLZ und Ort des Baugrundstücks",
      "Straße des Baugrundstücks",
      "Flurstück",
      "Architekt BE im Team (Entwurfsverfasser)",
      "Anschrift des Architekten",
      "Tel. des Architekten",
      "E-Mail des Architekten",
    ]);
  });

  it("Vollmachtstext: wir/ich, Herrn/Frau, Lücken als Linie", () => {
    const d = einverstaendnisDaten(dataset(), "p1", TODAY);
    expect(vollmachtText(d)).toBe(
      "Hiermit bevollmächtigen wir – als Bauherrschaft – Herrn Paul Anders als Vertreter der Bauherrschaft Lena Sommer und Tim Sommer, folgende Handlungen in Bezug auf oben genanntes Bauvorhaben vorzunehmen:",
    );
    const eine: EinverstaendnisDaten = { ...d, personen: ["Lena Sommer"], entwurfsverfasser: { ...d.entwurfsverfasser, anrede: "Frau", name: "Paula Anders" } };
    expect(vollmachtText(eine)).toContain("Hiermit bevollmächtige ich – als Bauherrschaft – Frau Paula Anders als Vertreter der Bauherrschaft Lena Sommer,");
    const leer: EinverstaendnisDaten = { ...d, personen: [], entwurfsverfasser: { ...d.entwurfsverfasser, name: null } };
    expect(vollmachtText(leer, "___")).toContain("– ___ als Vertreter der Bauherrschaft ___,");
  });

  it("Dateiname ohne verbotene Zeichen, mit Zeitstempel", () => {
    expect(einverstaendnisDateiname("Müller / Weiß", new Date(2026, 9, 21, 8, 5))).toBe("Einverstaendniserklaerung_Müller-Weiß_2026-10-21_0805.pdf");
    expect(einverstaendnisDateiname("  ", new Date(2026, 9, 21, 8, 5))).toBe("Einverstaendniserklaerung_Projekt_2026-10-21_0805.pdf");
  });
});

describe("Wer ist Entwurfsverfasser (ENTWURFSVERFASSER_REGEL)", () => {
  const team = [ARCHITEKT, MC, { id: "t3", code: null, name: "Planer X", role: "planer" as const }];
  const wahl = (architectId: string | null, bundesland: string | null, siteState: string | null = null) =>
    entwurfsverfasserWaehlen({ architectId, bundesland }, team, siteState ? { ...KONTAKT, siteState } : KONTAKT);

  it("Regel als Konstante: BE immer, MC nur in BW", () => {
    expect(ENTWURFSVERFASSER_REGEL).toEqual({ standard: "BE", nurInBW: "MC", bundesland: "BW" });
  });

  it("MC eingetragen und Bauort in Baden-Württemberg: MC", () => {
    expect(wahl("t2", "BW").mitglied?.id).toBe("t2");
    // ausgeschriebenes Land beim Bauort reicht, wenn das Feld am Projekt fehlt
    expect(wahl("t2", null, "Baden-Württemberg").mitglied?.id).toBe("t2");
  });

  it("MC eingetragen, Bauort in einem anderen Land: BE", () => {
    const w = wahl("t2", "BY");
    expect(w.mitglied?.id).toBe("t1");
    expect(w.bundeslandFehlt).toBe(false);
    // Feld am Projekt geht vor dem Text beim Bauort
    expect(wahl("t2", "BY", "Baden-Württemberg").mitglied?.id).toBe("t1");
  });

  it("MC eingetragen, Bundesland unbekannt: vorerst BE, mit Hinweis", () => {
    const w = wahl("t2", null);
    expect(w.mitglied?.id).toBe("t1");
    expect(w.bundeslandFehlt).toBe(true);
    const d = einverstaendnisDaten(dataset({ project: { architectId: "t2", bundesland: null } }), "p1", TODAY);
    expect(fehlendeAngaben(d)).toContain("Bundesland des Bauorts (entscheidet über den Entwurfsverfasser)");
  });

  it("BE, ein anderer oder kein Architekt eingetragen: immer BE, in jedem Land", () => {
    for (const land of ["BW", "BY", null]) {
      expect(wahl("t1", land).mitglied?.id).toBe("t1");
      expect(wahl("t3", land).mitglied?.id).toBe("t1");
      expect(wahl(null, land).mitglied?.id).toBe("t1");
      expect(wahl(null, land).bundeslandFehlt).toBe(false);
    }
  });

  it("Kürzel unabhängig von Groß-/Kleinschreibung; ohne BE im Team bleibt das Feld leer", () => {
    expect(entwurfsverfasserWaehlen({ architectId: null, bundesland: "BW" }, [{ ...ARCHITEKT, code: " be " }], null).mitglied?.id).toBe("t1");
    expect(entwurfsverfasserWaehlen({ architectId: "t2", bundesland: "BY" }, [MC], null).mitglied).toBeUndefined();
  });

  it("im PDF-Text steht der gewählte Architekt mit seiner Anrede", () => {
    const bw = einverstaendnisDaten(dataset({ project: { architectId: "t2", bundesland: "BW" } }), "p1", TODAY);
    expect(vollmachtText(bw)).toContain("– Frau Mara Cello als Vertreter");
    const by = einverstaendnisDaten(dataset({ project: { architectId: "t2", bundesland: "BY" } }), "p1", TODAY);
    expect(vollmachtText(by)).toContain("– Herrn Paul Anders als Vertreter");
  });
});

describe("PDF", () => {
  it("eine Seite mit allen Angaben, Umlauten und einer Unterschriftszeile je Bauherr", async () => {
    const d = einverstaendnisDaten(dataset(), "p1", "2026-10-21");
    const text = await seitenText(await erzeugeEinverstaendnis({ daten: d, schrift: SCHRIFT, schriftFett: FETT }));
    expect(text.startsWith("1|")).toBe(true);
    for (const teil of [
      "Bauherrschaft:",
      "Lena und Tim Sommer",
      "Birkenweg 3",
      "72000 Musterstadt",
      "Neubau Einfamilienhaus mit Doppelgarage",
      "72001 Beispielheim-Unterdorf",
      "Flst.-Nr.: 256/2",
      "Einverständniserklärung / Vollmacht",
      "Paul Anders, Dipl.-Ing. (FH), Freier Architekt",
      "Tel.: 0731 000000",
      "E-Mail: anders@example.de",
      "Einreichung des Bauantrags",
      "Entgegennahme der Baugenehmigung",
      "21.10.2026",
      "Lena Sommer",
      "Tim Sommer",
    ]) {
      expect(text, teil).toContain(teil);
    }
  });

  it("ohne Angaben entsteht trotzdem ein PDF (Lücken als Linie)", async () => {
    const d = einverstaendnisDaten(dataset({ kontakt: null, team: [], buero: null, project: { flurstueck: null, bauvorhaben: null } }), "p1", TODAY);
    const text = await seitenText(await erzeugeEinverstaendnis({ daten: d, schrift: SCHRIFT, schriftFett: FETT }));
    expect(text).toContain("Einverständniserklärung / Vollmacht");
    expect(text).not.toContain("Flst.-Nr.");
    // eine Unterschriftszeile mit Platzhalter
    expect(text).toContain("Bauherrschaft");
  });

  it("vier Bauherren passen auf eine Seite", async () => {
    const d: EinverstaendnisDaten = { ...einverstaendnisDaten(dataset(), "p1", TODAY), personen: ["A Eins", "B Zwei", "C Drei", "D Vier"] };
    const text = await seitenText(await erzeugeEinverstaendnis({ daten: d, schrift: SCHRIFT, schriftFett: FETT }));
    expect(text.startsWith("1|")).toBe(true);
    expect(text).toContain("D Vier");
  });
});

describe("Warnung und Aufgabe „Einverständniserklärung fehlt“", () => {
  const snap = (p: Project, liste: Snapshot["einverstaendnisse"] | "ohne" = []): Snapshot => ({ companies: [], salespeople: [], team: [], projects: [p], invoices: [], einverstaendnisse: liste === "ohne" ? undefined : liste });
  const ab = ALERT_RULES.einverstaendnisAbSchritt;

  it("Schwelle ist eine Konstante (Annahme): ab Vertrag zurück", () => {
    expect(ab).toBe("vertrag_zurueck");
  });

  it("warnt ab dem Schritt, solange keine Erklärung erzeugt und das Baugesuch nicht übergeben ist", () => {
    const p = project({ steps: { [ab]: "2026-11-01" } });
    const alerts = computeAlerts(snap(p), TODAY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "einverstaendnis_fehlt:p1", kind: "einverstaendnis_fehlt", severity: "hinweis", days: 8, title: "Einverständniserklärung fehlt" });
  });

  it("keine Warnung vor dem Schritt, mit Erklärung, nach Übergabe des Baugesuchs, bei Bauvoranfragen, inaktiven Projekten oder ohne geladene Liste", () => {
    const p = project({ steps: { [ab]: "2026-11-01" } });
    expect(computeAlerts(snap(project()), TODAY)).toHaveLength(0);
    expect(computeAlerts(snap(p, [{ id: "e1", projectId: "p1", erstelltVon: null, erstelltAm: "2026-11-02T10:00:00", dokumentId: null }]), TODAY)).toHaveLength(0);
    expect(computeAlerts(snap(project({ steps: { [ab]: "2026-11-01", baugesuch_uebergabe: "2026-11-05" } })), TODAY)).toHaveLength(0);
    expect(computeAlerts(snap(project({ kind: "bauvoranfrage", steps: { [ab]: "2026-11-01" } })), TODAY)).toHaveLength(0);
    expect(computeAlerts(snap(project({ status: "abgeschlossen", steps: { [ab]: "2026-11-01" } })), TODAY)).toHaveLength(0);
    expect(computeAlerts(snap(p, "ohne"), TODAY)).toHaveLength(0);
  });

  it("erzeugt daraus eine Aufgabe für den Architekten und erledigt sie, sobald die Erklärung da ist", () => {
    const p = project({ steps: { [ab]: "2026-11-01" } });
    const plan = planAlertTaskSync(computeAlerts(snap(p), TODAY), [], [p], TODAY);
    expect(plan.create).toEqual([{ title: "Einverständniserklärung erzeugen", projectId: "p1", dueOn: "2026-11-12", assigneeId: "t1", source: "warnung", sourceKey: "einverstaendnis_fehlt:p1:hinweis" }]);
    const offen = { id: "task1", projectId: "p1", title: "Einverständniserklärung erzeugen", dueOn: "2026-11-12", assigneeId: "t1", status: "offen" as const, source: "warnung" as const, sourceKey: "einverstaendnis_fehlt:p1:hinweis", createdAt: TODAY, doneAt: null };
    const danach = computeAlerts(snap(p, [{ id: "e1", projectId: "p1", erstelltVon: null, erstelltAm: "2026-11-09T10:00:00", dokumentId: null }]), TODAY);
    expect(planAlertTaskSync(danach, [offen], [p], TODAY).close).toEqual(["task1"]);
  });
});

describe("Demo-Repo", () => {
  it("speichert Bauvorhaben und Angaben des Architekten, legt die Erklärung ab (nur Mitarbeiter)", async () => {
    const repo = createDemoRepo(TODAY, { delayMs: 0 });
    const admin = await repo.load({ name: "Admin", role: "admin" });
    const p = admin.projects.find((x) => x.status === "aktiv" && x.architectId)!;
    await repo.setBauvorhaben(p.id, "  Neubau   Einfamilienhaus ");
    await repo.saveArchitektAngaben(p.architectId!, { anrede: "Frau", titel: " Freie Architektin ", anschrift: "", tel: null, email: "a@example.de" });
    await expect(repo.saveArchitektAngaben(p.architectId!, { anrede: null, titel: null, anschrift: null, tel: null, email: "kein-at" })).rejects.toThrow();
    const e = await repo.saveEinverstaendnis({ projectId: p.id, fileName: "Einverstaendniserklaerung_Test.pdf", blob: new Blob(["%PDF"]) });
    const d = await repo.load({ name: "Admin", role: "admin" });
    expect(d.projects.find((x) => x.id === p.id)?.bauvorhaben).toBe("Neubau Einfamilienhaus");
    expect(d.team.find((t) => t.id === p.architectId)).toMatchObject({ anrede: "Frau", titel: "Freie Architektin", anschrift: null, email: "a@example.de" });
    expect(d.einverstaendnisse?.[0]).toMatchObject({ id: e.id, projectId: p.id });
    expect(d.documents.find((x) => x.id === e.dokumentId)?.folderPath).toBe("08 Bauantrag");
    expect(await repo.einverstaendnisDatei(e)).toBeInstanceOf(Blob);

    const frei = await repo.load({ name: "Frei", role: "freiberufler" });
    expect(frei.einverstaendnisse).toBeUndefined();
    await expect(repo.setBauvorhaben(p.id, "X")).rejects.toThrow();
    await expect(repo.saveEinverstaendnis({ projectId: p.id, fileName: "x.pdf", blob: new Blob(["%PDF"]) })).rejects.toThrow();
  });
});
