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

const EXCEL_HEADERS = [
  "Anzahl Projekte",
  "Fertighausfirma",
  "ABM-Nr.",
  "Bauherrschaft",
  "Bundesland - Bauort",
  "Verkäufer",
  "Architekt",
  "Planer",
  "Plan-Gespräch",
  "Übergabe Baugesuch",
  "ABM-Vertrag – versendet",
  "ABM-Vertrag – zurück",
  "Baugenehmigung",
  "Baubetreuung",
  "Fertighausfirma-Nr.",
];
const COLS_KEY = "abm.projekte.spalten.v3.demo-admin";
const GROUP_KEY = "abm.projekte.gruppierung.v1.demo-admin";
const headers = () => [...host.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
const buttonStartingWith = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text))!;

describe("Projektliste: Spalten wählen und sortieren", () => {
  const item = (label: string) => [...host.querySelectorAll<HTMLLIElement>(".col-item")].find((li) => li.querySelector("label")?.textContent === label)!;
  const openPanel = () => click(buttonStartingWith("Spalten"));

  beforeEach(() => {
    localStorage.removeItem(COLS_KEY);
    localStorage.removeItem(GROUP_KEY);
  });

  it("zeigt die Excel-Spalten in Excel-Reihenfolge; Pfeil links und Projekt öffnen rechts bleiben", async () => {
    await render();
    expect(headers()).toEqual(["Verlauf", ...EXCEL_HEADERS, "Aktion"]);
    for (const old of ["Status", "Schritte", "Nächste Aufgabe", "Nächster Schritt", "Warnung", "Phase"]) expect(headers()).not.toContain(old);
    expect(toggles().length).toBeGreaterThan(0);
    expect(openLinks()).toHaveLength(toggles().length);
  });

  it("Anzahl Projekte zählt die angezeigten Zeilen 1, 2, 3 …; leere Werte zeigen –", async () => {
    await render();
    const nr = [...host.querySelectorAll("tbody tr:not(.row-group):not(.row-detail) td:nth-child(2)")].map((td) => td.textContent);
    expect(nr.slice(0, 3)).toEqual(["1", "2", "3"]);
    expect(nr.at(-1)).toBe(String(nr.length));
    const all = [...host.querySelectorAll("tbody td:not(.toggle-cell):not(.action-cell)")].map((td) => td.textContent);
    expect(all).not.toContain("");
  });

  it("Bundesland - Bauort zeigt Kürzel und Ort, z. B. 'BW - Ulm'", async () => {
    await render();
    const col = EXCEL_HEADERS.indexOf("Bundesland - Bauort") + 2;
    const cells = [...host.querySelectorAll(`tbody tr td:nth-child(${col})`)].map((td) => td.textContent ?? "");
    expect(cells.some((t) => /^(BW|BY) - \S/.test(t))).toBe(true);
  });

  it("blendet ein und aus, sortiert um, speichert und lädt die Auswahl; Zurücksetzen stellt den Standard her", async () => {
    await render();
    await openPanel();
    await click(item("Bauort").querySelector("input")!);
    await click(item("Verkäufer").querySelector("input")!);
    expect(headers()).toEqual(["Verlauf", ...EXCEL_HEADERS.filter((h) => h !== "Verkäufer"), "Bauort", "Aktion"]);
    for (let i = 0; i < 20; i++) await click(item("Bauort").querySelector('button[aria-label="Bauort nach oben"]')!);
    expect(headers().slice(0, 3)).toEqual(["Verlauf", "Bauort", "Anzahl Projekte"]);
    expect(item("Bauort").querySelector<HTMLButtonElement>('button[aria-label="Bauort nach oben"]')!.disabled).toBe(true);
    expect(JSON.parse(localStorage.getItem(COLS_KEY)!)[0]).toEqual({ key: "ort", visible: true });

    // neu laden: die Auswahl bleibt
    act(() => root.unmount());
    root = createRoot(host);
    await render();
    expect(headers().slice(0, 4)).toEqual(["Verlauf", "Bauort", "Anzahl Projekte", "Fertighausfirma"]);
    expect(headers()).not.toContain("Verkäufer");

    await openPanel();
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Zurücksetzen")!);
    expect(headers()).toEqual(["Verlauf", ...EXCEL_HEADERS, "Aktion"]);
    expect(localStorage.getItem(COLS_KEY)).toBeNull();
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
    await act(async () => fire(item("Anzahl Projekte"), "dragover"));
    await act(async () => fire(item("Anzahl Projekte"), "drop"));
    expect(headers().slice(0, 3)).toEqual(["Verlauf", "Planer", "Anzahl Projekte"]);
  });

  it("Termin-Spalten zeigen das Datum oder –", async () => {
    localStorage.setItem(COLS_KEY, JSON.stringify([{ key: "bauherr", visible: true }, { key: "plangespraech", visible: true }, { key: "baubetreuung", visible: true }]));
    await render();
    expect(headers()).toEqual(["Verlauf", "Bauherrschaft", "Plan-Gespräch", "Baubetreuung", "Aktion"]);
    const cells = [...host.querySelectorAll("tbody tr td:nth-child(3)")].map((td) => td.textContent);
    expect(cells.every((t) => t === "–" || /^\d{2}\.\d{2}\.\d{4}$/.test(t ?? ""))).toBe(true);
    expect(cells.some((t) => t !== "–")).toBe(true);
  });
});

describe("Projektliste: Gruppierung", () => {
  const groupHeads = () => [...host.querySelectorAll<HTMLButtonElement>("tr.row-group button.group-toggle")];
  const dataRows = () => host.querySelectorAll("tbody tr:not(.row-group):not(.row-detail)").length;
  async function choose(mode: string) {
    await click(buttonStartingWith("Gruppierung"));
    const radio = [...host.querySelectorAll<HTMLLabelElement>(".group-mode")].find((l) => l.textContent === mode)!.querySelector("input")!;
    await click(radio);
  }

  beforeEach(() => {
    localStorage.removeItem(COLS_KEY);
    localStorage.removeItem(GROUP_KEY);
  });

  it("Standard ohne Gruppen; nach Monat (Plan-Gespräch): Köpfe mit Anzahl, neueste zuerst, 'Ohne Datum' am Ende", async () => {
    await render();
    expect(groupHeads()).toHaveLength(0);
    const total = dataRows();
    await choose("Monat");
    const select = host.querySelector<HTMLSelectElement>("#gruppierung-datum")!;
    expect(select.value).toBe("plangespraech");
    const heads = groupHeads().map((b) => b.textContent!);
    expect(heads.length).toBeGreaterThan(1);
    for (const h of heads) expect(h).toMatch(/^(\S+ \d{4}|Ohne Datum) \(\d+\)$/);
    const counts = heads.map((h) => Number(h.match(/\((\d+)\)$/)![1]));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
    if (heads.some((h) => h.startsWith("Ohne Datum"))) expect(heads.at(-1)).toMatch(/^Ohne Datum/);
    expect(JSON.parse(localStorage.getItem(GROUP_KEY)!)).toEqual({ mode: "monat", date: "plangespraech" });
    // innerhalb der Gruppe: ABM-Nr. numerisch (Standardsortierung), BVA/leer zuletzt
    const firstGroup: string[] = [];
    for (let tr = host.querySelector("tr.row-group")!.nextElementSibling; tr && !tr.classList.contains("row-group"); tr = tr.nextElementSibling) {
      firstGroup.push(tr.querySelector(`td:nth-child(${EXCEL_HEADERS.indexOf("ABM-Nr.") + 2})`)!.textContent!);
    }
    const keys = firstGroup.filter((a) => /^\d{4}-\d+$/.test(a)).map((a) => a.split("-").map(Number));
    expect(keys.length).toBeGreaterThan(1);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    // Nummerierung läuft über die Gruppen weiter
    const nr = [...host.querySelectorAll("tbody tr:not(.row-group):not(.row-detail) td:nth-child(2)")].map((td) => td.textContent);
    expect(nr).toEqual(nr.map((_, i) => String(i + 1)));
  });

  it("Gruppe einklappen und wieder aufklappen; Verlauf und Projekt öffnen gehen weiter", async () => {
    await render();
    await choose("Fertighausfirma");
    const head = groupHeads()[0];
    const n = Number(head.textContent!.match(/\((\d+)\)$/)![1]);
    const before = dataRows();
    expect(head.getAttribute("aria-expanded")).toBe("true");
    await click(head);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(dataRows()).toBe(before - n);
    await click(head);
    expect(dataRows()).toBe(before);
    expect(openLinks()).toHaveLength(toggles().length);
    await click(toggles()[0]);
    expect(toggles()[0].getAttribute("aria-expanded")).toBe("true");
  });

  it("Gruppierung bleibt nach dem Neuladen; 'Keine' setzt zurück", async () => {
    await render();
    await choose("Jahr");
    act(() => root.unmount());
    root = createRoot(host);
    await render();
    expect(buttonStartingWith("Gruppierung").textContent).toContain("Jahr");
    expect(groupHeads().length).toBeGreaterThan(0);
    await choose("Keine");
    expect(groupHeads()).toHaveLength(0);
    expect(localStorage.getItem(GROUP_KEY)).toBeNull();
  });
});
