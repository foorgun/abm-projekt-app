// Vertrag nachträglich auslesen: neue Felder (Flur, Kontakt des Vermessers, Keller/Bodenplatte bauseits) in Anweisung,
// Antwortprüfung und Mock sowie Vergleich und Vorauswahl gegen ein bestehendes Projekt.
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, toResponse } from "../../../supabase/functions/extract-project/logic";
import type { BauherrContact, Project, ProjectParty } from "../types";
import { SCAN_WERKVERTRAG_FELDER, VERMESSERVERTRAG_ZEILEN } from "./fixtures";
import { draftFromText } from "./mockExtractor";
import { beteiligteNachAnlage, KELLER_BAUSEITS, patchAusVergleich, vergleichZeilen, vorauswahl, type VergleichKontext } from "./nachtraeglich";
import { emptyFields, normalizeFields, type DraftField, type DraftFieldKey, type ProjectDraft, type Vertragsart } from "./types";

const field = (wert: string, sicherheit: DraftField["sicherheit"] = "hoch"): DraftField => ({ wert, quelle: { text: "Stelle", seite: 1 }, sicherheit });

function draftOf(art: Vertragsart, felder: Partial<Record<DraftFieldKey, string>>): ProjectDraft {
  const raw = Object.fromEntries(Object.entries(felder).map(([k, v]) => [k, field(v as string)]));
  return { datei: { name: "v.pdf", size: 1000, type: "application/pdf" }, textquelle: "pdf", extractor: "mock", gescannt: false, felder: normalizeFields(raw, false, art), hinweise: [] };
}

const PROJECT: Project = {
  id: "p1",
  abmNr: "2026-0001",
  kind: "neubau",
  status: "aktiv",
  companyId: null,
  salespersonId: null,
  bauherrLabel: "Hoffmann",
  location: null,
  architectId: null,
  planerId: null,
  baubetreuung: null,
  intakeMonth: null,
  notes: null,
  flurstueck: null,
  gemarkung: null,
  flur: null,
  steps: {},
};
const CONTACT: BauherrContact = { projectId: "p1", name: "Hoffmann", address: "Lindenweg 12, 89073 Ulm", phone: "0731 000111", email: null, buildingAddress: null };

const ctxOf = (over: { project?: Partial<Project>; contact?: Partial<BauherrContact> | null; parties?: Omit<ProjectParty, "projectId" | "contact">[] } = {}): VergleichKontext => ({
  project: { ...PROJECT, ...over.project },
  contact: over.contact === null ? null : { ...CONTACT, ...over.contact },
  parties: (over.parties ?? []).map((p) => ({ projectId: "p1", contact: null, ...p })),
});

describe("Auslesung: neue Felder", () => {
  it("die Anweisung erklärt Flur, Kontakt des Vermessers und Keller bauseits (nur ausdrücklich, nie „nein“)", () => {
    expect(SYSTEM_PROMPT).toMatch(/flur ist nur die Nummer der Flur/);
    expect(SYSTEM_PROMPT).toMatch(/vermesserAnschrift, vermesserTelefon, vermesserEmail: [^\n]*nie die des Bauherrn/);
    expect(SYSTEM_PROMPT).toMatch(/kellerBauseits: "ja" NUR, wenn der Vertrag ausdrücklich[^\n]*bauseits[^\n]*Eigenleistung[^\n]*nicht im Leistungsumfang[^\n]*nie "nein"/);
    // nur der Werkvertrag kennt das Feld
    expect(SYSTEM_PROMPT).toMatch(/- werkvertrag: [^\n]*kellerBauseits/);
    expect(SYSTEM_PROMPT).not.toMatch(/- vermessungsvertrag: [^\n]*kellerBauseits/);
    expect(SYSTEM_PROMPT).toMatch(/- vermessungsvertrag: [^\n]*flur, flurstueck[^\n]*vermesserAnschrift/);
  });

  it("Antwortprüfung: kellerBauseits nur als „ja“ und nur im Werkvertrag", () => {
    const antwort = (wert: string, art: "werkvertrag" | "vermessungsvertrag") => toResponse({ felder: [{ feld: "kellerBauseits", wert, quelle: "Bodenplatte bauseits", seite: 1, sicherheit: "hoch" }], hinweise: [] }, art);
    const ja = antwort(" JA ", "werkvertrag");
    expect(ja.ok && ja.felder.kellerBauseits.wert).toBe("ja");
    const nein = antwort("nein", "werkvertrag");
    expect(nein.ok && nein.felder.kellerBauseits).toEqual({ wert: null, quelle: null, sicherheit: "niedrig" });
    const falscheArt = antwort("ja", "vermessungsvertrag");
    expect(falscheArt.ok && falscheArt.felder.kellerBauseits.wert).toBeNull();
    // auch die App lässt nur "ja" stehen
    expect(normalizeFields({ kellerBauseits: field("vielleicht") }, false, "werkvertrag").kellerBauseits.wert).toBeNull();
    expect(normalizeFields({ kellerBauseits: field("Ja") }, false, "werkvertrag").kellerBauseits.wert).toBe("ja");
    expect(normalizeFields({ kellerBauseits: field("ja") }, false, "sonstiges").kellerBauseits.wert).toBeNull();
  });

  it("der Mock liest Flur und Anschrift des Vermessers aus dem Vermesservertrag", () => {
    const d = draftFromText({ name: "v.pdf", size: 1, type: "application/pdf" }, [VERMESSERVERTRAG_ZEILEN.join("\n")], "pdf");
    expect(d.felder.flur.wert).toBe("3");
    expect(d.felder.flurstueck.wert).toBe("1234/5");
    expect(d.felder.vermesser.wert).toBe("Vermessungsbüro Beispiel");
    expect(d.felder.vermesserAnschrift.wert).toBe("Musterstraße 1, 89073 Ulm");
    expect(d.felder.kellerBauseits.wert).toBeNull();
  });

  it("der Mock erkennt Keller/Bodenplatte bauseits nur bei ausdrücklicher Nennung", () => {
    const werk = (zeile: string) => draftFromText({ name: "w.pdf", size: 1, type: "application/pdf" }, [`Werkvertrag über die Errichtung eines Hauses\n1. Bauherr: Hoffmann, Jonas\n${zeile}`], "pdf");
    expect(werk("Die Bodenplatte wird bauseits erstellt.").felder.kellerBauseits).toMatchObject({ wert: "ja", quelle: { text: "Die Bodenplatte wird bauseits erstellt." } });
    expect(werk("Keller: Eigenleistung des Bauherrn").felder.kellerBauseits.wert).toBe("ja");
    expect(werk("Keller in Fertigbauweise inklusive").felder.kellerBauseits.wert).toBeNull();
    expect(werk("Haus ohne Keller").felder.kellerBauseits.wert).toBeNull();
    expect(SCAN_WERKVERTRAG_FELDER.kellerBauseits?.wert).toBe("ja");
  });
});

describe("Vergleich mit dem Projekt", () => {
  const verm = draftOf("vermessungsvertrag", {
    buildingAddress: "Am Hölzle 12, 89134 Blaustein",
    location: "Blaustein",
    flur: "3",
    flurstueck: "1234/5",
    gemarkung: "Bermaringen",
    vermesser: "Vermessungsbüro Beispiel",
    vermesserAnschrift: "Musterstraße 1, 89073 Ulm",
    bauherrName: "Jonas Hoffmann",
    phone: "0731 000119",
    address: "Lindenweg 12, 89073 Ulm",
  });

  it("leere Felder sind vorgewählt, abweichende nicht, gleiche als „gleich“", () => {
    const ctx = ctxOf({ project: { gemarkung: "Bermaringen", flurstueck: "999" } });
    const zeilen = vergleichZeilen(verm, ctx);
    const by = Object.fromEntries(zeilen.map((z) => [z.key, z]));
    expect(by.buildingAddress).toMatchObject({ status: "neu", vorgewaehlt: true, aktuell: null, neu: "Am Hölzle 12, 89134 Blaustein" });
    expect(by.flur).toMatchObject({ status: "neu", vorgewaehlt: true });
    expect(by.gemarkung).toMatchObject({ status: "gleich", vorgewaehlt: false });
    expect(by.flurstueck).toMatchObject({ status: "abweichend", vorgewaehlt: false, aktuell: "999" });
    // Telefon weicht ab (Konflikt), Wohnanschrift ist gleich
    expect(by.phone).toMatchObject({ status: "abweichend", vorgewaehlt: false });
    expect(by.address.status).toBe("gleich");
    // im Projekt nur der Nachname: der volle Name ergänzt ihn
    expect(by.bauherrName).toMatchObject({ status: "neu", vorgewaehlt: true, aktuell: "Hoffmann" });
    expect(by.vermesser).toMatchObject({ status: "neu", zusatz: "Musterstraße 1, 89073 Ulm" });
    expect([...vorauswahl(zeilen)].sort()).toEqual(["bauherrName", "buildingAddress", "flur", "location", "vermesser"]);
  });

  it("gleich trotz anderer Schreibweise: Bauort mit PLZ, Flur mit Vorsatz, getrennte Bauadresse, Telefon mit Leerzeichen", () => {
    const ctx = ctxOf({
      project: { location: "89134 Blaustein", flur: "Flur 3", flurstueck: "Flst. 1234/5" },
      contact: { phone: "0731/000119", siteStreet: "Am Hölzle 12", sitePostalCode: "89134", siteCity: "Blaustein" },
    });
    const status = Object.fromEntries(vergleichZeilen(verm, ctx).map((z) => [z.key, z.status]));
    expect(status).toMatchObject({ location: "gleich", flur: "gleich", flurstueck: "gleich", buildingAddress: "gleich", phone: "gleich" });
  });

  it("schreibt nur gewählte Felder; Bauadresse mit getrennten Feldern, übrige Kontaktdaten bleiben", () => {
    const ctx = ctxOf({ project: { flurstueck: "999" } });
    const zeilen = vergleichZeilen(verm, ctx);
    const patch = patchAusVergleich(zeilen, vorauswahl(zeilen), verm, ctx);
    expect(patch?.project).toEqual({ location: "Blaustein", flur: "3", gemarkung: "Bermaringen" });
    expect(patch?.bauherr).toMatchObject({
      phone: "0731 000111",
      address: "Lindenweg 12, 89073 Ulm",
      email: null,
      buildingAddress: "Am Hölzle 12, 89134 Blaustein",
      siteStreet: "Am Hölzle 12",
      sitePostalCode: "89134",
      siteCity: "Blaustein",
      vorname: "Jonas",
      nachname: "Hoffmann",
    });
    expect(patch?.parties?.vermesser).toEqual({ name: "Vermessungsbüro Beispiel", contact: null, address: "Musterstraße 1, 89073 Ulm", phone: null, mobile: null, email: null, fax: null });
    // Konflikt bewusst gewählt: dann wird überschrieben
    const mitKonflikt = patchAusVergleich(zeilen, new Set(["flurstueck", "phone"]), verm, ctx);
    expect(mitKonflikt).toEqual({ project: { flurstueck: "1234/5" }, bauherr: { phone: "0731 000119", email: null, address: "Lindenweg 12, 89073 Ulm", buildingAddress: null } });
    // nichts gewählt: nichts zu tun; gleiche Werte werden auch gewählt nie geschrieben
    expect(patchAusVergleich(zeilen, new Set(), verm, ctx)).toBeNull();
    expect(patchAusVergleich(zeilen, new Set(["address"]), verm, ctx)).toBeNull();
  });

  it("gleicher Vermesser: nur fehlender Kontakt wird ergänzt, nichts überschrieben", () => {
    const ctx = ctxOf({ parties: [{ role: "vermesser", name: "Vermessungsbüro Beispiel", phone: "0731 1" }] });
    const z = vergleichZeilen(verm, ctx).find((x) => x.key === "vermesser")!;
    expect(z).toMatchObject({ status: "neu", aktuell: "Vermessungsbüro Beispiel" });
    expect(patchAusVergleich([z], new Set(["vermesser"]), verm, ctx)?.parties?.vermesser).toEqual({ name: "Vermessungsbüro Beispiel", address: "Musterstraße 1, 89073 Ulm" });
    // mit vollständigem Kontakt: gleich
    const voll = ctxOf({ parties: [{ role: "vermesser", name: "Vermessungsbüro Beispiel", address: "Musterstraße 1, 89073 Ulm" }] });
    expect(vergleichZeilen(verm, voll).find((x) => x.key === "vermesser")?.status).toBe("gleich");
    // anderer Vermesser: Konflikt, nicht vorgewählt
    const anders = ctxOf({ parties: [{ role: "vermesser", name: "Clayton Vermessung" }] });
    expect(vergleichZeilen(verm, anders).find((x) => x.key === "vermesser")).toMatchObject({ status: "abweichend", vorgewaehlt: false });
  });

  it("Werkvertrag mit Keller bauseits: Kellerbauer „Bauseits“, vorgewählt nur ohne anderen Kellerbauer", () => {
    const werk = draftOf("werkvertrag", { kellerBauseits: "ja", bauherrName: "Jonas Hoffmann" });
    const leer = ctxOf();
    const z = vergleichZeilen(werk, leer).find((x) => x.key === "kellerBauseits")!;
    expect(z).toMatchObject({ status: "neu", vorgewaehlt: true, neu: KELLER_BAUSEITS, label: "Kellerbauer/Bodenplatte" });
    expect(patchAusVergleich([z], new Set(["kellerBauseits"]), werk, leer)?.parties?.kellerbauer).toMatchObject({ name: KELLER_BAUSEITS, phone: null });
    const anderer = ctxOf({ parties: [{ role: "kellerbauer", name: "Keller Müller GmbH" }] });
    expect(vergleichZeilen(werk, anderer).find((x) => x.key === "kellerBauseits")).toMatchObject({ status: "abweichend", vorgewaehlt: false, aktuell: "Keller Müller GmbH" });
    const schon = ctxOf({ parties: [{ role: "kellerbauer", name: "bauseits" }] });
    expect(vergleichZeilen(werk, schon).find((x) => x.key === "kellerBauseits")?.status).toBe("gleich");
    // ohne "ja" keine Zeile
    expect(vergleichZeilen(draftOf("werkvertrag", { bauherrName: "Jonas Hoffmann" }), leer).some((x) => x.key === "kellerBauseits")).toBe(false);
  });

  it("ohne Kontakt im Projekt: Bauherr-Felder sind leer und vorgewählt", () => {
    const ctx = ctxOf({ contact: null });
    const zeilen = vergleichZeilen(verm, ctx);
    expect(zeilen.filter((z) => ["phone", "address", "bauherrName"].includes(z.key)).every((z) => z.status === "neu" && z.vorgewaehlt)).toBe(true);
    expect(patchAusVergleich(zeilen, vorauswahl(zeilen), verm, ctx)?.bauherr).toMatchObject({ phone: "0731 000119", email: null, address: "Lindenweg 12, 89073 Ulm", city: "Ulm" });
  });
});

describe("Beim Anlegen aus einem Vertrag", () => {
  it("Kellerbauer „Bauseits“ und Kontakt des Vermessers, solange der Vermesser im Formular der ausgelesene ist", () => {
    const d: ProjectDraft = { ...draftOf("sonstiges", {}), felder: { ...emptyFields(), kellerBauseits: field("ja"), vermesser: field("Vermessungsbüro Beispiel"), vermesserTelefon: field("0731 9") } };
    expect(beteiligteNachAnlage(d, "Vermessungsbüro Beispiel")).toEqual({ kellerbauer: { name: KELLER_BAUSEITS }, vermesser: { name: "Vermessungsbüro Beispiel", address: null, phone: "0731 9", email: null } });
    expect(beteiligteNachAnlage(d, "Anderes Büro")).toEqual({ kellerbauer: { name: KELLER_BAUSEITS } });
    expect(beteiligteNachAnlage(draftOf("werkvertrag", { bauherrName: "A B" }), null)).toBeNull();
    expect(beteiligteNachAnlage(null, null)).toBeNull();
  });
});
