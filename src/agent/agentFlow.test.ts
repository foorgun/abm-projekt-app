import { describe, expect, it } from "vitest";
import { createDemoRepo } from "../lib/demoRepo";
import { isAllowedFolder } from "../lib/folders";

const TODAY = "2026-10-09";
const admin = { name: "Mehmet Cetin", role: "admin" as const };
const BG = "09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige";

async function setup() {
  const repo = createDemoRepo(TODAY, { delayMs: 0 });
  const before = await repo.load(admin);
  return { repo, before };
}

describe("Agent im Demo-Modus (Abnahme Schritt 7)", () => {
  it('"Jetzt prüfen" legt Anhänge sichtbar im Ordnerbaum ab, uneindeutige landen in der Prüfliste', async () => {
    const { repo, before } = await setup();
    const s = await repo.runAgent();
    const after = await repo.load(admin);
    expect(s.fetched).toBeGreaterThanOrEqual(10);
    expect(s.filed).toBeGreaterThanOrEqual(4);
    expect(s.toReview).toBeGreaterThanOrEqual(3);
    expect(s.duplicates).toBe(1);
    expect(s.waitingPaused).toBe(1); // Postfach "Projektleitung" ist pausiert

    const newDocs = after.documents.filter((d) => !before.documents.some((x) => x.id === d.id));
    const newItems = after.inboxItems.filter((i) => !before.inboxItems.some((x) => x.id === i.id));
    const filedAtts = after.inboxAttachments.filter((a) => newItems.some((i) => i.id === a.itemId) && a.status === "abgelegt");
    // Je abgelegtem Anhang genau eine Kopie (Signaturbilder und DWG werden nicht abgelegt)
    expect(newDocs.length).toBe(filedAtts.length);
    expect(newDocs.some((d) => d.name.endsWith(".dwg") || d.name.startsWith("image0"))).toBe(false);
    expect(newDocs.every((d) => d.source === "agent" && isAllowedFolder(d.folderPath, after.folderTemplates))).toBe(true);
    const permit = newDocs.find((d) => d.name.startsWith("Baugenehmigung_"))!;
    expect(permit.folderPath).toMatch(new RegExp(`^${BG}/01 Baugenehmigung/01 erhalten am \\d{2}\\.\\d{2}\\.\\d{4}$`));

    const review = after.inboxAttachments.filter((a) => a.status === "pruefen");
    expect(review.length).toBeGreaterThan(before.inboxAttachments.filter((a) => a.status === "pruefen").length);
    // Nie etwas außerhalb der Vorlage, auch nicht bei Prompt-Injection
    expect(after.documents.some((d) => d.folderPath.includes(".."))).toBe(false);
    const injected = after.inboxItems.find((i) => i.subject === "Dringend: Unterlagen")!;
    expect(injected.status).toBe("pruefen");
    expect(injected.reason).toContain("verworfen");
    // Gefährliche Datei: Fehler, kein Dokument
    expect(after.inboxItems.find((i) => i.subject === "Offene Rechnung")!.status).toBe("fehler");
  });

  it("Bestätigen legt ab; Regel merken wirkt beim nächsten Lauf", async () => {
    const { repo } = await setup();
    await repo.runAgent();
    let d = await repo.load(admin);
    const item = d.inboxItems.find((i) => i.fromEmail === "buero@vermessung-donautal.example" && i.subject.startsWith("Höhenaufnahme"))!;
    const att = d.inboxAttachments.find((a) => a.itemId === item.id)!;
    expect(att.status).toBe("pruefen");
    expect(att.folderPath).toMatch(/^04 Vermesser\/02 Vermesserunterlagen erhalten am/);

    await repo.resolveReview(att.id, { action: "bestaetigen", rememberRule: "absender_ordner" });
    d = await repo.load(admin);
    const doc = d.documents.find((x) => x.sourceItemId === att.id)!;
    expect(doc.folderPath).toBe(att.folderPath);
    expect(d.agentRules.some((r) => r.kind === "absender_ordner" && r.match === "buero@vermessung-donautal.example")).toBe(true);
    expect(d.agentFeedback.at(-1)).toMatchObject({ attachmentId: att.id, action: "bestaetigt" });

    await repo.runAgent();
    d = await repo.load(admin);
    const next = d.inboxItems.find((i) => i.fromEmail === "buero@vermessung-donautal.example" && /^Unterlagen \d/.test(i.subject))!;
    expect(next.status).toBe("abgelegt");
    expect(next.reason).toContain("Regel");
  });

  it("ohne gemerkte Regel landet dieselbe Mail in der Prüfliste (Gegenprobe)", async () => {
    const { repo } = await setup();
    await repo.runAgent();
    await repo.runAgent();
    const d = await repo.load(admin);
    const next = d.inboxItems.find((i) => i.fromEmail === "buero@vermessung-donautal.example" && /^Unterlagen \d/.test(i.subject))!;
    expect(next.status).toBe("pruefen");
  });

  it("Ändern legt im gewählten Projekt und Ordner ab; Ignorieren legt nichts ab", async () => {
    const { repo } = await setup();
    await repo.runAgent();
    let d = await repo.load(admin);
    const vogel = d.inboxItems.find((i) => i.subject === "Wohnflächenberechnung Vogel")!;
    const vAtt = d.inboxAttachments.find((a) => a.itemId === vogel.id)!;
    expect(vAtt.projectId).toBeNull(); // zwei Projekte "Vogel": kein Vorschlag
    const target = d.projects.find((p) => p.bauherrLabel === "Vogel" && p.location === "Ulm")!;
    await repo.resolveReview(vAtt.id, { action: "aendern", projectId: target.id, folderPath: "08 Bauantrag/03 Wohnflächenberechnung" });
    const inj = d.inboxItems.find((i) => i.subject === "Dringend: Unterlagen")!;
    const iAtt = d.inboxAttachments.find((a) => a.itemId === inj.id)!;
    await repo.resolveReview(iAtt.id, { action: "ignorieren", rememberRule: "ignorieren" });
    d = await repo.load(admin);
    expect(d.documents.find((x) => x.sourceItemId === vAtt.id)).toMatchObject({ projectId: target.id, folderPath: "08 Bauantrag/03 Wohnflächenberechnung" });
    expect(d.documents.some((x) => x.sourceItemId === iAtt.id)).toBe(false);
    expect(d.agentRules.some((r) => r.kind === "ignorieren" && r.match === "info@unbekannt-demo.example")).toBe(true);
  });

  it("Falsch abgelegt: zurück in die Prüfliste, Korrektur verschiebt die Kopie statt eine zweite anzulegen", async () => {
    const { repo } = await setup();
    await repo.runAgent();
    let d = await repo.load(admin);
    const att = d.inboxAttachments.find((a) => a.status === "abgelegt" && a.fileName === "Angebot_Netzanschluss.pdf")!;
    const docsBefore = d.documents.length;
    await repo.reportWrongFiling(att.id);
    d = await repo.load(admin);
    expect(d.inboxAttachments.find((a) => a.id === att.id)).toMatchObject({ status: "pruefen", corrected: true });
    await repo.resolveReview(att.id, { action: "aendern", projectId: att.projectId!, folderPath: "11 Baubegleitung/02 Hausanschlüsse/02 Strom/03 Auftragsbestätigung" });
    d = await repo.load(admin);
    expect(d.documents.length).toBe(docsBefore);
    expect(d.documents.find((x) => x.id === att.documentId)!.folderPath).toBe("11 Baubegleitung/02 Hausanschlüsse/02 Strom/03 Auftragsbestätigung");
  });

  it("pausiertes Postfach wird nicht gelesen; nach Freigabe kommt seine Mail", async () => {
    const { repo } = await setup();
    for (let i = 0; i < 4; i++) await repo.runAgent();
    const last = await repo.runAgent();
    expect(last.fetched).toBe(0);
    expect(last.waitingPaused).toBe(1);
    await repo.setMailboxStatus("mb-3", "verbunden");
    const after = await repo.runAgent();
    expect(after.fetched).toBe(1);
  });

  it("Freiberufler dürfen den Agenten nicht starten", async () => {
    const { repo } = await setup();
    await repo.load({ name: "Frei", role: "freiberufler" });
    await expect(repo.runAgent()).rejects.toThrow(/Berechtigung/);
  });
});
