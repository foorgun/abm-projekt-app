// @vitest-environment jsdom
// Karte „Baugrundauftrag Clayton“ im Reiter Planungsprotokoll: nur bei Schwabenhaus, Vorschau mit „fehlt“, ohne Vorlage
// eine klare Meldung und keine Fassung.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { createDemoRepo } from "../../lib/demoRepo";
import type { Repo } from "../../lib/repo";
import { SessionProvider } from "../../lib/session";
import { DataProvider, useData } from "../../lib/store";
import { ClaytonAuftrag } from "./ClaytonAuftrag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN = { name: "Demo", role: "admin" } as const;

function Rahmen({ projectId }: { projectId: string }) {
  const { data } = useData();
  const project = data?.projects.find((p) => p.id === projectId);
  if (!project || !data) return null;
  return <ClaytonAuftrag project={project} data={data} />;
}

async function warten() {
  for (let i = 0; i < 6; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
}

describe("ClaytonAuftrag", () => {
  let host: HTMLDivElement;
  let root: Root;
  let repo: Repo;

  const anzeigen = async (projectId: string) => {
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
  const projektVon = async (firma: string) => {
    const d = await repo.load(ADMIN);
    return d.projects.find((p) => d.companies.find((c) => c.id === p.companyId)?.name === firma)!;
  };

  beforeEach(() => {
    repo = createDemoRepo("2026-11-11", { delayMs: 0 });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("zeigt die Karte bei Schwabenhaus mit Vorschau und Knopf", async () => {
    const p = await projektVon("Schwabenhaus");
    await anzeigen(p.id);
    expect(host.textContent).toContain("Baugrundauftrag Clayton");
    expect(host.querySelector('[aria-label="Vorschau Baugrundauftrag"]')?.textContent).toContain("Schwabenhaus");
    expect([...host.querySelectorAll("button")].some((b) => /Baugrundauftrag erzeugen/.test(b.textContent ?? ""))).toBe(true);
    expect(host.textContent).toContain("Noch kein Baugrundauftrag erzeugt");
  });

  it("markiert Fehlendes und zeigt ohne Vorlage einen Fehler, ohne eine Fassung anzulegen", async () => {
    const p = await projektVon("Schwabenhaus");
    await repo.updateProject(p.id, { project: { hausbauNr: null } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nicht da", { status: 404 }));
    await anzeigen(p.id);
    expect(host.textContent).toContain("Projektnummer (Hausbau-Nr.)");
    const knopf = [...host.querySelectorAll("button")].find((b) => /Baugrundauftrag erzeugen/.test(b.textContent ?? ""))!;
    await act(async () => knopf.click());
    await warten();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/nicht gefunden|Schrift/);
    expect((await repo.load(ADMIN)).baugrundauftraege).toEqual([]);
  });

  it("keine Karte bei anderen Hausbaufirmen", async () => {
    for (const firma of ["Bien-Zenker", "Living Haus"]) {
      const p = await projektVon(firma);
      if (!p) continue;
      await anzeigen(p.id);
      expect(host.textContent, firma).not.toContain("Baugrundauftrag");
    }
  });
});
