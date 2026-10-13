import { describe, expect, it } from "vitest";
import { ueberschneidungen } from "../lib/abwesenheit/urlaub";
import { werktage } from "../lib/abwesenheit/werktage";
import { absencePatterns, absenceSeedRows, absenceSeedSql, buildDemoAbsences, DEMO_ME, DEMO_STAFF } from "./demoAbwesenheit";

const HEUTE = "2026-10-13";

describe("Demo-Daten Urlaub und Krankheit", () => {
  const { abwesenheiten, urlaubsAnspruch } = buildDemoAbsences(HEUTE);

  it("hat Anträge in allen vier Stati und genau eine Krankmeldung ohne Notiz", () => {
    const urlaub = abwesenheiten.filter((a) => a.art === "urlaub");
    expect(new Set(urlaub.map((a) => a.status))).toEqual(new Set(["offen", "genehmigt", "abgelehnt", "zurueckgezogen"]));
    const krank = abwesenheiten.filter((a) => a.art === "krank");
    expect(krank).toHaveLength(1);
    expect(krank[0]).toMatchObject({ status: "genehmigt", notiz: null, werktage: null, bis: null, entscheidungVon: null, ablehnGrund: null });
    expect(new Set(abwesenheiten.map((a) => a.userId)).size).toBeGreaterThanOrEqual(3);
  });

  it("jeder Urlaub hat Werktage wie berechnet und mindestens einen", () => {
    for (const a of abwesenheiten.filter((x) => x.art === "urlaub")) {
      expect(a.werktage, a.id).toBe(werktage(a.von, a.bis!));
      expect(a.werktage!).toBeGreaterThan(0);
    }
  });

  it("niemand hat den eigenen Antrag entschieden, und eigene Einträge überschneiden sich nicht", () => {
    for (const p of absencePatterns(HEUTE)) if (p.entscheider !== null) expect(p.entscheider, `${p.person} ${p.von}`).not.toBe(p.person);
    for (const a of abwesenheiten.filter((x) => x.status === "offen" || x.status === "genehmigt")) {
      expect(ueberschneidungen(a.userId, a.von, a.bis ?? a.von, abwesenheiten, HEUTE, a.id), a.id).toEqual([]);
    }
  });

  it("der offene Antrag der Mitarbeiterin überschneidet sich mit dem Urlaub eines Kollegen (Hinweis beim Genehmigen)", () => {
    const offen = abwesenheiten.find((a) => a.userId === DEMO_ME.mitarbeiter && a.status === "offen")!;
    expect(abwesenheiten.some((a) => a.userId !== offen.userId && a.status === "genehmigt" && a.von <= offen.bis! && a.bis! >= offen.von)).toBe(true);
  });

  it("gibt jeder Person 30 Tage für Vorjahr, laufendes und nächstes Jahr", () => {
    expect(urlaubsAnspruch).toHaveLength(DEMO_STAFF.length * 3);
    expect(urlaubsAnspruch.every((a) => a.tage === 30)).toBe(true);
  });

  it("ist zu jedem Datum gültig (auch über den Jahreswechsel)", () => {
    for (const heute of ["2026-01-02", "2026-12-30", "2027-06-15"]) {
      const d = buildDemoAbsences(heute).abwesenheiten;
      expect(d.filter((a) => a.art === "urlaub").every((a) => a.werktage! > 0 && a.bis! >= a.von), heute).toBe(true);
    }
  });
});

describe("Demo-Abwesenheiten für die echte Datenbank", () => {
  it("hängt an vorhandenen Konten, trägt is_demo und lässt nie die Person selbst entscheiden", () => {
    const rows = absenceSeedRows(["a1", "a2", "m1", "m2"], HEUTE);
    expect(rows).toHaveLength(absencePatterns(HEUTE).length);
    expect(rows.every((r) => r.is_demo === true)).toBe(true);
    for (const r of rows) {
      if (r.art === "krank") expect(r).toMatchObject({ notiz: null, entscheidung_von: null, status: "genehmigt" });
      if (r.entscheidung_von) expect(r.entscheidung_von).not.toBe(r.user_id);
      if (r.status === "offen" || r.status === "zurueckgezogen") expect(r.entscheidung_von).toBeNull();
    }
  });

  it("kommt mit weniger Konten zurecht: Muster ohne Person entfallen, entschieden hat eine andere vorhandene Person", () => {
    const two = absenceSeedRows(["a1", "a2"], HEUTE);
    expect(two.length).toBeGreaterThan(0);
    expect(two.every((r) => ["a1", "a2"].includes(r.user_id as string))).toBe(true);
    expect(two.every((r) => !r.entscheidung_von || r.entscheidung_von !== r.user_id)).toBe(true);
    expect(absenceSeedRows([], HEUTE)).toEqual([]);
    // ein einziges Konto: genehmigte Demo-Anträge hätten niemanden, der entschieden hat
    expect(absenceSeedRows(["a1"], HEUTE).every((r) => r.entscheidung_von === null)).toBe(true);
  });

  it("das SQL fügt nur über vorhandene Konten ein und markiert alles als Demo", () => {
    const sql = absenceSeedSql(HEUTE);
    expect(sql).toContain("from public.user_roles where role in ('admin', 'mitarbeiter')");
    expect(sql).toMatch(/v\.grund, true\nfrom v join staff s/);
    expect(sql).not.toMatch(/drop |delete |update /i);
  });
});
