// @vitest-environment jsdom
// Reiter Planungsprotokoll, Formular „Angaben für Seite 1“: speichert nur geänderte Rollen und lädt neue Daten nach, damit
// es nichts löscht, was inzwischen anderswo eingetragen wurde (z. B. die Gemeinde aus den Standortangaben).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { createDemoRepo } from "../../lib/demoRepo";
import type { Repo } from "../../lib/repo";
import { SessionProvider } from "../../lib/session";
import { DataProvider, useData } from "../../lib/store";
import { PlanungsprotokollTab } from "./PlanungsprotokollTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN = { name: "Demo", role: "admin" } as const;

function Rahmen({ projectId }: { projectId: string }) {
  const { data } = useData();
  const project = data?.projects.find((p) => p.id === projectId);
  if (!project || !data) return null;
  return <PlanungsprotokollTab project={project} data={data} contact={data.bauherren.find((b) => b.projectId === projectId) ?? null} />;
}

async function warten() {
  for (let i = 0; i < 6; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
}

describe("PlanungsprotokollTab: Angaben für Seite 1", () => {
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
  const tippen = async (id: string, wert: string) => {
    const el = host.ownerDocument.getElementById(id) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, wert);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const knopf = (text: RegExp) => [...host.querySelectorAll("button")].find((b) => text.test(b.textContent ?? "")) as HTMLButtonElement;
  const partei = async (role: string) => (await repo.load(ADMIN)).parties.find((p) => p.projectId === projectId && p.role === role);

  beforeEach(async () => {
    repo = createDemoRepo("2026-10-24", { delayMs: 0 });
    const p = (await repo.load(ADMIN)).projects[0];
    projectId = p.id;
    await repo.updateProject(p.id, { project: { bundesland: "BW", location: "89000 Musterstadt" }, parties: { gemeinde: null, erdbauer: null, baugrundgutachter: null } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("löscht keine Gemeinde, die nach dem Öffnen über die Standortangaben eingetragen wurde", async () => {
    await anzeigen();
    // Gemeinde übernehmen (Standortangaben), danach im Formular nur den Erdbauer eintragen und speichern
    await act(async () => knopf(/Alle übernehmen/).click());
    await warten();
    expect((await partei("gemeinde"))?.name).toBe("Gemeindeverwaltung Musterstadt");
    await tippen(`pp-${projectId}-erdbauer-name`, "Erdbau Muster");
    await act(async () => knopf(/Angaben speichern/).click());
    await warten();
    expect((await partei("erdbauer"))?.name).toBe("Erdbau Muster");
    expect((await partei("gemeinde"))?.name).toBe("Gemeindeverwaltung Musterstadt");
    // Das Formular zeigt die übernommene Gemeinde
    expect((host.ownerDocument.getElementById(`pp-${projectId}-gemeinde-name`) as HTMLInputElement).value).toBe("Gemeindeverwaltung Musterstadt");
  });

  it("Baugrundgutachter: ohne Eintrag im Projekt steht der Standard aus den Bürodaten in der Übersicht", async () => {
    await anzeigen();
    expect(host.textContent).toContain("Standard: Baugrundbüro Muster (Demo)");
    expect((await partei("baugrundgutachter"))).toBeUndefined();
  });
});
