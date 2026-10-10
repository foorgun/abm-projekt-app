import { describe, expect, it } from "vitest";
import { createDemoRepo } from "./demoRepo";
import { documentStats, mainFolderOf, startOfWeek } from "./documentFilters";
import { todayIso } from "./format";
import type { SessionUser } from "./session";

// Das Demo-Repo nutzt für Zeiträume das echte Heute; die Demo-Daten liegen relativ dazu
const TODAY = todayIso();
const admin: SessionUser = { name: "Mehmet Cetin", role: "admin" };
const freelancer: SessionUser = { name: "Frei", role: "freiberufler" };
const repo = async (user: SessionUser = admin) => {
  const r = createDemoRepo(TODAY, { delayMs: 0 });
  const data = await r.load(user);
  return { r, data };
};

describe("Dokumente: Repo-Methode mit Filtern", () => {
  it("liefert alle sichtbaren Dokumente, neueste zuerst, mit Projekt", async () => {
    const { r, data } = await repo();
    const all = await r.listDocuments({});
    expect(all.total).toBe(data.documents.length);
    expect(all.rows.every((x) => x.project)).toBe(true);
    for (let i = 1; i < all.rows.length; i++) expect(all.rows[i - 1].doc.createdAt >= all.rows[i].doc.createdAt).toBe(true);
  });

  it("Filter sind kombinierbar: Projekt, Hauptordner, Quelle, Typ", async () => {
    const { r, data } = await repo();
    const p = data.projects.find((x) => x.bauherrLabel === "Reinhardt")!;
    const res = await r.listDocuments({ projectId: p.id, mainFolder: "08", source: "upload", kind: "pdf" });
    expect(res.total).toBeGreaterThan(0);
    expect(res.rows.every((x) => x.doc.projectId === p.id && mainFolderOf(x.doc.folderPath) === "08" && x.doc.source === "upload" && x.doc.name.endsWith(".pdf"))).toBe(true);
    expect((await r.listDocuments({ kind: "bild" })).rows.every((x) => /\.(jpe?g|png)$/i.test(x.doc.name))).toBe(true);
  });

  it("Suche findet Dateiname, Projekt (auch ABM-Nr. mit Leerzeichen) und Absender der Mail", async () => {
    const { r, data } = await repo();
    expect((await r.listDocuments({ q: "wohnflaechen" })).rows.every((x) => x.doc.name.toLowerCase().includes("wohnflaechen"))).toBe(true);
    const p = data.projects.find((x) => x.bauherrLabel === "Reinhardt")!;
    const byNr = await r.listDocuments({ q: p.abmNr!.replace("-", " ") });
    expect(byNr.total).toBe(data.documents.filter((d) => d.projectId === p.id).length);
    const bySender = await r.listDocuments({ q: "bodenlabor" });
    expect(bySender.total).toBeGreaterThan(0);
    expect(bySender.rows.every((x) => x.mail?.fromName.includes("Bodenlabor"))).toBe(true);
  });

  it("Agent-Dateien tragen Betreff, Absender und Begründung; Uploads nicht", async () => {
    const { r } = await repo();
    const agent = await r.listDocuments({ source: "agent", period: "7" });
    expect(agent.total).toBeGreaterThan(0);
    const withMail = agent.rows.filter((x) => x.mail);
    expect(withMail.length).toBeGreaterThan(0);
    expect(withMail[0].mail).toMatchObject({ subject: expect.any(String), fromEmail: expect.stringContaining("@"), reason: expect.any(String) });
    expect((await r.listDocuments({ source: "upload" })).rows.every((x) => x.mail === null)).toBe(true);
  });

  it("Zeitraum und Blättern", async () => {
    const { r } = await repo();
    const week = await r.listDocuments({ period: "7" });
    const all = await r.listDocuments({});
    expect(week.total).toBeGreaterThan(0);
    expect(week.total).toBeLessThan(all.total);
    const page = await r.listDocuments({ limit: 10, offset: 10 });
    expect(page.rows).toHaveLength(10);
    expect(page.total).toBe(all.total);
    expect(page.rows[0].doc.id).toBe(all.rows[10].doc.id);
  });

  it("Freiberufler sehen nur Dokumente zugewiesener Projekte und keine Maildaten", async () => {
    const { r, data } = await repo(freelancer);
    const res = await r.listDocuments({});
    const own = new Set(data.projects.map((p) => p.id));
    expect(res.total).toBeGreaterThan(0);
    expect(res.rows.every((x) => own.has(x.doc.projectId))).toBe(true);
    expect(res.rows.every((x) => x.mail === null)).toBe(true);
    const adminTotal = (await (await repo()).r.listDocuments({})).total;
    expect(res.total).toBeLessThan(adminTotal);
  });
});

describe("Dokumente: Kennzahlen", () => {
  it("Woche beginnt am Montag", () => {
    expect(startOfWeek("2026-10-10")).toBe("2026-10-05"); // Samstag
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05"); // Sonntag
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05"); // Montag
  });

  it("zählt gesamt, diese Woche und davon vom Agenten", async () => {
    const { data } = await repo();
    const s = documentStats(data.documents, TODAY);
    expect(s.total).toBe(data.documents.length);
    expect(s.weekAgent).toBeLessThanOrEqual(s.week);
  });
});
