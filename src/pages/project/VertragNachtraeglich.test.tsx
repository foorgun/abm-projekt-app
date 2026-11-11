// @vitest-environment jsdom
// Vertrag nachträglich auslesen: Vermesservertrag wählen, Vergleich prüfen, gewählte Werte übernehmen, Datei ablegen.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { createDemoRepo } from "../../lib/demoRepo";
import { vermesservertragFile } from "../../lib/extract/fixtures";
import type { AuthApi } from "../../lib/auth";
import type { Repo } from "../../lib/repo";
import { SessionProvider } from "../../lib/session";
import { DataProvider, useData } from "../../lib/store";
import { VertragNachtraeglich } from "./VertragNachtraeglich";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom kennt Blob.arrayBuffer nicht; der Mock-Extractor liest die Text-PDF darüber (im Browser vorhanden)
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}

function Rahmen({ projectId }: { projectId: string }) {
  const { data } = useData();
  const project = data?.projects.find((p) => p.id === projectId);
  const contact = data?.bauherren.find((b) => b.projectId === projectId) ?? null;
  return project && data ? <VertragNachtraeglich project={project} data={data} contact={contact} /> : null;
}

const ADMIN = { name: "Demo", role: "admin" } as const;

async function warten() {
  for (let i = 0; i < 10; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
}

const knopf = (c: HTMLElement, text: RegExp) => [...c.querySelectorAll("button")].find((b) => text.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
const box = (c: HTMLElement, key: string) => c.querySelector(`#vn-${key}`) as HTMLInputElement | null;

describe("VertragNachtraeglich", () => {
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
  const waehlen = async (file: File) => {
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await warten();
  };
  const stand = async () => {
    const d = await repo.load(ADMIN);
    return {
      project: d.projects.find((p) => p.id === projectId)!,
      contact: d.bauherren.find((b) => b.projectId === projectId),
      parties: d.parties.filter((p) => p.projectId === projectId),
      documents: d.documents.filter((x) => x.projectId === projectId),
      activities: d.activities.filter((a) => a.projectId === projectId),
    };
  };

  beforeEach(async () => {
    repo = createDemoRepo("2026-10-24", { delayMs: 0 });
    await repo.load(ADMIN);
    // erfundenes Projekt: Gemarkung schon da (gleich), Flurstück anders (Konflikt), Telefon anders (Konflikt)
    const p = await repo.createProject({
      kind: "neubau",
      abmNr: null,
      hausbauNr: null,
      bauherrLabel: "Hoffmann",
      companyId: null,
      salespersonId: null,
      location: null,
      architectId: null,
      planerId: null,
      intakeMonth: "2026-10-01",
      gemarkung: "Bermaringen",
      flurstueck: "999",
      bauherr: { phone: "0731 000111", email: null, address: "Lindenweg 12, 89073 Ulm", buildingAddress: null },
      createFolders: true,
    });
    projectId = p.id;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("zeigt den Vergleich: leere Felder vorgewählt, Konflikte nicht, Gleiches nur als Hinweis", async () => {
    await anzeigen();
    expect(knopf(host, /Übernehmen/)).toBeUndefined();
    await waehlen(vermesservertragFile());

    expect((host.querySelector("#vn-art") as HTMLSelectElement).value).toBe("vermessungsvertrag");
    expect(host.textContent).toContain("„04 Vermesser“");
    expect(box(host, "buildingAddress")?.checked).toBe(true);
    expect(box(host, "flur")?.checked).toBe(true);
    expect(box(host, "location")?.checked).toBe(true);
    expect(box(host, "vermesser")?.checked).toBe(true);
    // Konflikte: sichtbar markiert, nicht vorgewählt
    expect(box(host, "flurstueck")?.checked).toBe(false);
    expect(box(host, "phone")?.checked).toBe(false);
    expect(box(host, "flurstueck")?.closest(".vn-zeile")?.getAttribute("data-status")).toBe("abweichend");
    expect(box(host, "flurstueck")?.closest(".vn-zeile")?.textContent).toMatch(/weicht ab.*999.*1234\/5/);
    // gleich: keine Auswahl, nur genannt
    expect(box(host, "gemarkung")).toBeNull();
    expect(host.querySelector(".vn-gleich")?.textContent).toMatch(/Gemarkung.*Anschrift/);
    expect(host.textContent).toMatch(/Standard aus den Bürodaten/);
    // nichts geschrieben, solange nicht übernommen
    expect((await stand()).project.flur ?? null).toBeNull();
  });

  it("„Übernehmen“ schreibt nur die gewählten Felder und legt die Datei im Ordner der Art ab", async () => {
    await anzeigen();
    await waehlen(vermesservertragFile());
    // Flurstück bewusst übernehmen, Bauort abwählen
    await klick(box(host, "flurstueck"));
    await klick(box(host, "location"));
    await klick(knopf(host, /Übernehmen \(/));

    const s = await stand();
    expect(s.project).toMatchObject({ flur: "3", flurstueck: "1234/5", gemarkung: "Bermaringen", location: null });
    expect(s.contact).toMatchObject({ phone: "0731 000111", buildingAddress: "Am Hölzle 12, 89134 Blaustein", siteStreet: "Am Hölzle 12", sitePostalCode: "89134", siteCity: "Blaustein" });
    expect(s.parties.find((p) => p.role === "vermesser")).toMatchObject({ name: "Vermessungsbüro Beispiel", address: "Musterstraße 1, 89073 Ulm" });
    expect(s.documents).toEqual([expect.objectContaining({ name: "Vermesservertrag_Hoffmann_Beispiel.pdf", folderPath: "04 Vermesser", docType: "vermessungsvertrag" })]);
    expect(s.documents[0].meta).toMatchObject({ vertragsdatum: "2026-10-05" });
    // Verlauf: Änderung und Ablage
    const texte = s.activities.map((a) => a.text).join(" | ");
    expect(texte).toMatch(/Flurstück/);
    expect(texte).toMatch(/Vermesservertrag_Hoffmann_Beispiel\.pdf abgelegt/);
    // Vorschau ist zu
    expect(knopf(host, /Übernehmen/)).toBeUndefined();
  });

  it("ohne Ablage und ohne Auswahl: nichts zu tun", async () => {
    await anzeigen();
    await waehlen(vermesservertragFile());
    for (const k of ["buildingAddress", "flur", "location", "vermesser", "bauherrName"]) if (box(host, k)?.checked) await klick(box(host, k));
    await klick(host.querySelector(".checkbox input"));
    expect(knopf(host, /Nur Datei ablegen|Übernehmen/)?.disabled).toBe(true);
    await klick(knopf(host, /Verwerfen/));
    const s = await stand();
    expect(s.documents).toEqual([]);
    expect(s.parties.some((p) => p.role === "vermesser")).toBe(false);
  });

  it("Werkvertrag mit Bodenplatte bauseits: Kellerbauer „Bauseits“, nicht vorgewählt bei anderem Kellerbauer", async () => {
    const { textPdf } = await import("../../lib/extract/fixtures");
    const werk = () => new File([textPdf(["Werkvertrag über die Errichtung eines Hauses", "1. Bauherr: Hoffmann, Jonas", "Die Bodenplatte wird bauseits erstellt.", "Ulm, den 02.10.2026"]) as BlobPart], "Werkvertrag_Hoffmann.pdf", { type: "application/pdf" });
    await anzeigen();
    await waehlen(werk());
    expect(box(host, "kellerBauseits")?.checked).toBe(true);
    await klick(knopf(host, /Übernehmen \(/));
    let s = await stand();
    expect(s.parties.find((p) => p.role === "kellerbauer")?.name).toBe("Bauseits");
    expect(s.documents[0]).toMatchObject({ folderPath: "00 Verträge", docType: "werkvertrag" });

    await repo.updateProject(projectId, { parties: { kellerbauer: { name: "Keller Müller GmbH" } } });
    act(() => root.unmount());
    root = createRoot(host);
    await anzeigen();
    await waehlen(werk());
    expect(box(host, "kellerBauseits")?.checked).toBe(false);
    expect(box(host, "kellerBauseits")?.closest(".vn-zeile")?.textContent).toContain("Keller Müller GmbH");
    // Datei liegt schon dort: Ablage nicht vorgewählt
    expect((host.querySelector(".checkbox input") as HTMLInputElement).checked).toBe(false);
    await klick(knopf(host, /Verwerfen/));
    s = await stand();
    expect(s.parties.find((p) => p.role === "kellerbauer")?.name).toBe("Keller Müller GmbH");
  });

  it("Freiberufler sehen den Bereich nicht", async () => {
    const d = await repo.load(ADMIN);
    const project = d.projects.find((p) => p.id === projectId)!;
    const frei: AuthApi = {
      current: async () => ({ id: "f1", email: "f@example.com", profile: { name: "F", role: "freiberufler" } }),
      signIn: async () => ({ id: "f1", email: "f@example.com", profile: null }),
      signOut: async () => undefined,
      changePassword: async () => undefined,
      onChange: () => () => undefined,
    };
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SessionProvider auth={frei}>
            <ToastProvider>
              <DataProvider repo={repo}>
                <VertragNachtraeglich project={project} data={d} contact={null} />
              </DataProvider>
            </ToastProvider>
          </SessionProvider>
        </MemoryRouter>,
      );
    });
    await warten();
    expect(host.textContent).not.toContain("Vertrag nachträglich auslesen");
  });
});
