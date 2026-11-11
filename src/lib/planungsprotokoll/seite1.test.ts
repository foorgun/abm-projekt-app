// „Seite 1 ausfüllen“: drei Suchen zugleich, nur leere Rollen, unsichere Treffer bleiben offen (Demo-Repo, erfundene Daten).
import { describe, expect, it } from "vitest";
import { createDemoRepo } from "../demoRepo";
import type { Repo } from "../repo";
import type { Dataset, PartyRole } from "../types";
import { protokollDaten } from "./daten";
import { seite1Ermitteln, seite1Neu } from "./seite1";

const admin = { name: "Mehmet Cetin", role: "admin" as const };
const SUCHROLLEN: PartyRole[] = ["gemeinde", "bauamt", "wasser", "abwasser", "strom", "schornsteinfeger"];

/** Demo-Projekt mit vollständigem Bauort (erfunden) und ohne die gesuchten Rollen. */
async function vorbereiten(behalten: PartyRole[] = []) {
  const repo = createDemoRepo("2026-11-11", { delayMs: 0 });
  const d = await repo.load(admin);
  const p = d.projects[0];
  const data: Dataset = {
    ...d,
    parties: d.parties.filter((x) => x.projectId !== p.id || !SUCHROLLEN.includes(x.role) || behalten.includes(x.role)),
    bauherren: d.bauherren.map((b) => (b.projectId === p.id ? { ...b, siteStreet: "Musterstraße 3", sitePostalCode: "89000", siteCity: "Musterstadt", siteState: "Baden-Württemberg" } : b)),
    standortAngaben: d.standortAngaben.filter((x) => x.projectId !== p.id),
  };
  return { repo, data, p };
}

describe("Seite 1 ausfüllen", () => {
  it("trägt Gemeinde, Bauamt, Wasser, Abwasser und Schornsteinfeger ein; unsicherer Strom bleibt offen", async () => {
    const { repo, data, p } = await vorbereiten();
    const e = await seite1Ermitteln(repo, data, p.id);
    expect(Object.keys(e.parties).sort()).toEqual(["abwasser", "bauamt", "gemeinde", "schornsteinfeger", "wasser"]);
    expect(e.parties.schornsteinfeger?.name).toBe("Erika Rußmann");
    expect(e.parties.bauamt?.email).toBe("bauordnung@demo.example");
    // Leere Felder kommen als null, nicht als leere Zeichenkette
    expect(e.parties.wasser?.email).toBeNull();
    expect(e.offen.some((x) => x.startsWith("Stromnetzbetreiber: unsicherer Treffer"))).toBe(true);
    expect(e.standort && Object.keys(e.standort).length).toBeGreaterThan(0);
    expect(seite1Neu(e)).toBe(true);
  });

  it("lässt Vorhandenes unverändert und sucht dafür nicht", async () => {
    const { repo, data, p } = await vorbereiten(["bauamt"]);
    const bauamt = data.parties.find((x) => x.projectId === p.id && x.role === "bauamt");
    const e = await seite1Ermitteln(repo, data, p.id);
    if (bauamt) expect(e.parties.bauamt).toBeUndefined();
    let gesucht = false;
    const alles = { ...data, parties: [...data.parties, ...SUCHROLLEN.map((role) => ({ id: role, projectId: p.id, role, name: "Schon da", contact: null }) as Dataset["parties"][number])] };
    const zaehlend: Repo = { ...repo, versorgerSuchen: async (a) => ((gesucht = true), repo.versorgerSuchen(a)), schornsteinfegerSuchen: async (a) => ((gesucht = true), repo.schornsteinfegerSuchen(a)) };
    const leer = await seite1Ermitteln(zaehlend, { ...alles, standortAngaben: [{ projectId: p.id, angaben: { radon: { wert: "nein", anzeige: "x", quelle: null, abgerufenAm: null, geaendert: false } }, geaendertAm: "2026-11-11" }] }, p.id);
    expect(gesucht).toBe(false);
    expect(seite1Neu(leer)).toBe(false);
  });

  it("meldet Fehler je Rolle statt abzubrechen", async () => {
    const { repo, data, p } = await vorbereiten();
    const kaputt: Repo = {
      ...repo,
      versorgerSuchen: async () => ({ ok: false, code: "limit", message: "Für heute aufgebraucht." }),
      schornsteinfegerSuchen: async () => {
        throw new Error("Netz weg");
      },
    };
    const e = await seite1Ermitteln(kaputt, data, p.id);
    expect(e.parties.gemeinde).toBeDefined();
    expect(e.offen).toContain("Genehmigungsbehörde (Bauamt): Für heute aufgebraucht.");
    expect(e.offen).toContain("Schornsteinfeger: Netz weg");
  });

  it("nennt einen fehlenden Wert beim Standort nur einmal", async () => {
    const { repo, data, p } = await vorbereiten();
    const m = "Bundesland des Bauorts fehlt.";
    const ohne: Repo = { ...repo, standortAnalyse: async () => ({ ok: false, code: "fehlende_angaben", message: m, fehlt: [m] }) };
    const e = await seite1Ermitteln(ohne, data, p.id);
    expect(e.offen).toContain(`Gemeinde: ${m}`);
  });

  it("Bundesland im Protokoll: ohne eigene Angabe das des Projekts", async () => {
    const { data, p } = await vorbereiten();
    const ohne: Dataset = { ...data, projects: data.projects.map((x) => (x.id === p.id ? { ...x, bundesland: "BW" } : x)), bauherren: data.bauherren.map((b) => (b.projectId === p.id ? { ...b, siteState: null } : b)) };
    expect(protokollDaten(ohne, p.id).bauort.bundesland).toBe("Baden-Württemberg");
  });
});
