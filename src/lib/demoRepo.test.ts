import { describe, expect, it } from "vitest";
import { computeAlerts } from "./alerts";
import { createDemoRepo } from "./demoRepo";
import { PermissionError } from "./repo";

const TODAY = "2026-10-09";
const admin = { name: "Mehmet Cetin", role: "admin" as const };
const freelancer = { name: "Frei", role: "freiberufler" as const };
const repo = () => createDemoRepo(TODAY, { delayMs: 0 });

describe("demoRepo: Sichtbarkeit wie RLS", () => {
  it("Admin sieht alles", async () => {
    const d = await repo().load(admin);
    expect(d.invoices.length).toBeGreaterThan(0);
    expect(d.bauherren.length).toBe(d.projects.length);
  });

  it("Freiberufler sieht nur zugewiesene Projekte, keine Rechnungen, keine Bauherren-Kontakte", async () => {
    const d = await repo().load(freelancer);
    expect(d.projects.length).toBeGreaterThan(0);
    expect(d.projects.every((p) => p.planerId === "t-sk")).toBe(true);
    expect(d.invoices).toEqual([]);
    expect(d.bauherren).toEqual([]);
    expect(d.companies).toEqual([]);
    const ids = new Set(d.projects.map((p) => p.id));
    expect(d.documents.every((x) => ids.has(x.projectId))).toBe(true);
    expect(d.stepDefinitions.length).toBeGreaterThan(5);
    expect(d.folderTemplates.length).toBeGreaterThan(100);
  });

  it("Freiberufler darf keine Schritte ändern, aber in eigenen Projekten hochladen", async () => {
    const r = repo();
    const d = await r.load(freelancer);
    const own = d.projects[0];
    await expect(r.setStepDate(own.id, "plangespraech", TODAY)).rejects.toBeInstanceOf(PermissionError);
    const doc = await r.uploadDocument({ projectId: own.id, folderPath: "08 Bauantrag/03 Wohnflächenberechnung", file: { name: "wfl.pdf", size: 1000, type: "application/pdf" } });
    expect(doc.uploadedBy).toBe("Frei");
    const all = await r.load(admin);
    const foreign = all.projects.find((p) => p.planerId !== "t-sk")!;
    await r.load(freelancer);
    await expect(r.uploadDocument({ projectId: foreign.id, folderPath: "08 Bauantrag/03 Wohnflächenberechnung", file: { name: "x.pdf", size: 1, type: "" } })).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("demoRepo: Änderungen", () => {
  it("Datum setzen ändert das Projekt und protokolliert", async () => {
    const r = repo();
    const d = await r.load(admin);
    const p = d.projects.find((x) => !x.steps.plangespraech)!;
    await r.setStepDate(p.id, "plangespraech", TODAY);
    const after = await r.load(admin);
    expect(after.projects.find((x) => x.id === p.id)!.steps.plangespraech).toBe(TODAY);
    expect(after.activities[0]).toMatchObject({ projectId: p.id, kind: "schritt", actor: "Mehmet Cetin" });
  });

  it("Status ändern protokolliert und ist Freiberuflern verboten", async () => {
    const r = repo();
    const d = await r.load(admin);
    const p = d.projects.find((x) => x.status === "aktiv")!;
    await r.setProjectStatus(p.id, "abgeschlossen");
    const after = await r.load(admin);
    expect(after.projects.find((x) => x.id === p.id)!.status).toBe("abgeschlossen");
    expect(after.activities[0]).toMatchObject({ projectId: p.id, text: "Projekt abgeschlossen" });
    await r.load(freelancer);
    await expect(r.setProjectStatus(p.id, "aktiv")).rejects.toBeInstanceOf(PermissionError);
  });

  it("Demo zurücksetzen verwirft alle Änderungen, auch Agent-Läufe", async () => {
    const r = repo();
    const fresh = await r.load(admin);
    await r.setStepDate(fresh.projects[0].id, "baufreigabe", TODAY);
    await r.runAgent();
    await r.resetDemo!();
    const after = await r.load(admin);
    expect(JSON.stringify(after)).toBe(JSON.stringify(fresh));
    expect((await r.runAgent()).fetched).toBeGreaterThan(0); // Postfächer liefern wieder von vorn
  });

  it("geladene Daten sind Kopien (keine Mutation von außen)", async () => {
    const r = repo();
    const d = await r.load(admin);
    d.projects[0].bauherrLabel = "Manipuliert";
    expect((await r.load(admin)).projects[0].bauherrLabel).not.toBe("Manipuliert");
  });

  it("Rechnung als versendet markieren beseitigt die 10.000-€-Warnung", async () => {
    const r = repo();
    const d = await r.load(admin);
    const top = computeAlerts(d, TODAY)[0];
    await r.markInvoiceSent(top.invoiceId!, TODAY);
    const after = await r.load(admin);
    expect(computeAlerts(after, TODAY).some((a) => a.id === top.id)).toBe(false);
  });

  it("Upload nur in Vorlagenordner, Namenskonflikt bekommt Zähler", async () => {
    const r = repo();
    const d = await r.load(admin);
    const p = d.projects[0];
    const file = { name: "Plan.pdf", size: 10, type: "application/pdf" };
    const a = await r.uploadDocument({ projectId: p.id, folderPath: "05 Entwurf/01 Entwurf 1 Pläne", file });
    const b = await r.uploadDocument({ projectId: p.id, folderPath: "05 Entwurf/01 Entwurf 1 Pläne", file });
    expect(a.storagePath).not.toBe(b.storagePath);
    expect(b.storagePath).toMatch(/Plan \(2\)\.pdf$/);
    await expect(r.uploadDocument({ projectId: p.id, folderPath: "../geheim", file })).rejects.toThrow(/Vorlage/);
    await expect(r.uploadDocument({ projectId: p.id, folderPath: "10 Bodengutachten/Bodengutachten erhalten am {datum}", file })).rejects.toThrow(/Datum/);
    await expect(r.uploadDocument({ projectId: p.id, folderPath: "05 Entwurf/01 Entwurf 1 Pläne", file: { name: "Plan.dwg", size: 1, type: "" } })).rejects.toThrow(/Fileserver/);
    const dated = await r.uploadDocument({ projectId: p.id, folderPath: "10 Bodengutachten/Bodengutachten erhalten am 02.10.2026", file });
    expect(dated.folderPath).toBe("10 Bodengutachten/Bodengutachten erhalten am 02.10.2026");
  });

  it("Aufgabe mit gleicher Quelle wird nicht doppelt angelegt", async () => {
    const r = repo();
    await r.load(admin);
    const a = await r.createTask({ title: "Rechnung versenden", projectId: null, dueOn: TODAY, assigneeId: null, source: "warnung", sourceKey: "invoice_unsent:i-1" });
    const b = await r.createTask({ title: "Rechnung versenden", projectId: null, dueOn: TODAY, assigneeId: null, source: "warnung", sourceKey: "invoice_unsent:i-1" });
    expect(b.id).toBe(a.id);
  });

  it("Schwellen werden geprüft", async () => {
    const r = repo();
    await r.load(admin);
    await expect(r.saveAgentSettings({ autoFileThreshold: 0.5, suggestThreshold: 0.6 })).rejects.toThrow();
    await r.saveAgentSettings({ autoFileThreshold: 0.95, suggestThreshold: 0.6 });
    expect((await r.load(admin)).agentSettings.autoFileThreshold).toBe(0.95);
  });
});

describe("Projekt anlegen mit wenigen Angaben, Stammdaten ergänzen", () => {
  const base = { kind: "neubau" as const, abmNr: null, hausbauNr: null, companyId: null, salespersonId: null, location: null, architectId: null, planerId: null, intakeMonth: null, createFolders: false };

  it("nur mit Bauherr: Projekt entsteht, dazu genau eine Aufgabe zum Nachfragen", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    await repo.load({ name: "Test", role: "mitarbeiter" });
    const p = await repo.createProject({ ...base, bauherrLabel: "Neumann" });
    const d = await repo.load({ name: "Test", role: "mitarbeiter" });
    const tasks = d.tasks.filter((t) => t.projectId === p.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Fehlende Angaben nachfragen: Telefon oder E-Mail des Bauherrn, Bauadresse, Hausbaufirma, Verkäufer, Vermesser");
    expect(tasks[0].status).toBe("offen");
    expect(tasks[0].sourceKey).toBe(`angaben:${p.id}`);
    // kein "source: warnung": sonst würde der Abgleich mit den Warnungen die Aufgabe sofort schließen
    expect(tasks[0].source).toBe("manuell");
  });

  it("vollständig und mit Vermesser: keine Aufgabe, Vermesser als Projektbeteiligter", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    const d0 = await repo.load({ name: "Test", role: "admin" });
    const company = d0.companies[0];
    const sales = d0.salespeople.find((x) => x.companyId === company.id)!;
    const p = await repo.createProject({
      ...base, bauherrLabel: "Vollmer", companyId: company.id, salespersonId: sales.id, vermesser: " Vermessung Neu ",
      bauherr: { phone: " 0731 1 ", email: null, address: null, buildingAddress: "Weg 1, Ulm" },
    });
    const d = await repo.load({ name: "Test", role: "admin" });
    expect(d.tasks.filter((t) => t.projectId === p.id)).toHaveLength(0);
    expect(d.parties.filter((x) => x.projectId === p.id)).toEqual([{ projectId: p.id, role: "vermesser", name: "Vermessung Neu", contact: null }]);
    expect(d.bauherren.find((b) => b.projectId === p.id)).toEqual({ projectId: p.id, name: "Vollmer", address: null, phone: "0731 1", email: null, buildingAddress: "Weg 1, Ulm", name2: null, phone2: null, email2: null });
  });

  it("Mitarbeiter legt Hausbaufirma, Verkäufer und Architekt an; Dubletten werden abgelehnt", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    const d0 = await repo.load({ name: "Test", role: "mitarbeiter" });
    const c = await repo.createCompany("  Fingerhaus ");
    expect(c.name).toBe("Fingerhaus");
    const s = await repo.createSalesperson(c.id, "Petra Neu");
    expect(s.companyId).toBe(c.id);
    const t = await repo.createTeamMember("Neue Architektin", "architekt");
    expect(t.role).toBe("architekt");
    await expect(repo.createCompany(d0.companies[0].name.toUpperCase())).rejects.toThrow("gibt es schon");
    await expect(repo.createSalesperson("gibt-es-nicht", "X Y")).rejects.toThrow("nicht gefunden");
    const d = await repo.load({ name: "Test", role: "mitarbeiter" });
    expect(d.companies).toHaveLength(d0.companies.length + 1);
    expect(d.team.some((x) => x.id === t.id)).toBe(true);
  });

  it("Freiberufler darf weder Stammdaten noch Projekte anlegen", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    await repo.load({ name: "Frei", role: "freiberufler" });
    await expect(repo.createCompany("Fingerhaus")).rejects.toThrow(PermissionError);
    await expect(repo.createSalesperson("c-bz", "X Y")).rejects.toThrow(PermissionError);
    await expect(repo.createTeamMember("X Y", "architekt")).rejects.toThrow(PermissionError);
    await expect(repo.createProject({ ...base, bauherrLabel: "Unzulässig" })).rejects.toThrow(PermissionError);
  });
});

describe("Projektdaten bearbeiten", () => {
  const staff = { name: "Mira", role: "mitarbeiter" as const };
  const base = { kind: "neubau" as const, abmNr: null, hausbauNr: null, companyId: null, salespersonId: null, location: null, architectId: null, planerId: null, intakeMonth: null, createFolders: false };
  const followup = (d: Awaited<ReturnType<ReturnType<typeof createDemoRepo>["load"]>>, id: string) => d.tasks.filter((t) => t.sourceKey === `angaben:${id}`);

  it("Angaben nachtragen: Aufgabe wird erst kürzer und schließt sich am Ende von selbst", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    const d0 = await repo.load(staff);
    const p = await repo.createProject({ ...base, bauherrLabel: "Hoffmann" });
    const company = d0.companies[0];
    const sales = d0.salespeople.find((x) => x.companyId === company.id)!;

    await repo.updateProject(p.id, { project: { companyId: company.id, salespersonId: sales.id, location: " Ulm " }, bauherr: { phone: "0731 5", email: null, address: null, buildingAddress: null } });
    let d = await repo.load(staff);
    expect(d.projects.find((x) => x.id === p.id)).toMatchObject({ companyId: company.id, salespersonId: sales.id, location: "Ulm" });
    expect(followup(d, p.id)).toHaveLength(1);
    expect(followup(d, p.id)[0]).toMatchObject({ status: "offen", title: "Fehlende Angaben nachfragen: Bauadresse, Vermesser" });
    expect(d.activities.find((a) => a.projectId === p.id && a.text.startsWith("Projektdaten geändert"))!.text).toBe("Projektdaten geändert: Hausbaufirma, Verkäufer, Bauort, Telefon");

    await repo.updateProject(p.id, { bauherr: { phone: "0731 5", email: null, address: null, buildingAddress: "Weg 1" }, parties: { vermesser: { name: "Vermessung X", contact: null } } });
    d = await repo.load(staff);
    expect(followup(d, p.id)).toHaveLength(1);
    expect(followup(d, p.id)[0].status).toBe("erledigt");
    expect(followup(d, p.id)[0].doneAt).not.toBeNull();

    // Später wieder etwas austragen: die erledigte Aufgabe bleibt erledigt, es entsteht keine zweite
    await repo.updateProject(p.id, { parties: { vermesser: null } });
    d = await repo.load(staff);
    expect(followup(d, p.id)).toHaveLength(1);
    expect(d.parties.filter((x) => x.projectId === p.id)).toEqual([]);
  });

  it("Projekt ohne Aufgabe bekommt sie, sobald beim Bearbeiten etwas fehlt; unveränderte Werte erzeugen keinen Protokolleintrag", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    const d0 = await repo.load(staff);
    const p = d0.projects.find((x) => x.status === "aktiv" && d0.parties.some((y) => y.projectId === x.id && y.role === "vermesser"))!;
    expect(followup(d0, p.id)).toHaveLength(0);
    const before = d0.activities.length;
    await repo.updateProject(p.id, { project: { location: p.location, abmNr: p.abmNr } });
    let d = await repo.load(staff);
    expect(d.activities.length).toBe(before);

    await repo.updateProject(p.id, { parties: { vermesser: null } });
    d = await repo.load(staff);
    expect(d.activities.length).toBe(before + 1);
    expect(followup(d, p.id)).toHaveLength(1);
    expect(followup(d, p.id)[0]).toMatchObject({ status: "offen", source: "manuell" });
    expect(followup(d, p.id)[0].title).toContain("Vermesser");
  });

  it("andere Hausbaufirma trägt den Verkäufer der alten aus", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    const d0 = await repo.load(staff);
    const p = d0.projects.find((x) => x.salespersonId && x.companyId)!;
    const other = d0.companies.find((c) => c.id !== p.companyId)!;
    await repo.updateProject(p.id, { project: { companyId: other.id } });
    const d = await repo.load(staff);
    expect(d.projects.find((x) => x.id === p.id)).toMatchObject({ companyId: other.id, salespersonId: null });
  });

  it("prüft wie beim Anlegen: leerer Bauherr, vergebene ABM-Nr., ungültige E-Mail", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    const d0 = await repo.load(staff);
    const [a, b] = d0.projects.filter((x) => x.status === "aktiv" && x.abmNr && x.kind === "neubau");
    await expect(repo.updateProject(a.id, { project: { bauherrLabel: " " } })).rejects.toThrow("Nachnamen");
    await expect(repo.updateProject(a.id, { project: { abmNr: b.abmNr } })).rejects.toThrow("schon vergeben");
    await expect(repo.updateProject(a.id, { bauherr: { phone: null, email: "kein-at", address: null, buildingAddress: null } })).rejects.toThrow("E-Mail");
    // die eigene ABM-Nr. unverändert zu speichern ist keine Dublette
    await expect(repo.updateProject(a.id, { project: { abmNr: a.abmNr, location: "Anderswo" } })).resolves.toBeUndefined();
  });

  it("Freiberufler darf nichts bearbeiten und sieht nie Kontaktdaten", async () => {
    const repo = createDemoRepo("2026-10-10", { delayMs: 0 });
    const d = await repo.load({ name: "Frei", role: "freiberufler" });
    expect(d.projects.length).toBeGreaterThan(0);
    expect(d.bauherren).toEqual([]);
    await expect(repo.updateProject(d.projects[0].id, { project: { location: "X" } })).rejects.toThrow(PermissionError);
    await expect(repo.updateProject(d.projects[0].id, { bauherr: { phone: "1", email: null, address: null, buildingAddress: null } })).rejects.toThrow(PermissionError);
  });
});
