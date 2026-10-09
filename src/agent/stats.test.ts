import { describe, expect, it } from "vitest";
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
