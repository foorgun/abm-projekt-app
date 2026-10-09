import { describe, expect, it } from "vitest";
import { computeAlerts } from "../lib/alerts";
import { isAllowedFolder } from "../lib/folders";
import { FOLDER_KEYWORDS } from "./folderHints";
import { buildDemoDataset, TASK_TEMPLATES } from "./demoData";

const TODAY = "2026-10-09";
const db = buildDemoDataset(TODAY);

describe("Demo-Daten", () => {
  it("sind deterministisch", () => {
    expect(JSON.stringify(buildDemoDataset(TODAY))).toBe(JSON.stringify(db));
  });

  it("haben genug Projekte in allen Status", () => {
    expect(db.projects.length).toBeGreaterThanOrEqual(40);
    expect(db.projects.some((p) => p.status === "storno")).toBe(true);
    expect(db.projects.some((p) => p.status === "abgeschlossen")).toBe(true);
    expect(db.projects.some((p) => p.kind === "bauvoranfrage")).toBe(true);
  });

  it("der 10.000-€-Fall steht oben in den Warnungen", () => {
    const alerts = computeAlerts(db, TODAY);
    expect(alerts[0]).toMatchObject({ kind: "invoice_unsent", severity: "dringend", days: 42 });
    expect(alerts[0].detail).toContain("10.000");
    expect(db.projects.find((p) => p.id === alerts[0].projectId)?.bauherrLabel).toBe("Reinhardt");
  });

  it("zeigt jede Warnart mindestens einmal", () => {
    const kinds = new Set(computeAlerts(db, TODAY).map((a) => `${a.kind}:${a.severity}`));
    expect(kinds).toContain("contract_open:hinweis");
    expect(kinds).toContain("permit_waiting:info");
    expect(kinds).toContain("invoice_unsent:hinweis");
  });

  it("liegt immer relativ zu heute (gleiche Warnungen an einem anderen Tag)", () => {
    const later = buildDemoDataset("2027-03-15");
    expect(computeAlerts(later, "2027-03-15")[0]).toMatchObject({ kind: "invoice_unsent", days: 42 });
  });

  it("hat keine Daten in der Zukunft", () => {
    for (const p of db.projects) for (const d of Object.values(p.steps)) expect(d! <= TODAY).toBe(true);
    for (const d of db.documents) expect(d.receivedOn! <= TODAY).toBe(true);
    for (const i of db.invoices) {
      if (i.sentOn) expect(i.sentOn <= TODAY).toBe(true);
      if (i.paidOn) expect(i.paidOn <= TODAY).toBe(true);
    }
  });

  it("legt Dokumente nur in Ordner der Vorlage", () => {
    for (const d of db.documents) expect(isAllowedFolder(d.folderPath, db.folderTemplates), d.folderPath).toBe(true);
  });

  it("Schlüsselwörter gehören zu existierenden Vorlagenordnern", () => {
    const paths = new Set(db.folderTemplates.map((f) => f.path));
    for (const p of Object.keys(FOLDER_KEYWORDS)) expect(paths.has(p), p).toBe(true);
  });

  it("enthält nur erfundene Adressen (example-Domains)", () => {
    const mails = [
      ...db.bauherren.map((b) => b.email),
      ...db.salespeople.map((s) => s.email),
      ...db.inboxItems.map((i) => i.fromEmail),
      ...db.mailboxes.map((m) => m.address),
    ].filter(Boolean) as string[];
    for (const m of mails) expect(m, m).toMatch(/@([a-z0-9-]+\.)*example(\.com)?$/);
  });

  it("verweist nur auf vorhandene Projekte und Dokumente", () => {
    const ids = new Set(db.projects.map((p) => p.id));
    for (const x of [...db.invoices, ...db.documents, ...db.parties]) expect(ids.has(x.projectId)).toBe(true);
    const docs = new Set(db.documents.map((d) => d.id));
    for (const a of db.inboxAttachments) if (a.documentId) expect(docs.has(a.documentId)).toBe(true);
  });
});

describe("Demo-Aufgaben", () => {
  it("passen zur Phase ihres Projekts", () => {
    expect(db.tasks.length).toBeGreaterThanOrEqual(14);
    for (const t of db.tasks) {
      const tpl = TASK_TEMPLATES.find((x) => x.title === t.title)!;
      if (!tpl.fits) {
        expect(t.projectId).toBeNull();
        continue;
      }
      const p = db.projects.find((x) => x.id === t.projectId)!;
      // Erledigte Aufgaben dürfen in einer späteren Phase liegen; offene müssen genau passen
      expect(tpl.fits(p), `${t.title} bei ${p.bauherrLabel}`).toBe(true);
      expect(p.status).toBe("aktiv");
    }
  });

  it("Rückfragen vom Amt nur nach Übergabe des Baugesuchs", () => {
    const amt = db.tasks.filter((t) => /Landratsamt|Baurechtsamt|Behörde/.test(t.title));
    expect(amt.length).toBeGreaterThan(0);
    for (const t of amt) expect(db.projects.find((p) => p.id === t.projectId)!.steps.baugesuch_uebergabe).toBeTruthy();
  });

  it("Prüfliste: Behördenpost nur zu Projekten nach Übergabe des Baugesuchs", () => {
    for (const item of db.inboxItems.filter((i) => /lra-demo|stadt-demo/.test(i.fromEmail) && i.projectId)) {
      expect(db.projects.find((p) => p.id === item.projectId)!.steps.baugesuch_uebergabe, item.subject).toBeTruthy();
    }
  });
});
