// Planungsprotokoll im Repo: Rechte (wie RLS 0013/0014), Ablage ohne Überschreiben, Bearbeiten neuer Felder,
// Abgleich der Migrationen mit der App.
import { describe, expect, it } from "vitest";
import migration13 from "../../../supabase/migrations/0013_planungsprotokoll_stammdaten.sql?raw";
import migration14 from "../../../supabase/migrations/0014_planungsprotokolle.sql?raw";
import { createDemoRepo } from "../demoRepo";
import { applyDraft } from "../extract/applyDraft";
import { emptyDraft } from "../extract/types";
import { folgeAnschrift, PARTY_LABEL, planProjectUpdate } from "../projectEdit";
import { PermissionError } from "../repo";
import { toParty, toPlanungsprotokoll } from "../supabase/mappers";
import { bauherrJson } from "../supabaseRepo";
import { CLASSIC_PARTY_ROLES, type PartyRole } from "../types";
import { protokollDaten } from "./daten";
import { PROTOKOLL_ORDNER, VORLAGEN } from "./vorlagen";
import { feldStand } from "./zuordnung";

const TODAY = "2026-10-15";
const admin = { name: "Mehmet Cetin", role: "admin" as const };
const mitarbeiter = { name: "Mia", role: "mitarbeiter" as const };
const freelancer = { name: "Frei", role: "freiberufler" as const };
const repo = () => createDemoRepo(TODAY, { delayMs: 0 });
const pdf = () => new Blob(["%PDF-1.7 Demo"], { type: "application/pdf" });

describe("Demo-Modus: Planungsprotokoll", () => {
  it("Demo-Daten haben Bürodaten und Beispielkontakte für die neuen Rollen, lückenhaft", async () => {
    const d = await repo().load(admin);
    expect(d.buero?.name).toContain("Demo");
    const roles = new Set(d.parties.map((x) => x.role));
    for (const r of ["kellerbauer", "baugrundgutachter", "gemeinde", "bauamt", "schornsteinfeger", "gas", "fernwaerme", "abwasser", "sachbearbeiter"] as PartyRole[]) expect(roles.has(r), r).toBe(true);
    // nicht jedes Projekt hat jede Rolle: so kommen leere Felder im Protokoll vor
    const p = d.projects[0];
    expect(d.parties.filter((x) => x.projectId === p.id && x.role === "gas").length).toBeLessThanOrEqual(1);
    const stand = d.projects.map((x) => feldStand("living-haus", protokollDaten(d, x.id)).gefuellt);
    expect(Math.min(...stand)).toBeLessThan(51);
    expect(Math.max(...stand)).toBeGreaterThan(35);
  });

  it("Freiberufler sieht weder Bürodaten noch Protokolle noch die neuen Rollen", async () => {
    const d = await repo().load(freelancer);
    expect(d.buero).toBeNull();
    expect(d.planungsprotokolle).toEqual([]);
    expect(d.parties.length).toBeGreaterThan(0);
    expect(d.parties.every((x) => CLASSIC_PARTY_ROLES.includes(x.role))).toBe(true);
  });

  it("legt jede Fassung als neues Dokument im Ordner „08 Bauantrag“ ab, nichts wird überschrieben", async () => {
    const r = repo();
    const d0 = await r.load(mitarbeiter);
    const p = d0.projects[0];
    const name = "Planungsprotokoll_SH_Test_2026-10-15_1200_bearbeitbar.pdf";
    const a = await r.savePlanungsprotokoll({ projectId: p.id, vorlage: "schwabenhaus", variante: "bearbeitbar", fileName: name, blob: pdf() });
    const b = await r.savePlanungsprotokoll({ projectId: p.id, vorlage: "schwabenhaus", variante: "bearbeitbar", fileName: name, blob: pdf() });
    const c = await r.savePlanungsprotokoll({ projectId: p.id, vorlage: "schwabenhaus", variante: "flach", fileName: name.replace("bearbeitbar", "flach"), blob: pdf() });
    const d = await r.load(mitarbeiter);
    expect(d.planungsprotokolle.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    expect(a.erstelltVon).toBe("Mia");
    const docs = d.documents.filter((x) => [a, b, c].some((y) => y.dokumentId === x.id));
    expect(docs).toHaveLength(3);
    expect(docs.every((x) => x.folderPath === PROTOKOLL_ORDNER && x.mime === "application/pdf")).toBe(true);
    // gleicher Name: eigener Speicherpfad statt überschreiben
    expect(new Set(docs.map((x) => x.storagePath)).size).toBe(3);
    expect(await (await r.planungsprotokollDatei(a)).text()).toContain("%PDF");
    expect(d.activities.some((x) => x.projectId === p.id && x.text === `${name} abgelegt`)).toBe(true);
  });

  it("Freiberufler darf kein Protokoll ablegen, keine Vorlage laden, keine Datei holen", async () => {
    const r = repo();
    const d = await r.load(admin);
    const p = d.projects[0];
    const pp = await r.savePlanungsprotokoll({ projectId: p.id, vorlage: "bien-zenker", variante: "flach", fileName: "x.pdf", blob: pdf() });
    await r.load(freelancer);
    await expect(r.savePlanungsprotokoll({ projectId: p.id, vorlage: "bien-zenker", variante: "flach", fileName: "x.pdf", blob: pdf() })).rejects.toBeInstanceOf(PermissionError);
    await expect(r.vorlageLaden("bien-zenker")).rejects.toBeInstanceOf(PermissionError);
    await expect(r.planungsprotokollDatei(pp)).rejects.toBeInstanceOf(PermissionError);
  });

  it("Projekt löschen nimmt die Protokolle mit", async () => {
    const r = repo();
    const d = await r.load(admin);
    const p = d.projects[0];
    await r.savePlanungsprotokoll({ projectId: p.id, vorlage: "living-haus", variante: "flach", fileName: "x.pdf", blob: pdf() });
    await r.deleteProject(p.id);
    expect((await r.load(admin)).planungsprotokolle).toEqual([]);
  });

  it("Bürodaten: nur Admin, bereinigt, E-Mail geprüft", async () => {
    const r = repo();
    await r.load(mitarbeiter);
    await expect(r.saveBueroDaten({ name: "X", anschrift: null, tel: null, mobil: null, email: null })).rejects.toBeInstanceOf(PermissionError);
    await r.load(admin);
    await expect(r.saveBueroDaten({ name: "X", anschrift: null, tel: null, mobil: null, email: "kein-at" })).rejects.toThrow("E-Mail");
    await r.saveBueroDaten({ name: "  ABM   Büro ", anschrift: "Weg 1, 89073 Ulm", tel: " ", mobil: "0170 1", email: "a@example.de" });
    expect((await r.load(mitarbeiter)).buero).toEqual({ name: "ABM Büro", anschrift: "Weg 1, 89073 Ulm", tel: null, mobil: "0170 1", email: "a@example.de" });
  });

  it("Vorlage laden im Demo-Modus: klare Meldung, wenn die Datei fehlt", async () => {
    const r = repo();
    await r.load(admin);
    const orig = globalThis.fetch;
    // Entwicklungsserver: für fehlende Dateien kommt die Startseite (HTML) statt eines PDFs
    globalThis.fetch = (async () => new Response("<!doctype html>", { status: 200 })) as typeof fetch;
    try {
      await expect(r.vorlageLaden("schwabenhaus")).rejects.toThrow(VORLAGEN.schwabenhaus.datei);
      globalThis.fetch = (async () => new Response("%PDF-1.7 …", { status: 200 })) as typeof fetch;
      expect(new TextDecoder().decode(await r.vorlageLaden("schwabenhaus"))).toContain("%PDF");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("Bearbeiten: neue Felder und Rollen", () => {
  it("speichert neue Rollen mit getrennten Feldern; die Übersicht (nur Name und Kontaktzeile) lässt sie stehen", async () => {
    const r = repo();
    const d0 = await r.load(admin);
    const p = d0.projects.find((x) => !d0.parties.some((y) => y.projectId === x.id && y.role === "gas"))!;
    await r.updateProject(p.id, { parties: { gas: { name: "Gas Höhenweg", phone: "0731 1", email: "gas@example.de", address: "Weg 2" } } });
    await r.updateProject(p.id, { parties: { gas: { name: "Gas Höhenweg GmbH", contact: "Zentrale" } } });
    const d = await r.load(admin);
    expect(d.parties.find((x) => x.projectId === p.id && x.role === "gas")).toEqual({ projectId: p.id, role: "gas", name: "Gas Höhenweg GmbH", contact: "Zentrale", address: "Weg 2", phone: "0731 1", mobile: null, email: "gas@example.de", fax: null });
    expect(d.activities.find((x) => x.projectId === p.id)?.text).toBe("Projektdaten geändert: Gas");
  });

  it("getrennte Bauherr- und Bauort-Felder: nicht genannt = unverändert, genannt und leer = geleert", async () => {
    const r = repo();
    const d0 = await r.load(admin);
    const p = d0.projects[0];
    const c = d0.bauherren.find((x) => x.projectId === p.id)!;
    const base = { phone: c.phone, email: c.email, address: c.address, buildingAddress: c.buildingAddress };
    await r.updateProject(p.id, { bauherr: { ...base, siteDistrict: "Söflingen", mobile: "" }, project: { flur: "3" } });
    const d = await r.load(admin);
    const after = d.bauherren.find((x) => x.projectId === p.id)!;
    expect(after.siteDistrict).toBe("Söflingen");
    expect(after.mobile).toBeNull();
    expect(after.street).toBe(c.street); // nicht genannt
    expect(d.projects.find((x) => x.id === p.id)!.flur).toBe("3");
  });

  it("Plan meldet geänderte Felder ohne Werte und nichts, wenn alles gleich bleibt", async () => {
    const d = await repo().load(admin);
    const p = d.projects[0];
    const party = d.parties.find((x) => x.projectId === p.id && x.role === "kellerbauer")!;
    expect(planProjectUpdate(d, p.id, { parties: { kellerbauer: { name: party.name } } }, TODAY).changed).toEqual([]);
    expect(planProjectUpdate(d, p.id, { parties: { kellerbauer: { name: party.name, mobile: "0170 9" } } }, TODAY).changed).toEqual([PARTY_LABEL.kellerbauer]);
    expect(planProjectUpdate(d, p.id, { parties: { kellerbauer: null } }, TODAY).parties.kellerbauer).toBeNull();
  });
});

describe("Supabase: Zuordnung der Spalten", () => {
  it("bauherrJson schickt die getrennten Felder nur, wenn sie genannt sind", () => {
    const alt = bauherrJson({ phone: "1", email: null, address: null, buildingAddress: null });
    expect(alt).not.toHaveProperty("street");
    expect(alt).not.toHaveProperty("site_state");
    const neu = bauherrJson({ phone: "1", email: null, address: null, buildingAddress: null, street: " Weg 1 ", siteState: "", sitePostalCode: "89134" });
    expect(neu).toMatchObject({ street: "Weg 1", site_state: null, site_postal_code: "89134" });
  });
  it("Beteiligte und Protokolle aus Datenbankzeilen", () => {
    expect(toParty({ project_id: "p", role: "gas", name: "G", contact: null, phone: "1", fax: "2" })).toEqual({ projectId: "p", role: "gas", name: "G", contact: null, address: null, phone: "1", mobile: null, email: null, fax: "2" });
    expect(toPlanungsprotokoll({ id: "x", project_id: "p", vorlage: "living-haus", variante: "flach", erstellt_von: "u1", erstellt_am: "2026-10-15T08:00:00Z", dokument_id: "d" }, new Map([["u1", "Mia"]]))).toMatchObject({
      id: "x",
      projectId: "p",
      vorlage: "living-haus",
      variante: "flach",
      erstelltVon: "Mia",
      dokumentId: "d",
    });
  });
});

describe("Migrationen 0013 und 0014 passen zur App", () => {
  it("Rollen der Prüfregel = Rollen der App", () => {
    const block = migration13.match(/project_parties_role_check check \(role in \(([\s\S]*?)\)\);/)?.[1] ?? "";
    expect([...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual((Object.keys(PARTY_LABEL) as string[]).sort());
  });
  it("Freiberufler-Regel nennt genau die Rollen aus Liste.docx", () => {
    const block = migration13.match(/create policy parties_read[\s\S]*?role in \(([^)]*)\)/)?.[1] ?? "";
    expect([...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...CLASSIC_PARTY_ROLES].sort());
  });
  it("Vorlagen der Prüfregel = Vorlagen der App", () => {
    const block = migration14.match(/vorlage\s+text not null check \(vorlage in \(([^)]*)\)\)/)?.[1] ?? "";
    expect([...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort()).toEqual(Object.keys(VORLAGEN).sort());
  });
});

describe("Getrennte Anschrift: aus dem Vertrag ableiten und aktuell halten", () => {
  it("folgeAnschrift zieht abgeleitete Felder mit, von Hand abweichende nicht, leere bleiben leer", () => {
    const vorher = { address: "Lindenweg 12, 89073 Ulm", street: "Lindenweg 12", postalCode: "89073", city: "Ulm", buildingAddress: null };
    expect(folgeAnschrift(vorher, { ...vorher, address: "Am Hang 3, 89134 Blaustein" })).toEqual({ street: "Am Hang 3", postalCode: "89134", city: "Blaustein" });
    expect(folgeAnschrift({ ...vorher, street: "Lindenweg 12a" }, { ...vorher, street: "Lindenweg 12a", address: "Am Hang 3, 89134 Blaustein" })).toEqual({});
    expect(folgeAnschrift({ address: "Weg 1, 89000 Ort" }, { address: "Weg 2, 89000 Ort" })).toEqual({});
    // nicht mehr aufteilbar: dann leer (das Protokoll nimmt die Zeile wie sie ist)
    expect(folgeAnschrift(vorher, { ...vorher, address: "irgendwo" })).toEqual({ street: null, postalCode: null, city: null });
  });

  it("Übersicht ändert nur die einzeilige Anschrift: Straße/PLZ/Ort ziehen beim Speichern mit", async () => {
    const r = repo();
    const d0 = await r.load(admin);
    const p = d0.projects[0];
    const c = d0.bauherren.find((x) => x.projectId === p.id)!;
    await r.updateProject(p.id, { bauherr: { name: c.name, phone: c.phone, email: c.email, buildingAddress: c.buildingAddress, address: "Neue Straße 5, 89077 Ulm" } });
    const after = (await r.load(admin)).bauherren.find((x) => x.projectId === p.id)!;
    expect([after.street, after.postalCode, after.city]).toEqual(["Neue Straße 5", "89077", "Ulm"]);
  });

  it("Vertrag: Wohnanschrift und Bauadresse werden aufgeteilt, wenn eindeutig", () => {
    const draft = emptyDraft({ name: "v.pdf", size: 1, type: "application/pdf" }, "mock", []);
    draft.felder.address = { wert: "Größlestraße 7, 89077 Ulm-Söflingen", quelle: null, sicherheit: "hoch" };
    draft.felder.buildingAddress = { wert: "Baugebiet Kühäcker", quelle: null, sicherheit: "mittel" };
    const base = { kind: "neubau", abmNr: null, hausbauNr: null, bauherrLabel: "", location: null, companyId: null, salespersonId: null, architectId: null, planerId: null, intakeMonth: null, createFolders: true } as const;
    const { form } = applyDraft(draft, { ...base }, { companies: [] });
    expect(form.bauherr).toMatchObject({ street: "Größlestraße 7", postalCode: "89077", city: "Ulm-Söflingen", siteStreet: null, sitePostalCode: null, siteCity: null });
  });
});
