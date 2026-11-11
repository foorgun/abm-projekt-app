import { describe, expect, it } from "vitest";
import { antwortLesen, cacheSchluessel, demoVersorger, frage, kontaktAusVorschlag, kostenEur, parseAnfrage, versorgerAnfrage } from "./versorger";

const BAUORT = { strasse: "Am Hölzle 12", plzOrt: "89134 Blaustein", gemarkung: "Bermaringen", ortsteil: "Bermaringen", flurstueck: null, bundesland: "Baden-Württemberg" };

describe("Versorger-Suche: Anfrage", () => {
  it("nimmt PLZ, Ort, Ortsteil und Bundesland aus dem Bauort, nie die Straße", () => {
    const { anfrage } = versorgerAnfrage(BAUORT);
    expect(anfrage).toEqual({ plz: "89134", ort: "Blaustein", ortsteil: "Bermaringen", bundesland: "Baden-Württemberg" });
    const text = frage(anfrage!);
    expect(text).toContain("PLZ 89134, Blaustein, Ortsteil Bermaringen, Baden-Württemberg");
    expect(text).not.toContain("Hölzle");
  });
  it("teilt „Ulm-Söflingen“ in Ort und Ortsteil, wenn kein Ortsteil eingetragen ist", () => {
    expect(versorgerAnfrage({ ...BAUORT, plzOrt: "89077 Ulm-Söflingen", ortsteil: null }).anfrage).toMatchObject({ ort: "Ulm", ortsteil: "Söflingen" });
  });
  it("ohne PLZ oder Ort: keine Anfrage, sondern ein Hinweis", () => {
    expect(versorgerAnfrage({ ...BAUORT, plzOrt: null })).toEqual({ anfrage: null, fehlt: "PLZ und Ort des Bauorts fehlen." });
    expect(versorgerAnfrage({ ...BAUORT, plzOrt: "Blaustein" }).anfrage).toBeNull();
  });
  it("prüft den Aufruf in der Funktion", () => {
    expect(parseAnfrage({ plz: "89134", ort: " Blaustein " })).toEqual({ ok: true, anfrage: { plz: "89134", ort: "Blaustein", ortsteil: null, bundesland: null } });
    expect(parseAnfrage({ plz: "891", ort: "Blaustein" }).ok).toBe(false);
    expect(parseAnfrage({ plz: "89134" }).ok).toBe(false);
    expect(parseAnfrage(null).ok).toBe(false);
  });
  it("Zwischenspeicher-Schlüssel: PLZ, Ort und Ortsteil ohne Schreibvarianten", () => {
    expect(cacheSchluessel({ plz: "89077", ort: "Ulm", ortsteil: "Söflingen", bundesland: null })).toBe("89077|ulm|söflingen");
    expect(cacheSchluessel({ plz: "89077", ort: " ULM ", ortsteil: null, bundesland: "BW" })).toBe("89077|ulm|");
    expect(cacheSchluessel({ plz: "73525", ort: "Schwäbisch Gmünd", ortsteil: null, bundesland: null })).toBe("73525|schwäbischgmünd|");
  });
  it("Kosten: Tokens plus Websuchen", () => {
    expect(kostenEur("claude-sonnet-5-5", 100_000, 10_000, 5)).toBe(0.35);
  });
});

describe("Versorger-Suche: Antwort lesen", () => {
  it("liest das JSON auch mit Text oder Codeblock drumherum und prüft jedes Feld", () => {
    const text = `Hier das Ergebnis:\n\`\`\`json\n${JSON.stringify({
      bauamt: { name: "Landratsamt Alb-Donau-Kreis, Baurechtsamt", anschrift: "Schillerstraße 30, 89077 Ulm", tel: "0731 185-0", email: "info@example.de", quelle: "https://example.de/bauen", sicherheit: "hoch", hinweis: "Blaustein hat keine eigene Baurechtsbehörde." },
      wasser: { name: "Stadtwerke", tel: "keine", email: "kaputt", quelle: "example.de", sicherheit: "sehr hoch" },
      abwasser: null,
      strom: { name: "" },
    })}\n\`\`\``;
    const v = antwortLesen(text)!;
    expect(v.bauamt).toEqual({ name: "Landratsamt Alb-Donau-Kreis, Baurechtsamt", anschrift: "Schillerstraße 30, 89077 Ulm", tel: "0731 185-0", email: "info@example.de", quelle: "https://example.de/bauen", sicherheit: "hoch", hinweis: "Blaustein hat keine eigene Baurechtsbehörde." });
    // ungültige Angaben werden leer statt übernommen, unbekannte Sicherheit gilt als niedrig
    expect(v.wasser).toEqual({ name: "Stadtwerke", anschrift: null, tel: null, email: null, quelle: null, sicherheit: "niedrig", hinweis: null });
    expect(v.abwasser).toBeUndefined();
    expect(v.strom).toBeUndefined();
  });
  it("nicht lesbar: null", () => {
    expect(antwortLesen("Ich konnte nichts finden.")).toBeNull();
    expect(antwortLesen("{kaputt")).toBeNull();
    expect(antwortLesen("[1, 2]")).toBeNull();
  });
  it("Übernahme ins Formular und Demo-Antwort", () => {
    const demo = demoVersorger({ plz: "89134", ort: "Blaustein", ortsteil: null, bundesland: null });
    expect(Object.keys(demo.vorschlaege).sort()).toEqual(["abwasser", "bauamt", "strom", "wasser"]);
    expect(kontaktAusVorschlag(demo.vorschlaege.bauamt!)).toEqual({ name: "Stadt Blaustein, Bauordnungsamt (Demo)", address: "Rathausplatz 1, 89134 Blaustein", phone: "0731 0000000", mobile: "", email: "bauordnung@demo.example", fax: "" });
  });
});
