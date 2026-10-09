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
