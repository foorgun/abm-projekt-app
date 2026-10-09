import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { computeAlerts } from "./alerts";
import { createDemoRepo } from "./demoRepo";
import { alertTaskKey, planAlertTaskSync, visibleAlerts } from "./taskSync";

const TODAY = "2026-10-09";
const admin = { name: "Mehmet Cetin", role: "admin" as const };

/** Führt die Synchronisation wie der Store aus und lädt neu. */
async function sync(repo: ReturnType<typeof createDemoRepo>) {
  const d = await repo.load(admin);
  const plan = planAlertTaskSync(computeAlerts(d, TODAY), d.tasks, d.projects, TODAY);
  for (const t of plan.create) await repo.createTask(t);
  for (const id of plan.close) await repo.updateTask(id, { status: "erledigt" });
  return repo.load(admin);
}

describe("Aufgaben aus Warnungen", () => {
  it("jede Warnung erzeugt genau eine Aufgabe, auch bei wiederholtem Abgleich", async () => {
    const repo = createDemoRepo(TODAY, { delayMs: 0 });
    const d1 = await sync(repo);
    const d2 = await sync(repo);
    const alerts = computeAlerts(d2, TODAY);
    const warnTasks = d2.tasks.filter((t) => t.source === "warnung");
    expect(warnTasks.length).toBe(alerts.length);
    expect(d2.tasks.length).toBe(d1.tasks.length);
    for (const a of alerts) expect(warnTasks.filter((t) => t.sourceKey === alertTaskKey(a))).toHaveLength(1);
  });

  it("die Aufgabe zum 10.000-€-Fall gehört zum Projekt, ist heute fällig und dem Architekten zugewiesen", async () => {
    const repo = createDemoRepo(TODAY, { delayMs: 0 });
    const d = await sync(repo);
    const top = computeAlerts(d, TODAY)[0];
    const t = d.tasks.find((x) => x.sourceKey === alertTaskKey(top))!;
    expect(t.title).toBe("Rechnung versenden: Abschlag Genehmigungsplanung");
    expect(t.dueOn).toBe(TODAY);
    expect(t.assigneeId).toBe(d.projects.find((p) => p.id === top.projectId)!.architectId);
  });

  it("Erledigen blendet die Warnung aus und erzeugt keine neue Aufgabe", async () => {
    const repo = createDemoRepo(TODAY, { delayMs: 0 });
    const d = await sync(repo);
    const top = computeAlerts(d, TODAY)[0];
    const t = d.tasks.find((x) => x.sourceKey === alertTaskKey(top))!;
    await repo.updateTask(t.id, { status: "erledigt" });
    const after = await sync(repo);
    expect(visibleAlerts(computeAlerts(after, TODAY), after.tasks).some((a) => a.id === top.id)).toBe(false);
    expect(after.tasks.filter((x) => x.sourceKey === alertTaskKey(top))).toHaveLength(1);
  });

  it("verschärft sich die Warnung, erscheint sie wieder mit neuer Aufgabe", () => {
    const db = buildDemoDataset(TODAY);
    const hinweis = computeAlerts(db, TODAY).find((a) => a.kind === "contract_open" && a.severity === "hinweis")!;
    const doneTask = { ...db.tasks[0], id: "x", source: "warnung" as const, status: "erledigt" as const, sourceKey: alertTaskKey(hinweis) };
    expect(visibleAlerts([hinweis], [doneTask])).toHaveLength(0);
    const dringend = { ...hinweis, severity: "dringend" as const };
    expect(visibleAlerts([dringend], [doneTask])).toHaveLength(1);
    expect(planAlertTaskSync([dringend], [doneTask], db.projects, TODAY).create).toHaveLength(1);
  });

  it("ist die Ursache behoben, wird die offene Aufgabe automatisch erledigt", async () => {
    const repo = createDemoRepo(TODAY, { delayMs: 0 });
    const d = await sync(repo);
    const top = computeAlerts(d, TODAY)[0];
    await repo.markInvoiceSent(top.invoiceId!, TODAY);
    const after = await sync(repo);
    expect(after.tasks.find((x) => x.sourceKey === alertTaskKey(top))!.status).toBe("erledigt");
  });
});
