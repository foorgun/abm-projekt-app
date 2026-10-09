import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { createDemoRepo } from "../lib/demoRepo";
import { agentStats, isAutoFiled } from "./stats";

const TODAY = "2026-10-09";
const admin = { name: "M", role: "admin" as const };

describe("Agent-Kennzahlen", () => {
  it("7 Tage, heute zuletzt", async () => {
    const d = await createDemoRepo(TODAY, { delayMs: 0 }).load(admin);
    const s = agentStats(d, TODAY);
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay[6]).toMatchObject({ date: TODAY, label: "Fr" });
    expect(s.openReview).toBe(3);
    expect(s.hitRate).not.toBeNull();
  });

  it("Trefferquote sinkt, wenn eine automatische Ablage als falsch gemeldet wird", async () => {
    const repo = createDemoRepo(TODAY, { delayMs: 0 });
    await repo.runAgent();
    const before = agentStats(await repo.load(admin), TODAY);
    const d = await repo.load(admin);
    const auto = d.inboxAttachments.find((a) => a.status === "abgelegt" && !a.corrected && isAutoFiled(a, d.agentSettings.autoFileThreshold))!;
    await repo.reportWrongFiling(auto.id);
    const after = agentStats(await repo.load(admin), TODAY);
    expect(after.autoCount7).toBe(before.autoCount7);
    expect(after.hitRate!).toBeLessThan(before.hitRate!);
    expect(after.openReview).toBe(before.openReview + 1);
  });

  it("von Hand bestätigte Zuordnungen zählen nicht als automatisch", () => {
    const a = { id: "a", itemId: "i", fileName: "x.pdf", mime: "", sizeBytes: 1, storagePath: null, projectId: "p", folderPath: "f", confidence: 0.72, status: "abgelegt" as const, documentId: "d", corrected: false };
    expect(isAutoFiled(a, 0.9)).toBe(false);
    expect(isAutoFiled({ ...a, confidence: 0.95 }, 0.9)).toBe(true);
  });
});

describe("Demo-Historie", () => {
  // Freitag, Samstag, Montag, Mittwoch: an jedem Tag gilt die Regel für die letzten 7 Tage
  for (const today of ["2026-10-09", "2026-10-10", "2026-10-12", "2026-10-14"]) {
    it(`Werktage 3 bis 8 Anhänge, überwiegend automatisch, Wochenende leer (heute ${today})`, () => {
      const s = agentStats(buildDemoDataset(today), today);
      let auto = 0;
      let review = 0;
      for (const d of s.perDay) {
        const dow = new Date(`${d.date}T12:00:00Z`).getUTCDay();
        const total = d.auto + d.review;
        if (dow === 0 || dow === 6) expect(total, d.date).toBe(0);
        else {
          expect(total, d.date).toBeGreaterThanOrEqual(3);
          expect(total, d.date).toBeLessThanOrEqual(8);
        }
        auto += d.auto;
        review += d.review;
      }
      expect(auto).toBeGreaterThan(review * 2);
    });
  }
});
