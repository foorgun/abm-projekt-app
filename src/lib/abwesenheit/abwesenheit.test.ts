import { describe, expect, it } from "vitest";
import type { Abwesenheit, UrlaubsAnspruch } from "../types";
import { feiertageBW, feiertagName, istFeiertag, ostersonntag } from "./feiertage";
import { darfEntscheiden, endeVon, gleichzeitigAbwesend, pruefeKrank, pruefeUrlaub, STANDARD_ANSPRUCH, ueberschneidungen, urlaubsStand, zahl } from "./urlaub";
import { istWerktag, jahreVon, werktage, werktageImJahr, wochentag } from "./werktage";

const HEUTE = "2026-10-13";
let n = 0;
const a = (patch: Partial<Abwesenheit>): Abwesenheit => ({
  id: `a${++n}`,
  userId: "u1",
  art: "urlaub",
  von: "2026-08-03",
  bis: "2026-08-07",
  werktage: 5,
  status: "genehmigt",
  notiz: null,
  entscheidungVon: null,
  entscheidungAm: null,
  ablehnGrund: null,
  createdAt: "2026-07-01T08:00:00",
  ...patch,
});

describe("Feiertage Baden-Württemberg", () => {
  it("berechnet Ostern", () => {
    expect([2024, 2025, 2026, 2027, 2028, 2030, 2038].map(ostersonntag)).toEqual(["2024-03-31", "2025-04-20", "2026-04-05", "2027-03-28", "2028-04-16", "2030-04-21", "2038-04-25"]);
  });

  it("kennt die zwölf Feiertage 2026", () => {
    expect(feiertageBW(2026).map((f) => `${f.datum} ${f.name}`)).toEqual([
      "2026-01-01 Neujahr",
      "2026-01-06 Heilige Drei Könige",
      "2026-04-03 Karfreitag",
      "2026-04-06 Ostermontag",
      "2026-05-01 Tag der Arbeit",
      "2026-05-14 Christi Himmelfahrt",
      "2026-05-25 Pfingstmontag",
      "2026-06-04 Fronleichnam",
      "2026-10-03 Tag der Deutschen Einheit",
      "2026-11-01 Allerheiligen",
      "2026-12-25 1. Weihnachtstag",
      "2026-12-26 2. Weihnachtstag",
    ]);
  });

  it("Heiligabend und Silvester sind keine Feiertage, andere Bundesländer zählen nicht", () => {
    for (const d of ["2026-12-24", "2026-12-31", "2026-10-31", "2026-08-15", "2026-11-18"]) expect(istFeiertag(d), d).toBe(false);
    expect(feiertagName("2027-05-27")).toBe("Fronleichnam");
    expect(feiertagName("2025-06-09")).toBe("Pfingstmontag");
  });
});

describe("Werktage", () => {
  it("zählt Montag bis Freitag, beide Tage eingeschlossen", () => {
    expect(wochentag("2026-10-12")).toBe(1);
    expect(wochentag("2026-10-18")).toBe(7);
    expect(werktage("2026-10-12", "2026-10-16")).toBe(5);
    expect(werktage("2026-10-12", "2026-10-12")).toBe(1);
    expect(werktage("2026-10-09", "2026-10-19")).toBe(7);
  });

  it("lässt Wochenenden aus", () => {
    expect(werktage("2026-10-17", "2026-10-18")).toBe(0);
    expect(istWerktag("2026-10-17")).toBe(false);
    expect(werktage("2026-10-16", "2026-10-19")).toBe(2);
  });

  it("lässt Feiertage aus, nicht aber Heiligabend und Silvester", () => {
    // Karwoche bis Ostermontag 2026: Karfreitag und Ostermontag frei
    expect(werktage("2026-03-30", "2026-04-06")).toBe(4);
    // Christi Himmelfahrt (Donnerstag) mit Brückentag
    expect(werktage("2026-05-14", "2026-05-15")).toBe(1);
    // 3. Oktober 2026 ist ein Samstag: ändert nichts
    expect(werktage("2026-09-28", "2026-10-04")).toBe(5);
    // Weihnachtswoche 2026: 21.–24. sind Werktage, 25. frei
    expect(werktage("2026-12-21", "2026-12-25")).toBe(4);
    expect(istWerktag("2026-12-24")).toBe(true);
    expect(istWerktag("2026-12-31")).toBe(true);
  });

  it("rechnet über den Jahreswechsel und teilt je Jahr", () => {
    // 28.12.2026 (Mo) bis 08.01.2027 (Fr): 2026 vier Tage (28.–31.), 2027 fünf (4., 5., 7., 8. und … 1.1. und 6.1. frei)
    expect(werktage("2026-12-28", "2027-01-08")).toBe(8);
    expect(werktageImJahr("2026-12-28", "2027-01-08", 2026)).toBe(4);
    expect(werktageImJahr("2026-12-28", "2027-01-08", 2027)).toBe(4);
    expect(werktageImJahr("2026-12-28", "2027-01-08", 2025)).toBe(0);
    expect(jahreVon("2026-12-28", "2027-01-08")).toEqual([2026, 2027]);
  });

  it("gibt 0 bei vertauschten oder ungültigen Daten", () => {
    expect(werktage("2026-10-16", "2026-10-12")).toBe(0);
    expect(werktage("", "2026-10-12")).toBe(0);
    expect(werktage("12.10.2026", "16.10.2026")).toBe(0);
  });
});

describe("Urlaubsstand und Resttage", () => {
  const anspruch: UrlaubsAnspruch[] = [{ userId: "u1", jahr: 2026, tage: 28, uebertrag: 3 }];

  it("rechnet Anspruch plus Übertrag minus genommen minus beantragt", () => {
    const rows = [a({}), a({ von: "2026-10-26", bis: "2026-10-30", status: "offen" }), a({ status: "abgelehnt", von: "2026-06-01", bis: "2026-06-05" }), a({ status: "zurueckgezogen", von: "2026-07-01", bis: "2026-07-03" })];
    expect(urlaubsStand("u1", 2026, rows, anspruch)).toEqual({ jahr: 2026, anspruch: 28, uebertrag: 3, genommen: 5, beantragt: 5, rest: 21 });
  });

  it("nimmt 30 Tage an, wenn nichts eingetragen ist", () => {
    expect(STANDARD_ANSPRUCH).toBe(30);
    expect(urlaubsStand("u2", 2026, [], anspruch)).toEqual({ jahr: 2026, anspruch: 30, uebertrag: 0, genommen: 0, beantragt: 0, rest: 30 });
    expect(urlaubsStand("u1", 2027, [], anspruch).rest).toBe(30);
  });

  it("zählt Krankheit und fremde Einträge nicht, und Urlaub über den Jahreswechsel je Jahr", () => {
    const rows = [a({ art: "krank", von: "2026-09-01", bis: "2026-09-10", werktage: null }), a({ userId: "u2" }), a({ von: "2026-12-28", bis: "2027-01-08" })];
    expect(urlaubsStand("u1", 2026, rows, anspruch).genommen).toBe(4);
    expect(urlaubsStand("u1", 2027, rows, anspruch).genommen).toBe(4);
  });

  it("schreibt Tage ohne unnötige Nachkommastelle", () => {
    expect([30, 2.5, 0].map(zahl)).toEqual(["30", "2,5", "0"]);
  });
});

describe("Überschneidungen", () => {
  const rows = [a({ id: "urlaub" }), a({ id: "offen", von: "2026-10-26", bis: "2026-10-30", status: "offen" }), a({ id: "weg", von: "2026-11-02", bis: "2026-11-06", status: "abgelehnt" }), a({ id: "krank", art: "krank", von: "2026-10-12", bis: null, werktage: null })];

  it("findet eigene offene Anträge, genehmigten Urlaub und Krankmeldungen", () => {
    expect(ueberschneidungen("u1", "2026-08-07", "2026-08-10", rows, HEUTE).map((x) => x.id)).toEqual(["urlaub"]);
    expect(ueberschneidungen("u1", "2026-10-30", "2026-11-03", rows, HEUTE).map((x) => x.id)).toEqual(["offen"]);
    expect(ueberschneidungen("u1", "2026-08-08", "2026-08-09", rows, HEUTE)).toEqual([]);
  });

  it("abgelehnte und zurückgezogene Anträge blockieren nichts, fremde auch nicht", () => {
    expect(ueberschneidungen("u1", "2026-11-02", "2026-11-06", rows, HEUTE)).toEqual([]);
    expect(ueberschneidungen("u2", "2026-08-03", "2026-08-07", rows, HEUTE)).toEqual([]);
  });

  it("eine offene Krankmeldung reicht bis heute, nicht in alle Zukunft", () => {
    expect(endeVon({ von: "2026-10-12", bis: null }, HEUTE)).toBe(HEUTE);
    expect(endeVon({ von: "2026-10-20", bis: null }, HEUTE)).toBe("2026-10-20");
    expect(ueberschneidungen("u1", "2026-10-13", "2026-10-13", rows, HEUTE).map((x) => x.id)).toEqual(["krank"]);
    expect(ueberschneidungen("u1", "2026-10-14", "2026-10-16", rows, HEUTE)).toEqual([]);
  });

  it("zeigt bei der Genehmigung, wer im Zeitraum schon abwesend ist", () => {
    const team = [...rows, a({ id: "kollege", userId: "u2", von: "2026-10-28", bis: "2026-11-04" }), a({ id: "kollege-offen", userId: "u3", von: "2026-10-26", bis: "2026-10-30", status: "offen" })];
    expect(gleichzeitigAbwesend(rows[1], team, HEUTE).map((x) => x.id)).toEqual(["kollege"]);
  });
});

describe("Urlaubsantrag prüfen", () => {
  const anspruch: UrlaubsAnspruch[] = [{ userId: "u1", jahr: 2026, tage: 30, uebertrag: 0 }];
  const taken = [a({ von: "2026-01-12", bis: "2026-02-13" })]; // 25 Tage genommen

  it("zeigt die Werktage und lässt gültige Anträge durch", () => {
    expect(pruefeUrlaub({ userId: "u1", von: "2026-10-19", bis: "2026-10-23" }, taken, anspruch, HEUTE)).toEqual({ werktage: 5, fehler: [], warnungen: [] });
  });

  it("lehnt Ende vor Beginn, Zeiträume ohne Werktag und Überschneidungen ab", () => {
    expect(pruefeUrlaub({ userId: "u1", von: "2026-10-23", bis: "2026-10-19" }, taken, anspruch, HEUTE).fehler).toEqual(["Das Ende liegt vor dem Beginn."]);
    expect(pruefeUrlaub({ userId: "u1", von: "2026-10-17", bis: "2026-10-18" }, taken, anspruch, HEUTE).fehler).toEqual(["Im gewählten Zeitraum liegt kein Werktag."]);
    expect(pruefeUrlaub({ userId: "u1", von: "2026-02-13", bis: "2026-02-16" }, taken, anspruch, HEUTE).fehler[0]).toMatch(/überschneidet/);
    expect(pruefeUrlaub({ userId: "u1", von: "", bis: "" }, taken, anspruch, HEUTE).fehler).toHaveLength(1);
  });

  it("warnt bei mehr als den Resttagen, blockiert aber nicht", () => {
    const r = pruefeUrlaub({ userId: "u1", von: "2026-10-19", bis: "2026-10-30" }, taken, anspruch, HEUTE);
    expect(r.fehler).toEqual([]);
    expect(r.warnungen).toEqual(["2026: 10 Tage beantragt, aber nur 5 Resttage."]);
  });

  it("rechnet über den Jahreswechsel je Jahr getrennt", () => {
    // 2026 sind noch 5 Tage frei, der Antrag braucht 4 in 2026 und 4 in 2027: keine Warnung
    expect(pruefeUrlaub({ userId: "u1", von: "2026-12-28", bis: "2027-01-08" }, taken, anspruch, HEUTE)).toEqual({ werktage: 8, fehler: [], warnungen: [] });
    const full = [a({ von: "2026-01-12", bis: "2026-02-20" })]; // 30 Tage genommen
    expect(pruefeUrlaub({ userId: "u1", von: "2026-12-28", bis: "2027-01-08" }, full, anspruch, HEUTE).warnungen).toEqual(["2026: 4 Tage beantragt, aber nur 0 Resttage."]);
  });
});

describe("Krankmeldung", () => {
  it("kennt weder Notiz noch Diagnose: die Eingabe hat dafür kein Feld", () => {
    const eingabe: Parameters<typeof pruefeKrank>[0] = { userId: "u1", von: HEUTE, bis: null };
    expect(Object.keys(eingabe).sort()).toEqual(["bis", "userId", "von"]);
  });

  it("ist ohne Ende gültig, mit Ende vor Beginn nicht", () => {
    expect(pruefeKrank({ userId: "u1", von: HEUTE, bis: null }, [], HEUTE)).toEqual([]);
    expect(pruefeKrank({ userId: "u1", von: HEUTE, bis: "2026-10-12" }, [], HEUTE)).toEqual(["Das Ende liegt vor dem Beginn."]);
    expect(pruefeKrank({ userId: "u1", von: "", bis: null }, [], HEUTE)).toHaveLength(1);
  });

  it("darf sich nicht mit eigenem Urlaub überschneiden; beim Nachtragen des Endes zählt sie selbst nicht", () => {
    const rows = [a({ von: "2026-10-12", bis: "2026-10-16" }), a({ id: "k", art: "krank", von: "2026-10-05", bis: null, werktage: null })];
    expect(pruefeKrank({ userId: "u1", von: "2026-10-16", bis: null }, [rows[0]], HEUTE)[0]).toMatch(/überschneidet/);
    expect(pruefeKrank({ userId: "u1", von: "2026-10-05", bis: "2026-10-09" }, rows, HEUTE, "k")).toEqual([]);
  });
});

describe("Selbst-Genehmigung verboten", () => {
  const offen = a({ userId: "u1", status: "offen" });

  it("ein Admin entscheidet fremde Anträge, nie den eigenen", () => {
    expect(darfEntscheiden({ id: "admin", role: "admin" }, offen)).toBe(true);
    expect(darfEntscheiden({ id: "u1", role: "admin" }, offen)).toBe(false);
  });

  it("Mitarbeiter und Freiberufler entscheiden nichts; entschiedene Anträge und Krankmeldungen sind nicht entscheidbar", () => {
    expect(darfEntscheiden({ id: "u2", role: "mitarbeiter" }, offen)).toBe(false);
    expect(darfEntscheiden({ id: "u3", role: "freiberufler" }, offen)).toBe(false);
    expect(darfEntscheiden({ id: null, role: "admin" }, offen)).toBe(false);
    expect(darfEntscheiden({ id: "admin", role: "admin" }, a({ status: "genehmigt" }))).toBe(false);
    expect(darfEntscheiden({ id: "admin", role: "admin" }, a({ art: "krank", status: "genehmigt" }))).toBe(false);
  });
});
