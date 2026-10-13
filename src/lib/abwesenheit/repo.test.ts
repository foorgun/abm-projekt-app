import { describe, expect, it } from "vitest";
import { DEMO_ME } from "../../data/demoAbwesenheit";
import { createDemoRepo } from "../demoRepo";
import { PermissionError } from "../repo";
import { urlaubsStand } from "./urlaub";

const TODAY = "2026-10-13";
const admin = { name: "Mehmet Cetin", role: "admin" as const };
const staff = { name: "Mehmet Cetin", role: "mitarbeiter" as const };
const freelancer = { name: "Frei", role: "freiberufler" as const };
const repo = () => createDemoRepo(TODAY, { delayMs: 0 });

describe("Abwesenheit im Repo: Sichtbarkeit wie RLS", () => {
  it("Admin sieht alle, Mitarbeiter nur eigene Zeilen und nur sich im Team, Freiberufler nichts", async () => {
    const r = repo();
    const a = await r.load(admin);
    expect(a.meId).toBe(DEMO_ME.admin);
    expect(new Set(a.abwesenheiten.map((x) => x.userId)).size).toBeGreaterThanOrEqual(3);
    expect(a.mitarbeiter.length).toBe(4);
    const m = await r.load(staff);
    expect(m.meId).toBe(DEMO_ME.mitarbeiter);
    expect(m.abwesenheiten.length).toBeGreaterThan(0);
    expect(m.abwesenheiten.every((x) => x.userId === m.meId)).toBe(true);
    expect(m.abwesenheiten.some((x) => x.art === "krank")).toBe(false); // die Krankmeldung gehört einem Kollegen
    expect(m.urlaubsAnspruch.every((x) => x.userId === m.meId)).toBe(true);
    expect(m.mitarbeiter.map((x) => x.id)).toEqual([m.meId]);
    const f = await r.load(freelancer);
    expect(f).toMatchObject({ meId: null, abwesenheiten: [], urlaubsAnspruch: [], mitarbeiter: [] });
  });

  it("Freiberufler können nichts beantragen, melden, entscheiden oder im Kalender sehen", async () => {
    const r = repo();
    await r.load(freelancer);
    await expect(r.requestUrlaub({ von: "2026-11-23", bis: "2026-11-27" })).rejects.toBeInstanceOf(PermissionError);
    await expect(r.reportKrank({ von: TODAY, bis: null })).rejects.toBeInstanceOf(PermissionError);
    await expect(r.kalenderAbwesenheiten("2026-10-01", "2026-10-31")).rejects.toBeInstanceOf(PermissionError);
    await expect(r.setUrlaubsAnspruch("u-ma", 2026, { tage: 99, uebertrag: 0 })).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("Urlaub beantragen, zurückziehen, entscheiden", () => {
  it("legt einen offenen Antrag mit berechneten Werktagen an; die Resttage sinken", async () => {
    const r = repo();
    const before = await r.load(staff);
    const me = before.meId!;
    const rest = urlaubsStand(me, 2026, before.abwesenheiten, before.urlaubsAnspruch).rest;
    const row = await r.requestUrlaub({ von: "2026-12-21", bis: "2026-12-25", notiz: "  Weihnachten " });
    expect(row).toMatchObject({ userId: me, art: "urlaub", status: "offen", werktage: 4, notiz: "Weihnachten", entscheidungVon: null });
    const after = await r.load(staff);
    expect(urlaubsStand(me, 2026, after.abwesenheiten, after.urlaubsAnspruch).rest).toBe(rest - 4);
  });

  it("lehnt Überschneidungen, Ende vor Beginn und Zeiträume ohne Werktag ab", async () => {
    const r = repo();
    const d = await r.load(staff);
    const own = d.abwesenheiten.find((a) => a.status === "offen")!;
    await expect(r.requestUrlaub({ von: own.von, bis: own.von })).rejects.toThrow(/überschneidet/);
    await expect(r.requestUrlaub({ von: "2026-12-10", bis: "2026-12-09" })).rejects.toThrow(/Ende liegt vor/);
    await expect(r.requestUrlaub({ von: "2026-12-12", bis: "2026-12-13" })).rejects.toThrow(/kein Werktag/);
  });

  it("offene eigene Anträge lassen sich zurückziehen, entschiedene nicht", async () => {
    const r = repo();
    const d = await r.load(staff);
    const offen = d.abwesenheiten.find((a) => a.status === "offen")!;
    const genehmigt = d.abwesenheiten.find((a) => a.status === "genehmigt")!;
    await r.withdrawUrlaub(offen.id);
    expect((await r.load(staff)).abwesenheiten.find((a) => a.id === offen.id)!.status).toBe("zurueckgezogen");
    await expect(r.withdrawUrlaub(genehmigt.id)).rejects.toThrow(/nicht mehr offen/);
    // danach ist der Zeitraum wieder frei
    await expect(r.requestUrlaub({ von: offen.von, bis: offen.bis! })).resolves.toMatchObject({ status: "offen" });
  });

  it("Selbst-Genehmigung verboten: weder Mitarbeiter noch Admin entscheiden den eigenen Antrag", async () => {
    const r = repo();
    const m = await r.load(staff);
    const mine = m.abwesenheiten.find((a) => a.status === "offen")!;
    await expect(r.decideUrlaub(mine.id, "genehmigt")).rejects.toBeInstanceOf(PermissionError);
    const a = await r.load(admin);
    const own = a.abwesenheiten.find((x) => x.userId === a.meId && x.status === "offen")!;
    await expect(r.decideUrlaub(own.id, "genehmigt")).rejects.toThrow(/anderer Admin/);
    await expect(r.decideUrlaub(own.id, "abgelehnt", "nein")).rejects.toThrow(/anderer Admin/);
    expect((await r.load(admin)).abwesenheiten.find((x) => x.id === own.id)!.status).toBe("offen");
  });

  it("ein Admin genehmigt oder lehnt den Antrag einer anderen Person ab, mit Vermerk und optionaler Begründung", async () => {
    const r = repo();
    const a = await r.load(admin);
    const [first, second] = a.abwesenheiten.filter((x) => x.userId !== a.meId && x.art === "urlaub" && x.status === "offen");
    await r.decideUrlaub(first.id, "genehmigt", "wird ignoriert");
    await r.decideUrlaub(second.id, "abgelehnt", "  Abnahme in der Woche ");
    const after = (await r.load(admin)).abwesenheiten;
    expect(after.find((x) => x.id === first.id)).toMatchObject({ status: "genehmigt", entscheidungVon: "Mehmet Cetin", ablehnGrund: null });
    expect(after.find((x) => x.id === second.id)).toMatchObject({ status: "abgelehnt", ablehnGrund: "Abnahme in der Woche" });
    await expect(r.decideUrlaub(first.id, "abgelehnt")).rejects.toThrow(/nicht mehr offen/);
  });

  it("Mitarbeiter kommen an fremde Anträge nicht heran", async () => {
    const r = repo();
    const a = await r.load(admin);
    const foreign = a.abwesenheiten.find((x) => x.userId === "u-ma2" && x.status === "offen")!;
    await r.load(staff);
    await expect(r.withdrawUrlaub(foreign.id)).rejects.toThrow(/nicht gefunden/);
    await expect(r.decideUrlaub(foreign.id, "genehmigt")).rejects.toThrow();
  });

  it("nur Admins setzen den Anspruch", async () => {
    const r = repo();
    await r.load(staff);
    await expect(r.setUrlaubsAnspruch("u-ma", 2026, { tage: 99, uebertrag: 0 })).rejects.toBeInstanceOf(PermissionError);
    await r.load(admin);
    await r.setUrlaubsAnspruch("u-ma", 2026, { tage: 28, uebertrag: 2.5 });
    await r.setUrlaubsAnspruch("u-ma", 2030, { tage: 31, uebertrag: 0 });
    await expect(r.setUrlaubsAnspruch("u-ma", 2026, { tage: -1, uebertrag: 0 })).rejects.toThrow();
    const d = await r.load(admin);
    expect(d.urlaubsAnspruch.find((x) => x.userId === "u-ma" && x.jahr === 2026)).toMatchObject({ tage: 28, uebertrag: 2.5 });
    expect(d.urlaubsAnspruch.find((x) => x.userId === "u-ma" && x.jahr === 2030)?.tage).toBe(31);
  });
});

describe("Krankmeldung", () => {
  it("ist sofort wirksam und hat nie eine Notiz: die Schnittstelle nimmt keine an", async () => {
    const r = repo();
    await r.load(staff);
    // ein mitgeschickter Freitext (z. B. eine Diagnose) wird nicht gespeichert
    const row = await r.reportKrank({ von: TODAY, bis: null, notiz: "Grippe" } as never);
    expect(row).toMatchObject({ art: "krank", status: "genehmigt", notiz: null, bis: null, werktage: null, entscheidungVon: null });
    expect(JSON.stringify((await r.load(admin)).abwesenheiten)).not.toContain("Grippe");
  });

  it("das Ende lässt sich nachtragen, aber nicht vor den Beginn", async () => {
    const r = repo();
    await r.load(staff);
    const row = await r.reportKrank({ von: "2026-10-12", bis: null });
    await expect(r.setKrankBis(row.id, "2026-10-09")).rejects.toThrow(/Ende liegt vor/);
    await r.setKrankBis(row.id, TODAY);
    expect((await r.load(staff)).abwesenheiten.find((a) => a.id === row.id)!.bis).toBe(TODAY);
  });

  it("überschneidet sich nicht mit eigenem Urlaub", async () => {
    const r = repo();
    const d = await r.load(staff);
    const urlaub = d.abwesenheiten.find((a) => a.status === "genehmigt")!;
    await expect(r.reportKrank({ von: urlaub.von, bis: urlaub.von })).rejects.toThrow(/überschneidet/);
  });
});

describe("Kalender", () => {
  it("zeigt Admins den Grund, Mitarbeitern nur 'abwesend' (art null), ohne offene Enden", async () => {
    const r = repo();
    await r.load(admin);
    const forAdmin = await r.kalenderAbwesenheiten("2026-10-01", "2026-11-30");
    expect(new Set(forAdmin.map((e) => e.art))).toEqual(new Set(["urlaub", "krank"]));
    await r.load(staff);
    const forStaff = await r.kalenderAbwesenheiten("2026-10-01", "2026-11-30");
    expect(forStaff.length).toBe(forAdmin.length);
    expect(forStaff.every((e) => e.art === null)).toBe(true);
    // die offene Krankmeldung des Kollegen endet in der Anzeige heute und verrät sich nicht durch ein fehlendes Ende
    expect(forStaff.every((e) => typeof e.bis === "string")).toBe(true);
    expect(forStaff.find((e) => e.name === "Timo Brandl" && e.von === "2026-10-12")?.bis).toBe(TODAY);
  });

  it("enthält nur genehmigten Urlaub und Krankmeldungen im Zeitraum", async () => {
    const r = repo();
    const d = await r.load(admin);
    const rows = await r.kalenderAbwesenheiten("2026-10-01", "2026-12-31");
    const ok = d.abwesenheiten.filter((a) => a.status === "genehmigt" && a.von <= "2026-12-31" && (a.bis ?? TODAY) >= "2026-10-01");
    expect(rows).toHaveLength(ok.length);
    expect(await r.kalenderAbwesenheiten("2030-01-01", "2030-01-31")).toEqual([]);
  });
});
