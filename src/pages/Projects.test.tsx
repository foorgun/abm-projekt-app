// @vitest-environment jsdom
// Projektliste: Verlauf aufklappen (eigenes Klickziel, lädt erst beim Aufklappen) und "Projekt öffnen".
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoRepo } from "../lib/demoRepo";
import type { Repo } from "../lib/repo";
import { SessionProvider } from "../lib/session";
import { DataProvider } from "../lib/store";
import { Projects } from "./Projects";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom kennt ResizeObserver nicht (Reiter-Leiste); für diese Tests genügt ein Ersatz ohne Wirkung
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const START = "/projekte?q=a";

function Where() {
  const l = useLocation();
  return <output data-testid="ort">{l.pathname + l.search}</output>;
}

let host: HTMLDivElement;
let root: Root;
let repo: Repo;

async function flush() {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
}

async function render() {
  await act(async () => {
    root.render(
      <SessionProvider auth={null}>
        <DataProvider repo={repo}>
          <MemoryRouter initialEntries={[START]}>
            <Routes>
              <Route path="/projekte" element={<Projects tab="alle" />} />
              <Route path="/projekte/:id" element={<p>Projektseite</p>} />
            </Routes>
            <Where />
          </MemoryRouter>
        </DataProvider>
      </SessionProvider>,
    );
  });
  await flush();
}

const ort = () => host.querySelector('[data-testid="ort"]')!.textContent;
const toggles = () => [...host.querySelectorAll<HTMLButtonElement>("button.row-toggle")];
const openLinks = () => [...host.querySelectorAll<HTMLAnchorElement>("a.row-open")];

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
  await flush();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  repo = createDemoRepo("2026-10-24", { delayMs: 0 });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Projektliste: Verlauf aufklappen", () => {
  it("lädt keinen Verlauf, solange nichts aufgeklappt ist", async () => {
    const spy = vi.spyOn(repo, "projectHistory");
    await render();
    expect(toggles().length).toBeGreaterThan(1);
    expect(spy).not.toHaveBeenCalled();
    expect(toggles().every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
  });

  it("Klick auf das Symbol klappt auf, lädt nur diese Zeile und navigiert nicht", async () => {
    const spy = vi.spyOn(repo, "projectHistory");
    await render();
    const btn = toggles()[0];
    await click(btn);
    expect(ort()).toBe(START); // Seite und Filter bleiben
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(spy).toHaveBeenCalledTimes(1);
    const detail = host.querySelector(`#${btn.getAttribute("aria-controls")}`);
    expect(detail?.textContent).toContain("Verlauf");
    expect(detail?.querySelector("a")?.textContent).toBe("Alle anzeigen");

    // nochmal: zu, ohne neues Laden
    await click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".history")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ort()).toBe(START);
  });

  it("Enter auf dem Symbol löst nicht den Zeilenklick aus", async () => {
    await render();
    await act(async () => {
      toggles()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(ort()).toBe(START);
  });

  it("zeigt Ladezustand und dann die Einträge mit Name, Zeit und Aktion", async () => {
    let resolve!: (v: Awaited<ReturnType<Repo["projectHistory"]>>) => void;
    vi.spyOn(repo, "projectHistory").mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await render();
    await click(toggles()[0]);
    expect(host.querySelector(".history")?.getAttribute("aria-busy")).toBe("true");
    expect(host.textContent).toContain("Verlauf lädt");
    await act(async () => resolve([{ id: "x1", projectId: "p", kind: "projekt", text: "Projekt angelegt", actor: "Erika Beispiel", at: "2026-10-20T09:15:00" }]));
    await flush();
    const item = host.querySelector(".history-item");
    expect(item?.textContent).toContain("Erika Beispiel");
    expect(item?.textContent).toContain("20.10.2026, 09:15");
    expect(item?.textContent).toContain("Projekt angelegt");
  });

  it('ohne Einträge: "Noch keine Einträge"', async () => {
    vi.spyOn(repo, "projectHistory").mockResolvedValue([]);
    await render();
    await click(toggles()[0]);
    expect(host.querySelector(".history-empty")?.textContent).toBe("Noch keine Einträge");
  });
});

describe("Projektliste: Projekt öffnen", () => {
  it("jede Zeile hat den Button, er öffnet die Projektseite", async () => {
    await render();
    expect(openLinks()).toHaveLength(toggles().length);
    const link = openLinks()[0];
    expect(link.textContent).toBe("Projekt öffnen");
    const id = link.getAttribute("href")!.split("/").pop();
    await click(link);
    expect(ort()).toBe(`/projekte/${id}`);
  });

  it("der Klick auf die Zeile selbst öffnet weiterhin das Projekt", async () => {
    await render();
    const row = toggles()[0].closest("tr")!;
    await click(row.querySelector("td:nth-child(3)")!);
    expect(ort()).toMatch(/^\/projekte\/[^/?]+$/);
  });
});

describe("Projektliste: Spalten wählen und sortieren", () => {
  const KEY = "abm.projekte.spalten.v2.demo-admin";
  const headers = () => [...host.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
  const item = (label: string) => [...host.querySelectorAll<HTMLLIElement>(".col-item")].find((li) => li.querySelector("label")?.textContent === label)!;
  async function openPanel() {
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Spalten"))!;
    await click(btn);
  }

  beforeEach(() => localStorage.removeItem(KEY));

  it("zeigt die Standardspalten; Pfeil links und Projekt öffnen rechts bleiben", async () => {
    await render();
    expect(headers()).toEqual(["Verlauf", "ABM-Nr.", "Bauherr", "Hausbaufirma", "Bauort", "Planer", "Status", "Aktion"]);
    expect(toggles().length).toBeGreaterThan(0);
    expect(openLinks()).toHaveLength(toggles().length);
  });

  it("blendet ein und aus, sortiert um, speichert und lädt die Auswahl; Zurücksetzen stellt den Standard her", async () => {
    await render();
    await openPanel();
    await click(item("Verkäufer").querySelector("input")!);
    await click(item("Hausbaufirma").querySelector("input")!);
    expect(headers()).toEqual(["Verlauf", "ABM-Nr.", "Bauherr", "Bauort", "Verkäufer", "Planer", "Status", "Aktion"]);
    await click(item("Status").querySelector('button[aria-label="Status nach oben"]')!);
    for (let i = 0; i < 12; i++) await click(item("Status").querySelector('button[aria-label="Status nach oben"]')!);
    expect(headers().slice(0, 3)).toEqual(["Verlauf", "Status", "ABM-Nr."]);
    expect(item("Status").querySelector<HTMLButtonElement>('button[aria-label="Status nach oben"]')!.disabled).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!)[0]).toEqual({ key: "status", visible: true });

    // neu laden: die Auswahl bleibt
    act(() => root.unmount());
    root = createRoot(host);
    await render();
    expect(headers()).toEqual(["Verlauf", "Status", "ABM-Nr.", "Bauherr", "Bauort", "Verkäufer", "Planer", "Aktion"]);

    await openPanel();
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Zurücksetzen")!);
    expect(headers()).toEqual(["Verlauf", "ABM-Nr.", "Bauherr", "Hausbaufirma", "Bauort", "Planer", "Status", "Aktion"]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("Drag-and-drop verschiebt eine Spalte an die Stelle der Zielzeile", async () => {
    await render();
    await openPanel();
    const fire = (el: Element, type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
      e.dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
      el.dispatchEvent(e);
    };
    await act(async () => fire(item("Planer"), "dragstart"));
    await act(async () => fire(item("ABM-Nr."), "dragover"));
    await act(async () => fire(item("ABM-Nr."), "drop"));
    expect(headers().slice(0, 3)).toEqual(["Verlauf", "Planer", "ABM-Nr."]);
  });

  it("Schritt-Spalten zeigen das Datum oder –", async () => {
    localStorage.setItem(KEY, JSON.stringify([{ key: "bauherr", visible: true }, { key: "plangespraech", visible: true }, { key: "baubetreuung", visible: true }]));
    await render();
    expect(headers()).toEqual(["Verlauf", "Bauherr", "Plan-Gespräch", "Baubetreuung", "Aktion"]);
    const cells = [...host.querySelectorAll("tbody tr td:nth-child(3)")].map((td) => td.textContent);
    expect(cells.every((t) => t === "–" || /^\d{2}\.\d{2}\.\d{4}$/.test(t ?? ""))).toBe(true);
    expect(cells.some((t) => t !== "–")).toBe(true);
  });
});
