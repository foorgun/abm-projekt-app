// @vitest-environment jsdom
// Standortangaben im Reiter Planungsprotokoll: ermitteln, abwählen, ändern, mit einer Bestätigung übernehmen.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { createDemoRepo } from "../../lib/demoRepo";
import type { Repo } from "../../lib/repo";
import { SessionProvider } from "../../lib/session";
import { ankreuzWerte } from "../../lib/planungsprotokoll/zuordnung";
import { DataProvider, useData } from "../../lib/store";
import { StandortAngaben } from "./StandortAngaben";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Rahmen({ projectId }: { projectId: string }) {
  const { data } = useData();
  const project = data?.projects.find((p) => p.id === projectId);
  return project && data ? <StandortAngaben project={project} data={data} vorlage="living-haus" /> : null;
}

const ADMIN = { name: "Demo", role: "admin" } as const;

async function warten() {
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
}

const knopf = (c: HTMLElement, text: RegExp) => [...c.querySelectorAll("button")].find((b) => text.test(b.textContent ?? "")) as HTMLButtonElement | undefined;

describe("StandortAngaben", () => {
  let host: HTMLDivElement;
  let root: Root;
  let repo: Repo;
  let projectId: string;

  const anzeigen = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SessionProvider auth={null}>
            <ToastProvider>
              <DataProvider repo={repo}>
                <Rahmen projectId={projectId} />
              </DataProvider>
            </ToastProvider>
          </SessionProvider>
        </MemoryRouter>,
      );
    });
    await warten();
  };
  const klick = async (el: Element | undefined | null) => {
    await act(async () => {
      (el as HTMLElement).click();
    });
    await warten();
  };
  const gespeichert = async () => (await repo.load(ADMIN)).standortAngaben.find((x) => x.projectId === projectId)?.angaben;

  beforeEach(async () => {
    repo = createDemoRepo("2026-10-24", { delayMs: 0 });
    const data = await repo.load(ADMIN);
    const p = data.projects[0];
    projectId = p.id;
    await repo.updateProject(p.id, { project: { bundesland: "BW", location: "89000 Musterstadt" } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("schreibt beim Ermitteln nichts; erst „Alle übernehmen“ speichert, abgewählte Werte bleiben draußen", async () => {
    await anzeigen();
    expect(host.textContent).not.toContain("Schneelastzone");
    await klick(knopf(host, /Standortangaben ermitteln/));
    expect(host.textContent).toContain("Schneelastzone");
    expect(await gespeichert()).toBeUndefined();

    // Hochwasser abwählen, Wasserschutz ändern
    await klick(host.querySelector("#pp-standort-hochwasser"));
    const select = host.querySelector('select[aria-label="Wert für Wasserschutzgebiet"]') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "2");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await klick(knopf(host, /Alle übernehmen/));
    const a = await gespeichert();
    expect(a?.schneelast).toMatchObject({ wert: "2", geaendert: false });
    expect(a?.wasserschutz).toMatchObject({ wert: "2", geaendert: true });
    expect(a?.hochwasser).toBeUndefined();
    // Lärm war nicht vorausgewählt, Strom ist nicht ermittelbar
    expect(a?.laerm).toBeUndefined();
    expect(a?.strom).toBeUndefined();
    expect(host.textContent).toContain("Übernommen");
    expect(ankreuzWerte("living-haus", a).kreuze).toContainEqual({ feld: "Kontrollkästchen 2.18" });
  });

  it("nicht ermittelbare Felder zeigen Grund und Viewer und bieten keine Auswahl", async () => {
    await anzeigen();
    await klick(knopf(host, /Standortangaben ermitteln/));
    expect(host.querySelector("#pp-standort-strom")).toBeNull();
    expect(host.textContent).toMatch(/keine amtliche, frei nutzbare Zuordnung/);
    const links = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links.some((h) => h?.includes("marktstammdatenregister"))).toBe(true);
    // Für ermittelte Felder gibt es keinen Viewer-Link
    expect(links.some((h) => h?.includes("bfs"))).toBe(false);
  });

  it("anderes Bundesland: klare Meldung, keine Liste", async () => {
    await repo.updateProject(projectId, { project: { bundesland: "NW" } });
    await anzeigen();
    await klick(knopf(host, /Standortangaben ermitteln/));
    expect(host.textContent).toMatch(/noch nicht verfügbar/);
    expect(knopf(host, /Alle übernehmen/)).toBeUndefined();
  });

  it("übernommene Werte lassen sich wieder entfernen", async () => {
    await anzeigen();
    await klick(knopf(host, /Standortangaben ermitteln/));
    await klick(knopf(host, /Alle übernehmen/));
    expect(Object.keys((await gespeichert()) ?? {}).length).toBeGreaterThan(0);
    await klick(knopf(host, /Übernommene Werte entfernen/));
    expect(await gespeichert()).toEqual({});
  });
});
