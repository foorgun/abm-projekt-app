import { describe, expect, it } from "vitest";
import { META_NAV, NAV, visibleNav } from "../components/layout/nav";
import { allowedInPilot, appMode, homePath, isPilot, PILOT_ALERT_KINDS, PILOT_HOME, PILOT_NAV, PILOT_PROJECT_TABS, pilotRedirect } from "./appMode";
import type { AppRole } from "./session";

const ROLES: AppRole[] = ["admin", "mitarbeiter", "freiberufler"];
const labels = (role: AppRole, pilot: boolean) => {
  const nav = visibleNav(role, pilot);
  return { groups: nav.groups.flatMap((g) => g.items.map((i) => i.label)), meta: nav.meta.map((i) => i.label) };
};

describe("isPilot / appMode", () => {
  it("nur der Wert pilot schaltet den Pilot ein", () => {
    expect(isPilot({ VITE_APP_MODE: "pilot" })).toBe(true);
    expect(isPilot({ VITE_APP_MODE: " Pilot " })).toBe(true);
    expect(isPilot({})).toBe(false);
    expect(isPilot({ VITE_APP_MODE: "" })).toBe(false);
    expect(isPilot({ VITE_APP_MODE: "voll" })).toBe(false);
    expect(isPilot({ VITE_APP_MODE: "pilot2" })).toBe(false);
    expect(appMode({ VITE_APP_MODE: "pilot" })).toBe("pilot");
    expect(appMode({})).toBe("voll");
  });

  it("Startseite: Projektliste im Pilot, Dashboard sonst", () => {
    expect(homePath(true)).toBe("/projekte");
    expect(homePath(false)).toBe("/");
  });

  it("die Tests selbst laufen ohne VITE_APP_MODE (voller Umfang)", () => {
    expect(isPilot()).toBe(false);
  });
});

describe("Menü", () => {
  it("voller Umfang: unverändert wie bisher", () => {
    const all = NAV.flatMap((g) => g.items.map((i) => i.label));
    expect(labels("admin", false).groups).toEqual(all);
    expect(labels("admin", false).meta).toEqual(["Einstellungen", "Hilfe"]);
    expect(labels("mitarbeiter", false).groups).toEqual(all);
    expect(labels("freiberufler", false).groups).toEqual(["Dashboard", "Alle Projekte", "Aktive Projekte", "Abgeschlossene Projekte", "Pipeline", "Dokumente", "Kontakte"]);
    expect(labels("freiberufler", false).meta).toEqual(["Einstellungen", "Hilfe"]);
  });

  it("Pilot, jede Rolle: Projekte, Einstellungen (Darstellung), Hilfe", () => {
    for (const role of ["admin", "mitarbeiter", "freiberufler"] as const) {
      expect(labels(role, true), role).toEqual({ groups: ["Projekte"], meta: ["Einstellungen", "Hilfe"] });
    }
  });

  it("Pilot: der Eintrag Projekte zeigt auf die Projektliste", () => {
    const nav = visibleNav("mitarbeiter", true);
    expect(nav.groups).toHaveLength(1);
    expect(nav.groups[0].items.map((i) => i.to)).toEqual([PILOT_HOME]);
  });

  it("jeder Pilot-Menüpunkt gibt es im vollen Menü und als erlaubte Route", () => {
    const targets = [...NAV.flatMap((g) => g.items), ...META_NAV].map((i) => i.to);
    for (const n of PILOT_NAV) {
      expect(targets).toContain(n.to);
      for (const r of n.roles ?? ROLES) expect(allowedInPilot(n.to, r)).toBe(true);
    }
  });
});

describe("Umleitungen im Pilot", () => {
  const hidden = [
    "/",
    "",
    "/pipeline",
    "/aufgaben",
    "/dokumente",
    "/rechnungen",
    "/auswertungen",
    "/abwesenheit",
    "/agent",
    "/agent/pruefung",
    "/agent/postfaecher",
    "/kontakte",
    "/styleguide",
    "/gibt-es-nicht",
    "/projekte/abc/mehr",
  ];

  for (const role of ROLES) {
    it(`${role}: ausgeblendete Seiten führen zur Projektliste`, () => {
      for (const path of hidden) expect(pilotRedirect(path, role, true), path).toBe(PILOT_HOME);
    });

    it(`${role}: Projektliste, Projekt-Detail und Hilfe bleiben`, () => {
      for (const path of ["/projekte", "/projekte/", "/projekte/aktiv", "/projekte/abgeschlossen", "/projekte/p-123", "/hilfe"]) {
        expect(pilotRedirect(path, role, true), path).toBeNull();
      }
    });

    it(`${role}: außerhalb des Pilots wird nie umgeleitet`, () => {
      for (const path of [...hidden, "/projekte", "/einstellungen"]) expect(pilotRedirect(path, role, false), path).toBeNull();
    });
  }

  it("Einstellungen für jede Rolle erreichbar (Darstellung)", () => {
    expect(pilotRedirect("/einstellungen", "admin", true)).toBeNull();
    expect(pilotRedirect("/einstellungen", "mitarbeiter", true)).toBeNull();
    expect(pilotRedirect("/einstellungen", "freiberufler", true)).toBeNull();
  });
});

describe("Projekt-Detail und Warnungen im Pilot", () => {
  it("Reiter: Übersicht, Dokumente, Planungsprotokoll, Verlauf", () => {
    expect([...PILOT_PROJECT_TABS]).toEqual(["uebersicht", "dokumente", "planungsprotokoll", "aktivitaet"]);
  });

  it("keine Warnungen zu Rechnungen", () => {
    expect(PILOT_ALERT_KINDS).not.toContain("invoice_unsent");
    expect(PILOT_ALERT_KINDS).toEqual(["contract_open", "permit_waiting"]);
  });
});
