import { describe, expect, it } from "vitest";
import { createDemoRepo } from "../demoRepo";
import { PermissionError, type NewProject } from "../repo";
import { applyDraft, cleanMeta } from "./applyDraft";
import { createMockExtractor } from "./mockExtractor";
import type { DraftFormState } from "./types";

const TODAY = "2026-10-09";
const admin = { name: "Mehmet Cetin", role: "admin" as const };
const staff = { name: "Mitarbeiterin", role: "mitarbeiter" as const };
const freelancer = { name: "Frei", role: "freiberufler" as const };
const repo = () => createDemoRepo(TODAY, { delayMs: 0 });
const scan = () => new File([new Uint8Array(3000).fill(9)], "Scan_Werkvertrag_Beispiel.jpg", { type: "image/jpeg" });
const meta = (f: File) => ({ name: f.name, size: f.size, type: f.type });

const blank: NewProject = {
  kind: "neubau",
  abmNr: null,
  hausbauNr: null,
  bauherrLabel: "",
  location: null,
  companyId: null,
  salespersonId: null,
  architectId: null,
  planerId: null,
  intakeMonth: "2026-10-01",
  vermesser: null,
  bauherr: { phone: null, email: null, address: null, buildingAddress: null },
  createFolders: true,
};

/** Wie der Dialog: auslesen, ins Formular übernehmen, Entwurf speichern. */
async function startDraft(r: ReturnType<typeof repo>, user = admin) {
  const data = await r.load(user);
  const file = scan();
  const draft = await createMockExtractor({ demo: true }).extract(file);
  const applied = applyDraft(draft, blank, data);
  const form: DraftFormState = { project: applied.form, meta: applied.meta, edited: [] };
  const saved = await r.saveProjectDraft({ draft, form, docType: "werkvertrag", file: meta(file), blob: file });
  return { file, draft, form, saved };
}

describe("Entwürfe: speichern, laden, fortsetzen", () => {
  it("speichert den Entwurf mit Feldern, Formularstand, Datei und Ersteller", async () => {
    const r = repo();
    const { saved, file } = await startDraft(r);
    expect(saved).toMatchObject({ status: "offen", docType: "werkvertrag", createdBy: "Mehmet Cetin", projectId: null, file: { name: file.name, size: file.size } });
    expect(saved.storagePath).toMatch(/^drafts\//);
    expect(saved.draft.felder.bauherrLabel).toMatchObject({ wert: "Hoffmann", sicherheit: "mittel" });
    const again = (await r.load(staff)).projectDrafts;
    expect(again.map((d) => d.id)).toEqual([saved.id]);
    expect(again[0].form.project.bauherrLabel).toBe("Hoffmann");
    expect(await r.draftFile(saved.id)).toBeInstanceOf(Blob);
  });

  it("merkt sich beim Weiterarbeiten den Stand der Prüfmaske", async () => {
    const r = repo();
    const { saved, draft, form, file } = await startDraft(r);
    const changed: DraftFormState = { project: { ...form.project, bauherrLabel: "Hofmann" }, meta: { ...form.meta, haustyp: "Beispielhaus 160" }, edited: ["bauherrLabel", "haustyp"] };
    await r.saveProjectDraft({ id: saved.id, draft, form: changed, docType: "sonstiges", file: meta(file) });
    const loaded = (await r.load(admin)).projectDrafts[0];
    expect(loaded).toMatchObject({ id: saved.id, docType: "sonstiges", form: { project: { bauherrLabel: "Hofmann" }, meta: { haustyp: "Beispielhaus 160" }, edited: ["bauherrLabel", "haustyp"] } });
    expect((await r.load(admin)).projectDrafts).toHaveLength(1);
  });

  it("verwirft einen Entwurf, ohne die Zeile zu löschen; danach lässt er sich nicht mehr ändern", async () => {
    const r = repo();
    const { saved, draft, form, file } = await startDraft(r);
    await r.discardProjectDraft(saved.id);
    const all = (await r.load(admin)).projectDrafts;
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: "verworfen", storagePath: null });
    expect(await r.draftFile(saved.id)).toBeNull();
    await expect(r.saveProjectDraft({ id: saved.id, draft, form, docType: "werkvertrag", file: meta(file) })).rejects.toThrow(/nicht mehr offen/);
  });

  it("lehnt unerlaubte Dateien schon beim Speichern ab", async () => {
    const r = repo();
    const { draft, form } = await startDraft(r);
    await expect(r.saveProjectDraft({ draft, form, docType: "werkvertrag", file: { name: "plan.dwg", size: 10, type: "" } })).rejects.toThrow();
    await expect(r.saveProjectDraft({ draft, form, docType: "werkvertrag", file: { name: "gross.pdf", size: 31 * 1024 * 1024, type: "application/pdf" } })).rejects.toThrow(/30 MB/);
    await expect(r.addDraftFile({ file: { name: "gross.pdf", size: 31 * 1024 * 1024, type: "application/pdf" }, blob: new Blob(["x"]) })).rejects.toThrow(/30 MB/);
  });
});

describe("Bestätigen: Projekt anlegen und Vertrag ablegen", () => {
  it("legt das Projekt mit zweitem Bauherrn an, die Aufgabenregel läuft, der Vertrag landet mit Typ und Metadaten in 00 Verträge", async () => {
    const r = repo();
    const { saved, form, file } = await startDraft(r);
    const project = await r.createProject({ ...form.project, flurstueck: "412/3", gemarkung: "Blaustein" });
    const doc = await r.fileContract({ projectId: project.id, docType: "werkvertrag", meta: cleanMeta(form.meta), file: meta(file), blob: file, draftId: saved.id });
    expect(doc).toMatchObject({ projectId: project.id, folderPath: "00 Verträge", docType: "werkvertrag", name: file.name, source: "upload" });
    expect(doc.meta).toEqual({ vertragsdatum: "2026-10-02", vertragspreis: "312.450,00 €", angebotsnummer: "A-2026-0417", haustyp: "Beispielhaus 140" });

    const d = await r.load(admin);
    expect(d.projects.find((p) => p.id === project.id)).toMatchObject({ bauherrLabel: "Hoffmann", flurstueck: "412/3", gemarkung: "Blaustein", hausbauNr: null });
    expect(d.bauherren.find((b) => b.projectId === project.id)).toMatchObject({ name: "Jonas Hoffmann", name2: "Anna Hoffmann", phone2: "0171 0001112", buildingAddress: null });
    // Aufgabenregel wie bei manuell angelegten Projekten: Bauadresse, Verkäufer und Vermesser fehlen
    const task = d.tasks.find((t) => t.projectId === project.id);
    expect(task?.title).toMatch(/^Fehlende Angaben nachfragen: .*Bauadresse.*Vermesser/);
    // der Vertragspreis belegt keine Rechnungen vor
    expect(d.invoices.filter((i) => i.projectId === project.id)).toEqual([]);
    expect(d.projectDrafts.find((x) => x.id === saved.id)).toMatchObject({ status: "uebernommen", projectId: project.id, storagePath: null });
  });

  it("Duplikat: hängt das Dokument an ein bestehendes Projekt, ohne ein neues anzulegen", async () => {
    const r = repo();
    const before = await r.load(admin);
    const target = before.projects.find((p) => p.status === "aktiv")!;
    const { saved, file } = await startDraft(r);
    const doc = await r.fileContract({ projectId: target.id, docType: "vermessungsvertrag", meta: {}, file: meta(file), blob: file, draftId: saved.id });
    expect(doc).toMatchObject({ projectId: target.id, folderPath: "04 Vermesser", docType: "vermessungsvertrag", meta: {} });
    const after = await r.load(admin);
    expect(after.projects).toHaveLength(before.projects.length);
    expect(after.projectDrafts[0]).toMatchObject({ status: "uebernommen", projectId: target.id });
  });

  it("ändert Flurstück, Gemarkung und den zweiten Bauherrn nachträglich; Kontaktwerte stehen nicht im Protokoll", async () => {
    const r = repo();
    const d = await r.load(admin);
    const p = d.projects.find((x) => d.bauherren.some((b) => b.projectId === x.id))!;
    const c = d.bauherren.find((b) => b.projectId === p.id)!;
    await r.updateProject(p.id, { project: { flurstueck: " 88/1 ", gemarkung: "Söflingen" }, bauherr: { phone: c.phone, email: c.email, address: c.address, buildingAddress: c.buildingAddress, name2: "Erika Beispiel", email2: "erika@example.com" } });
    const after = await r.load(admin);
    expect(after.projects.find((x) => x.id === p.id)).toMatchObject({ flurstueck: "88/1", gemarkung: "Söflingen" });
    expect(after.bauherren.find((b) => b.projectId === p.id)).toMatchObject({ name: c.name, name2: "Erika Beispiel", email2: "erika@example.com", phone2: null });
    const log = after.activities.find((a) => a.projectId === p.id && a.text.startsWith("Projektdaten geändert"))!;
    expect(log.text).toContain("Flurstück");
    expect(log.text).toContain("Zweiter Bauherr");
    expect(log.text).not.toContain("erika@example.com");
  });
});

describe("Rollen: Freiberufler sieht und nutzt das nicht", () => {
  it("sieht keine Entwürfe und keinen zweiten Bauherrn", async () => {
    const r = repo();
    await startDraft(r);
    const d = await r.load(freelancer);
    expect(d.projectDrafts).toEqual([]);
    expect(d.bauherren).toEqual([]);
  });

  it("darf Entwürfe weder speichern noch lesen, verwerfen oder ablegen", async () => {
    const r = repo();
    const { saved, draft, form, file } = await startDraft(r);
    const d = await r.load(freelancer);
    await expect(r.saveProjectDraft({ draft, form, docType: "werkvertrag", file: meta(file), blob: file })).rejects.toBeInstanceOf(PermissionError);
    await expect(r.saveProjectDraft({ id: saved.id, draft, form, docType: "werkvertrag", file: meta(file) })).rejects.toBeInstanceOf(PermissionError);
    await expect(r.draftFile(saved.id)).rejects.toBeInstanceOf(PermissionError);
    await expect(r.discardProjectDraft(saved.id)).rejects.toBeInstanceOf(PermissionError);
    // auch nicht in ein eigenes, zugewiesenes Projekt
    await expect(r.fileContract({ projectId: d.projects[0].id, docType: "werkvertrag", meta: {}, file: meta(file), blob: file })).rejects.toBeInstanceOf(PermissionError);
    await expect(r.createProject(form.project)).rejects.toBeInstanceOf(PermissionError);
    expect((await r.load(admin)).projectDrafts[0].status).toBe("offen");
  });

  it("der Demo-Modus kennt keinen Aufruf des KI-Dienstes", () => {
    expect(repo().extractProject).toBeUndefined();
  });
});

describe("Entwurf mit mehreren Dateien", () => {
  const pdf = (name: string) => new File(["%PDF-1.4 erfunden"], name, { type: "application/pdf" });

  it("erste Datei legt den Entwurf an, weitere hängen sich an; Ergebnis und Fehler je Datei; Entfernen; Ablage je Datei; Abschluss", async () => {
    const r = repo();
    await r.load(staff);
    const a = await r.addDraftFile({ file: meta(pdf("Werkvertrag.pdf")), blob: pdf("Werkvertrag.pdf"), form: { project: blank, meta: {}, edited: [] } });
    const b = await r.addDraftFile({ draftId: a.draft.id, file: meta(pdf("Vermesser.pdf")), blob: pdf("Vermesser.pdf") });
    const c = await r.addDraftFile({ draftId: a.draft.id, file: meta(pdf("Falsch.pdf")), blob: pdf("Falsch.pdf") });
    expect(b.draft.id).toBe(a.draft.id);
    expect([a.file.sort, b.file.sort, c.file.sort]).toEqual([0, 1, 2]);
    expect(await r.draftFileBlob(b.file.id)).not.toBeNull();

    const draft = await createMockExtractor({ demo: true }).extract(scan());
    await r.updateDraftFile(a.file.id, { status: "ausgelesen", draft, docType: "werkvertrag", meta: { vertragsdatum: "2026-10-02" } });
    await r.updateDraftFile(b.file.id, { status: "fehler", error: "Dein Tageslimit ist erreicht", docType: "vermessungsvertrag" });
    await r.removeDraftFile(c.file.id);
    expect(await r.draftFileBlob(c.file.id)).toBeNull();

    let data = await r.load(staff);
    const rec = data.projectDrafts.find((d) => d.id === a.draft.id)!;
    // entfernte Dateien gehören nicht mehr zum Entwurf
    expect(rec.files.map((f) => [f.file.name, f.status, f.docType])).toEqual([
      ["Werkvertrag.pdf", "ausgelesen", "werkvertrag"],
      ["Vermesser.pdf", "fehler", "vermessungsvertrag"],
    ]);
    expect(rec.files[1].error).toContain("Tageslimit");

    // anlegen: beide Dateien abgelegt (auch die nicht ausgelesene), jede im Ordner ihrer Art
    const project = await r.createProject({ ...blank, bauherrLabel: "Hoffmann" });
    const d1 = await r.fileContract({ projectId: project.id, docType: "werkvertrag", meta: { vertragsdatum: "2026-10-02" }, file: meta(pdf("Werkvertrag.pdf")), draftFileId: a.file.id });
    const d2 = await r.fileContract({ projectId: project.id, docType: "vermessungsvertrag", meta: {}, file: meta(pdf("Vermesser.pdf")), draftFileId: b.file.id });
    expect([d1.folderPath, d2.folderPath]).toEqual(["00 Verträge", "04 Vermesser"]);
    await r.completeProjectDraft(a.draft.id, project.id);
    data = await r.load(staff);
    expect(data.projectDrafts.find((d) => d.id === a.draft.id)).toMatchObject({ status: "uebernommen", projectId: project.id });
    await expect(r.addDraftFile({ draftId: a.draft.id, file: meta(pdf("Spaet.pdf")), blob: pdf("Spaet.pdf") })).rejects.toThrow(/nicht mehr offen/);
  });

  it("Freiberufler: keine Dateien zu Entwürfen; Kostenübersicht nur für Admins", async () => {
    const r = repo();
    await r.load(freelancer);
    await expect(r.addDraftFile({ file: meta(pdf("x.pdf")), blob: pdf("x.pdf") })).rejects.toThrow(PermissionError);
    await expect(r.extractionCosts()).rejects.toThrow(PermissionError);
    await r.load(staff);
    await expect(r.extractionCosts()).rejects.toThrow(PermissionError);
    await r.load(admin);
    await expect(r.extractionCosts()).resolves.toEqual({ monate: [], projekte: [], ohneProjekt: null });
  });
});
