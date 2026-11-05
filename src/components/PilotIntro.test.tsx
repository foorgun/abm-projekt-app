// @vitest-environment jsdom
// Willkommenshinweis und Terminkarte: in production keine Aussage über erfundene Daten, keine Demo-Termine.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoRepo } from "../lib/demoRepo";
import { SessionProvider } from "../lib/session";
import { DataProvider } from "../lib/store";
import { PRODUCTION_REF } from "../lib/umgebung";
import { Dashboard } from "../pages/Dashboard";
import { PilotIntroContent } from "./PilotIntro";
import { ToastProvider } from "./Toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let root: Root;
let host: HTMLElement;
const production = () => vi.stubEnv("VITE_SUPABASE_URL", `https://${PRODUCTION_REF}.supabase.co`);

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_APP_MODE", "");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllEnvs();
});

const renderIntro = () =>
  act(async () =>
    root.render(
      <SessionProvider auth={null}>
        <PilotIntroContent />
      </SessionProvider>,
    ),
  );
const renderDashboard = () =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <SessionProvider auth={null}>
          <ToastProvider>
            <DataProvider repo={createDemoRepo()}>
              <Dashboard />
            </DataProvider>
          </ToastProvider>
        </SessionProvider>
      </MemoryRouter>,
    ),
  );

describe("Willkommenshinweis", () => {
  it("nennt außerhalb von production die erfundenen Daten", async () => {
    await renderIntro();
    expect(host.textContent).toContain("Die Daten sind erfunden");
  });

  it.each(["voll", "pilot"])("macht in production (%s) keine Aussage über erfundene Daten oder Beispiele", async (mode) => {
    production();
    vi.stubEnv("VITE_APP_MODE", mode);
    await renderIntro();
    expect(host.textContent).toContain("Pilotphase");
    expect(host.textContent).toContain("Rückmeldung");
    expect(host.textContent).not.toMatch(/erfunden|Beispiel|Kundendaten|Ausprobieren/i);
  });

  it("nennt den Posteingangs-Agenten nur, wenn er im Umfang ist", async () => {
    production();
    vi.stubEnv("VITE_APP_MODE", "pilot");
    await renderIntro();
    expect(host.textContent).not.toContain("Posteingangs-Agent");
  });
});

describe("Terminkarte auf dem Dashboard", () => {
  const karte = () => host.textContent?.includes("Termine diese Woche");

  it("erscheint außerhalb von production", async () => {
    await renderDashboard();
    await vi.waitFor(() => expect(karte()).toBe(true));
  });

  it("fehlt in production", async () => {
    production();
    await renderDashboard();
    await vi.waitFor(() => expect(host.textContent).toContain("Aktive Projekte"));
    expect(karte()).toBe(false);
  });
});
