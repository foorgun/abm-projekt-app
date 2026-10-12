import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../data/demoData";
import { computeAlerts } from "./alerts";
import { limitGroups, newProjectsPerMonth, projectsByPhase, todayGroups, TODO_LIMIT } from "./dashboard";
import { alertTaskKey } from "./taskSync";
import type { Task } from "./types";

const TODAY = "2026-10-09";
const db = buildDemoDataset(TODAY);

describe("Dashboard-Daten", () => {
  it("liefert 12 Monate bis einschließlich heute", () => {
    const m = newProjectsPerMonth(db.projects, TODAY);
    expect(m).toHaveLength(12);
    expect(m[0].month).toBe("2025-11-01");
    expect(m[11]).toMatchObject({ month: "2026-10-01", label: "Okt", title: "Oktober 2026" });
  });

  it("zählt über den Jahreswechsel richtig", () => {
    const m = newProjectsPerMonth([{ ...db.projects[0], intakeMonth: "2026-01-01" }], "2026-02-15", 3);
    expect(m.map((x) => [x.month, x.count])).toEqual([["2025-12-01", 0], ["2026-01-01", 1], ["2026-02-01", 0]]);
  });

  it("verteilt alle aktiven Projekte auf Phasen", () => {
    const phases = projectsByPhase(db.projects, db.stepDefinitions);
    const total = phases.reduce((a, b) => a + b.value, 0);
    expect(total).toBe(db.projects.filter((p) => p.status === "aktiv").length);
    expect(phases.every((p) => p.value > 0)).toBe(true);
  });
});

describe("Heute zu tun", () => {
  const task = (patch: Partial<Task>): Task => ({
    id: "t",
    projectId: null,
    title: "Aufgabe",
    dueOn: TODAY,
    assigneeId: null,
    status: "offen",
    source: "manuell",
    sourceKey: null,
    createdAt: `${TODAY}T08:00:00`,
    doneAt: null,
    ...patch,
  });
  const alerts = computeAlerts(db, TODAY);
  const none = { tasks: [], alerts: [], today: TODAY };

  it("ist leer, wenn nichts ansteht", () => {
    expect(todayGroups(none)).toEqual([]);
    expect(todayGroups({ ...none, tasks: [task({ dueOn: "2026-10-10" }), task({ dueOn: null }), task({ status: "erledigt" })] })).toEqual([]);
  });

  it("trennt überfällige und heute fällige Aufgaben, älteste zuerst", () => {
    const g = todayGroups({ ...none, tasks: [task({ id: "a" }), task({ id: "b", dueOn: "2026-10-08" }), task({ id: "c", dueOn: "2026-10-01" })] });
    expect(g.map((x) => x.key)).toEqual(["ueberfaellig", "heute"]);
    expect(g[0].items.map((i) => i.id)).toEqual(["task:c", "task:b"]);
    expect(g[1].items.map((i) => i.id)).toEqual(["task:a"]);
  });

  it("zeigt eine Aufgabe aus einer sichtbaren Warnung nur einmal, als Warnung", () => {
    expect(alerts.length).toBeGreaterThan(0);
    const a = alerts[0];
    const fromAlert = task({ id: "w", source: "warnung", sourceKey: alertTaskKey(a), dueOn: "2026-10-01" });
    const g = todayGroups({ ...none, alerts: [a], tasks: [fromAlert] });
    expect(g.flatMap((x) => x.items).map((i) => i.id)).toEqual([a.id]);
    // ohne die Warnung (z. B. für diese Rolle nicht sichtbar) bleibt die Aufgabe stehen
    expect(todayGroups({ ...none, tasks: [fromAlert] })[0].items.map((i) => i.id)).toEqual(["task:w"]);
  });

  it("ordnet nach Dringlichkeit: dringende Warnungen zu Überfällig, der Rest zu Hinweise", () => {
    const urgent = alerts.filter((a) => a.severity === "dringend");
    expect(urgent.length).toBeGreaterThan(0);
    expect(alerts.length).toBeGreaterThan(urgent.length);
    const g = todayGroups({ alerts, today: TODAY, tasks: [task({ id: "a" }), task({ id: "b", dueOn: "2026-10-01" })] });
    expect(g.map((x) => x.key)).toEqual(["ueberfaellig", "heute", "hinweise"]);
    expect(g[0].items).toHaveLength(urgent.length + 1);
    expect(g[2].items).toHaveLength(alerts.length - urgent.length);
    // am längsten überfällig zuerst, Aufgaben und Warnungen gemischt
    const ages = g[0].items.map((i) => (i.type === "alert" ? i.alert.days : 8));
    expect(ages).toEqual([...ages].sort((x, y) => y - x));
  });

  it("kürzt auf fünf Zeilen über alle Gruppen", () => {
    const tasks = [1, 2, 3, 4].map((n) => task({ id: `o${n}`, dueOn: `2026-10-0${n}` })).concat([1, 2, 3].map((n) => task({ id: `h${n}`, title: `Heute ${n}` })));
    const all = todayGroups({ ...none, tasks });
    const cut = limitGroups(all, TODO_LIMIT);
    expect(cut.map((g) => [g.key, g.items.length])).toEqual([["ueberfaellig", 4], ["heute", 1]]);
    expect(limitGroups(all, 3).map((g) => g.key)).toEqual(["ueberfaellig"]);
    expect(limitGroups(all, 99)).toEqual(all);
  });
});
