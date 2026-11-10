import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  adressSchluessel,
  analysieren,
  anfrageAusProjekt,
  ausnahmeTrifft,
  CACHE_TAGE,
  erdbebenZone,
  featureInfoLesen,
  featureInfoUrl,
  gemeindeFinden,
  laermBwLesen,
  laermBwUrl,
  nameGleich,
  parseProjektId,
  pegelLesen,
  photonLesen,
  radonvorsorgegebiet,
  schneelastZone,
  strasseTeilen,
  tagesbeginn,
  trefferGuete,
  wasserschutzZone,
  type Anfrage,
  type Dienste,
  type Tabellen,
} from "../../../supabase/functions/standort-analyse/logic";
import { GEMEINDEN } from "../../../supabase/functions/standort-analyse/gemeinden";
import { ERDBEBEN, ERDBEBEN_BY_KREISE, SCHNEELAST } from "../../../supabase/functions/standort-analyse/zonen";
import { demoStandort, uebernahme, zeilenAus, type Ergebnis } from "./standort";
import { ANKREUZ, ankreuzWerte } from "./zuordnung";

const TAB: Tabellen = { SCHNEELAST, ERDBEBEN, ERDBEBEN_BY_KREISE, GEMEINDEN };

// ---------------------------------------------------------------------------
// Zuordnung mit bekannten Orten (Werte aus den Tabellen des DIBt)
// ---------------------------------------------------------------------------

describe("Schneelastzone", () => {
  it.each([
    ["Dornstadt, Alb-Donau-Kreis: namentlich in Zone 1a", "BW", "08425031", "Dornstadt", "1a"],
    ["Laichingen, Alb-Donau-Kreis: namentlich in Zone 2", "BW", "08425072", "Laichingen", "2"],
    ["Ehingen, Alb-Donau-Kreis: Regelzone 1", "BW", "08425033", "Ehingen (Donau)", "1"],
    ["Stuttgart: Stadtkreis", "BW", "08111000", "Stuttgart", "2"],
    ["Heidelberg: Stadtkreis", "BW", "08221000", "Heidelberg", "1"],
    ["Isny: Kurzform der Tabelle", "BW", "08436049", "Isny im Allgäu", "3"],
    ["Altheim (Alb): namentlich in Zone 2", "BW", "08425005", "Altheim (Alb)", "2"],
    ["Altheim: Regelzone 1, nicht die Ausnahme „Altheim (Alb)“", "BW", "08425004", "Altheim", "1"],
    ["Kißlegg: in der Tabelle „Kißleg“ geschrieben", "BW", "08436052", "Kißlegg", "3"],
    ["Vogtsburg: letzter Name der Breisgau-Liste", "BW", "08315133", "Vogtsburg im Kaiserstuhl", "2"],
    ["Hinterzarten: Regelzone 2a im Breisgau-Hochschwarzwald", "BW", "08315052", "Hinterzarten", "2a"],
    ["Wangen: „i. Allgäu“ in der Tabelle", "BW", "08436081", "Wangen im Allgäu", "3"],
    ["München: eigene Zeile", "BY", "09162000", "München", "1a"],
    ["Wunsiedel: Kreis „alle“", "BY", "09479169", "Wunsiedel", "3"],
    ["Geiselhöring: Ausnahme im Kreis Straubing-Bogen", "BY", "09278129", "Geiselhöring", "1a"],
    ["Bogen: Regelzone im Kreis Straubing-Bogen", "BY", "09278118", "Bogen", "2"],
    ["Frankfurt am Main", "HE", "06412000", "Frankfurt am Main", "1"],
    ["Dillenburg: Ausnahme im Lahn-Dill-Kreis", "HE", "06532006", "Dillenburg", "2a"],
    ["Wetzlar: Regelzone im Lahn-Dill-Kreis", "HE", "06532023", "Wetzlar", "2"],
  ] as const)("%s", (_, land, ags, name, zone) => {
    expect(schneelastZone(TAB, land, ags, name)).toEqual({ zone });
  });

  it("nennt die Tabelle den Kreis nicht (Stadtkreis Ulm), wird nicht geraten", () => {
    const z = schneelastZone(TAB, "BW", "08421000", "Ulm");
    expect(z.zone).toBeNull();
    expect("grund" in z && z.grund).toMatch(/nennt diese Gemeinde/);
  });

  it("Gemeinde, die nur teilweise in einer Zone liegt, ist unsicher", () => {
    const z = schneelastZone(TAB, "BW", "08417045", "Meßstetten");
    expect(z.zone).toBe("1");
    expect("unsicher" in z && z.unsicher).toMatch(/nur für Teile/);
  });

  it("Namensvergleich: Schreibweisen ja, fremde Namen nein", () => {
    expect(nameGleich("Rot a. d. Rot", "Rot an der Rot")).toBe(true);
    expect(nameGleich("Lahr", "Lahr/Schwarzwald")).toBe(true);
    expect(nameGleich("Breisach a. Rhein", "Breisach am Rhein")).toBe(true);
    expect(nameGleich("Au", "Aulendorf")).toBe(false);
    expect(nameGleich("Lauf", "Lauffen am Neckar")).toBe(false);
  });
});

describe("Erdbebenzone", () => {
  it("Baden-Württemberg: keine Tabelle, nicht ermittelbar mit Grund", () => {
    const z = erdbebenZone(TAB, "BW", "08425031", null);
    expect(z.zone).toBeNull();
    expect("grund" in z && z.grund).toMatch(/1:350 000/);
  });

  it("München: Kreiszeile, außerhalb der Zonen", () => {
    expect(erdbebenZone(TAB, "BY", "09162000", null)).toEqual({ zone: "keine" });
  });

  it("Frankfurt: je Gemarkung verschieden, ohne Gemarkung wird nicht geraten", () => {
    const z = erdbebenZone(TAB, "HE", "06412000", null);
    expect(z.zone).toBeNull();
    expect("grund" in z && z.grund).toMatch(/Zone 0, Zone 1/);
    expect(erdbebenZone(TAB, "HE", "06412000", "Griesheim")).toEqual({ zone: "1" });
    expect(erdbebenZone(TAB, "HE", "06412000", "Bockenheim")).toEqual({ zone: "0" });
    expect(erdbebenZone(TAB, "HE", "06412000", "Gibtsnicht").zone).toBeNull();
  });

  it("Gemeinde, die nicht in der Tabelle steht, wird nicht als „keine Zone“ gedeutet", () => {
    expect(erdbebenZone(TAB, "HE", "06999999", null).zone).toBeNull();
    expect(erdbebenZone(TAB, "BY", "09999999", null).zone).toBeNull();
  });
});

describe("Gemeinde aus dem amtlichen Verzeichnis", () => {
  it.each([
    ["Ulm", "BW", 48.3985, 9.9925, "08421000"],
    ["Dornstadt", "BW", 48.463, 9.961, "08425031"],
    ["Ehingen (Donau)", "BW", 48.283, 9.725, "08425033"],
    ["München", "BY", 48.137, 11.575, "09162000"],
    ["Frankfurt am Main", "HE", 50.11, 8.68, "06412000"],
    ["Wunsiedel", "BY", 50.039, 11.999, "09479169"],
  ] as const)("%s", (name, land, lat, lon, ags) => {
    expect(gemeindeFinden(TAB, land, [name], lat, lon)?.ags).toBe(ags);
  });

  it("gleichnamige Gemeinden: die nächstgelegene; zu weit weg: keine", () => {
    // Mehrere Gemeinden namens Neustadt-… bzw. Burgau gibt es; Altheim dreimal in BW (Alb-Donau-Kreis, Biberach)
    const altheim = GEMEINDEN.BW.filter((g) => g[1] === "Altheim");
    expect(altheim.length).toBeGreaterThan(1);
    for (const g of altheim) expect(gemeindeFinden(TAB, "BW", ["Altheim"], g[2], g[3])?.ags).toBe(g[0]);
    expect(gemeindeFinden(TAB, "BW", ["Ulm"], 47.6, 7.8)).toBeNull();
  });

  it("unbekannter Name oder mehrdeutige Kurzform: kein Treffer, kein Raten", () => {
    expect(gemeindeFinden(TAB, "BW", ["Gibtsnichthausen"], 48.4, 10)).toBeNull();
    expect(gemeindeFinden(TAB, "BW", [null, ""], 48.4, 10)).toBeNull();
    // "Bad" wäre der Anfang vieler Gemeinden
    expect(gemeindeFinden(TAB, "BW", ["Bad"], 48.4, 10)).toBeNull();
  });

  it("zweiter Name greift, wenn der erste nicht im Verzeichnis steht (z. B. Ortsteil)", () => {
    expect(gemeindeFinden(TAB, "BW", ["Gibtsnichthausen", "Dornstadt"], 48.463, 9.961)?.ags).toBe("08425031");
  });

  it("jede namentliche Ausnahme der Schneelast-Tabelle trifft genau eine Gemeinde ihres Kreises (sonst fiele sie still auf die Regelzone)", () => {
    const fehlt: string[] = [];
    for (const land of ["BW", "BY", "HE"] as const) {
      for (const [kreis, k] of Object.entries(SCHNEELAST[land].kreise)) {
        // ohne gemeindefreie Gebiete (Schlüssel ab 9xx), die teils so heißen wie die Nachbargemeinde
        const gemeinden = GEMEINDEN[land].filter((g) => g[0].startsWith(kreis) && g[0][5] !== "9");
        for (const a of k.ausnahmen) if (gemeinden.filter((g) => ausnahmeTrifft(a.name, g[1])).length !== 1) fehlt.push(`${land} ${k.name}: ${a.name}`);
      }
    }
    expect(fehlt).toEqual([]);
  });

  it("jede Gemeinde bekommt eine Schneelastzone, außer Ulm und Kassel (fehlen in der Tabelle)", () => {
    const ohne = (["BW", "BY", "HE"] as const).flatMap((land) => GEMEINDEN[land].filter((g) => schneelastZone(TAB, land, g[0], g[1]).zone === null).map((g) => g[1]));
    expect(ohne.sort()).toEqual(["Kassel", "Ulm"]);
  });

  it("Hanau ist seit 2026 kreisfrei und steht unter dem alten Schlüssel in den Tabellen", () => {
    expect(schneelastZone(TAB, "HE", "06415000", "Hanau")).toEqual({ zone: "1" });
  });
});

describe("Adresssuche: Treffer prüfen", () => {
  const anfrage = (strasse: string): Anfrage => ({ land: "BW", strasse, plz: "88212", ort: "Ravensburg", gemarkung: null });
  const t = (strasse: string | null, hausnummer: string | null) => ({ lat: 47.78, lon: 9.61, strasse, hausnummer, plz: "88212", ort: "Ravensburg", land: "DE", bundesland: "Baden-Württemberg" });

  it("Straße und Nummer zerlegen", () => {
    expect(strasseTeilen("Hauptstr. 12 a")).toEqual({ strasse: "hauptstrasse", nummer: "12a" });
    expect(strasseTeilen("Am Bach 3/1")).toEqual({ strasse: "am bach", nummer: "3/1" });
    expect(strasseTeilen("Baugebiet Lerchenfeld")).toEqual({ strasse: "baugebiet lerchenfeld", nummer: null });
  });

  it("nur passende Treffer zählen (Photon sucht unscharf)", () => {
    expect(trefferGuete(t("Marktplatz", "1"), anfrage("Marktplatz 1"))).toBe("haus");
    expect(trefferGuete(t("Hauptstraße", "12a"), anfrage("Hauptstr. 12 a"))).toBe("haus");
    // Beides aus dem echten Test: andere Straße mit gleicher Nummer, gleiche Straße mit anderer Nummer
    expect(trefferGuete(t("Leonhardstraße", "1"), anfrage("Marktplatz 1"))).toBeNull();
    expect(trefferGuete(t("Hauptstraße", "50/1"), anfrage("Hauptstraße 1"))).toBe("strasse");
    expect(trefferGuete(t(null, null), anfrage("Marktplatz 1"))).toBeNull();
  });
});

describe("Radon und Wasserschutzzonen", () => {
  it("Radonvorsorgegebiete nach Allgemeinverfügung", () => {
    expect(radonvorsorgegebiet("BW", "08336087")).toBe(true); // Todtnau
    expect(radonvorsorgegebiet("BW", "08421000")).toBe(false); // Ulm
    expect(radonvorsorgegebiet("BY", "09479169")).toBe(true); // Kreis Wunsiedel
    expect(radonvorsorgegebiet("BY", "09162000")).toBe(false);
    expect(radonvorsorgegebiet("HE", "06412000")).toBe(false);
  });

  it.each([
    ["Schutzzone IIIA", "3"],
    ["Zone III und IIIA", "3"],
    ["Schutzzone II", "2"],
    ["Zone I", "1"],
    ["Zone I und II", null],
    ["", null],
  ])("%s → %s", (text, zone) => expect(wasserschutzZone(text)).toBe(zone));
});

// ---------------------------------------------------------------------------
// Antworten der Dienste lesen
// ---------------------------------------------------------------------------

describe("Dienste lesen", () => {
  it("Karten: Treffer, kein Treffer und Fehlerseite sind verschieden", () => {
    const xml = `<?xml version="1.0"?><FeatureInfoResponse xmlns="http://www.esri.com/wms"><FIELDS Gebietsname="Valley &amp; Co" Status="festgesetzt"></FIELDS></FeatureInfoResponse>`;
    expect(featureInfoLesen(xml)).toEqual([{ Gebietsname: "Valley & Co", Status: "festgesetzt" }]);
    expect(featureInfoLesen(`<FeatureInfoResponse xmlns="x"></FeatureInfoResponse>`)).toEqual([]);
    expect(featureInfoLesen("<html><h1>Error occurred while processing request</h1></html>")).toBeNull();
  });

  it("Abfrage am Punkt: mittleres Pixel, Koordinaten in der richtigen Reihenfolge", () => {
    const u = new URL(featureInfoUrl("https://x.example/wms", "twsg", 47.86, 11.77));
    expect(u.searchParams.get("BBOX")).toBe("11.769500,47.859500,11.770500,47.860500");
    expect(u.searchParams.get("X")).toBe("50");
    expect(u.searchParams.get("QUERY_LAYERS")).toBe("twsg");
  });

  it("Lärmpegel: Rasterwert oder nichts", () => {
    expect(pegelLesen({ "Classify.PixelValue": "64.656998" })).toBeCloseTo(64.657);
    expect(pegelLesen({ "Classify.Pixelwert": "74.41" })).toBeCloseTo(74.41);
    expect(pegelLesen({ "Classify.PixelValue": "NoData" })).toBeNull();
    expect(pegelLesen(undefined)).toBeNull();
  });

  it("Lärm BW: höchste LDEN-Stufe am Punkt, keine Fläche, Fehlerseite", () => {
    const f = (...a: [number, number][]) => JSON.stringify({ features: a.map(([lo, hi]) => ({ attributes: { ART: "Lden", DB_LOW: lo, DB_HIGH: hi } })) });
    expect(laermBwLesen(f([55, 60]))).toEqual({ von: 55, bis: 60 });
    expect(laermBwLesen(f([55, 60], [65, 70]))).toEqual({ von: 65, bis: 70 });
    expect(laermBwLesen(f())).toBeNull();
    expect(laermBwLesen('{"error":{"code":400}}')).toBeUndefined();
    expect(laermBwLesen("<html>Fehler</html>")).toBeUndefined();
    const u = new URL(laermBwUrl(48.4, 9.99));
    expect(u.hostname).toBe("rips-gdi.lubw.baden-wuerttemberg.de");
    expect(u.searchParams.get("geometry")).toBe("9.99,48.4");
    expect(u.searchParams.get("inSR")).toBe("4326");
  });

  it("Photon: Felder lesen, Unlesbares ist kein leeres Ergebnis", () => {
    const roh = JSON.stringify({ features: [{ geometry: { coordinates: [9.99, 48.39] }, properties: { housenumber: "1", street: "Münsterplatz", postcode: "89073", city: "Ulm", countrycode: "DE", state: "Baden-Württemberg" } }] });
    expect(photonLesen(roh)).toEqual([{ lat: 48.39, lon: 9.99, hausnummer: "1", strasse: "Münsterplatz", plz: "89073", ort: "Ulm", land: "DE", bundesland: "Baden-Württemberg" }]);
    expect(photonLesen('{"features":[]}')).toEqual([]);
    expect(photonLesen("<html>Fehler</html>")).toBeNull();
    expect(photonLesen("{}")).toBeNull();
  });

  it("Projekt-ID wird vor jeder Abfrage geprüft", () => {
    expect(parseProjektId({ projectId: "A0000000-0000-4000-8000-000000000001" })).toBe("a0000000-0000-4000-8000-000000000001");
    expect(parseProjektId({ projectId: "x" })).toBeNull();
    expect(parseProjektId(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adresse aus dem Projekt
// ---------------------------------------------------------------------------

describe("Adresse aus dem Projekt", () => {
  it("nimmt den getrennten Bauort vor der Bauadresse und das Kürzel am Projekt", () => {
    const { anfrage } = anfrageAusProjekt({ bundesland: "bw", siteStreet: "Am Bach 3", sitePostalCode: "89073", siteCity: "Ulm", buildingAddress: "Andere Straße 1, 70173 Stuttgart" });
    expect(anfrage).toEqual({ land: "BW", strasse: "Am Bach 3", plz: "89073", ort: "Ulm", gemarkung: null });
  });

  it("teilt die einzeilige Bauadresse auf, nimmt sonst das Feld Bauort", () => {
    expect(anfrageAusProjekt({ bundesland: "BY", buildingAddress: "Hauptstr. 12a, 80331 München" }).anfrage).toMatchObject({ strasse: "Hauptstr. 12a", plz: "80331", ort: "München" });
    expect(anfrageAusProjekt({ bundesland: "BY", location: "80331 München" }).anfrage).toMatchObject({ strasse: null, plz: "80331", ort: "München" });
  });

  it("ein Flurstück ist keine Straße", () => {
    expect(anfrageAusProjekt({ bundesland: "BW", buildingAddress: "Flst. 123/4, 89073 Ulm" }).anfrage).toMatchObject({ strasse: null, plz: "89073" });
  });

  it("Bundesland aus dem Freitext beim Bauort", () => {
    expect(anfrageAusProjekt({ siteState: "Baden-Württemberg", siteCity: "Ulm" }).anfrage?.land).toBe("BW");
  });

  it("die Eingabe kennt keine Anschrift des Bauherrn", () => {
    // Bewusst kein Feld dafür: die Funktion liest nur site_* und building_address
    const { anfrage } = anfrageAusProjekt({ bundesland: "BW", siteCity: "Ulm", address: "Privatweg 9, 12345 Woanders" } as Parameters<typeof anfrageAusProjekt>[0]);
    expect(JSON.stringify(anfrage)).not.toMatch(/Privatweg|Woanders/);
  });

  it("nennt konkret, was fehlt", () => {
    const { fehler } = anfrageAusProjekt({});
    expect(fehler?.code).toBe("fehlende_angaben");
    expect(fehler?.fehlt).toHaveLength(2);
    expect(fehler?.fehlt?.[0]).toMatch(/Bundesland/);
    expect(fehler?.fehlt?.[1]).toMatch(/Bauort/);
    expect(anfrageAusProjekt({ bundesland: "BW" }).fehler?.fehlt).toEqual([expect.stringMatching(/Bauort/)]);
    expect(anfrageAusProjekt({ siteCity: "Ulm" }).fehler?.fehlt).toEqual([expect.stringMatching(/Bundesland/)]);
    expect(anfrageAusProjekt({ bundesland: "BW", sitePostalCode: "890", siteCity: "Ulm" }).fehler?.fehlt?.[0]).toMatch(/nicht fünfstellig/);
  });

  it("anderes Bundesland: klare Meldung", () => {
    const { fehler, anfrage } = anfrageAusProjekt({ bundesland: "NW", siteCity: "Köln" });
    expect(anfrage).toBeNull();
    expect(fehler?.code).toBe("bundesland_nicht_unterstuetzt");
    expect(fehler?.message).toMatch(/noch nicht verfügbar/);
  });
});

// ---------------------------------------------------------------------------
// Ablauf: Cache, Limit, Fehler
// ---------------------------------------------------------------------------

const JETZT = new Date("2026-11-01T10:00:00.000Z");
const WSG = `<FeatureInfoResponse xmlns="x"><FIELDS Gebietsname="Musterried" Status="festgesetzt"></FIELDS></FeatureInfoResponse>`;
const LEER = `<FeatureInfoResponse xmlns="x"></FeatureInfoResponse>`;
const photon = (p: Record<string, string>, lat = 48.137, lon = 11.575) => JSON.stringify({ features: [{ geometry: { coordinates: [lon, lat] }, properties: { countrycode: "DE", state: "Bayern", city: "München", postcode: "80331", ...p } }] });
const ANTWORT_SUCHE = photon({ housenumber: "8", street: "Marienplatz" });

function antworten(url: string): string {
  if (url.includes("photon.komoot")) return ANTWORT_SUCHE;
  if (url.includes("opentopodata")) return JSON.stringify({ status: "OK", results: [{ elevation: 519.4 }] });
  if (url.includes("imis.bfs.de")) return JSON.stringify({ features: [{ properties: { rn_max: 93.5 } }] });
  if (url.includes("wasser/wsg")) return WSG;
  if (url.includes("mroadbylden2022")) return `<FeatureInfoResponse xmlns="x"><FIELDS Classify.PixelValue="64.6"></FIELDS></FeatureInfoResponse>`;
  return LEER;
}

function aufbau(holen: (url: string) => string | Promise<string> = antworten, limitFrei = true) {
  const cache = new Map<string, { wert: unknown; abgerufenAm: string; gueltigBis: string; thema: string }>();
  const hol = vi.fn(async (url: string) => holen(url));
  const limit = vi.fn(async () => limitFrei);
  const d: Dienste = {
    jetzt: () => JETZT,
    warten: async () => {},
    holen: hol,
    async cacheLesen(k, jetzt) {
      return new Map(k.filter((x) => cache.has(x) && new Date(cache.get(x)!.gueltigBis) > jetzt).map((x) => [x, cache.get(x)!]));
    },
    async cacheSchreiben(x) {
      cache.set(x.schluessel, x);
    },
    limitZaehlen: limit,
    tabellen: TAB,
  };
  return { d, cache, hol, limit };
}

const ANFRAGE: Anfrage = { land: "BY", strasse: "Marienplatz 8", plz: "80331", ort: "München", gemarkung: null };
const ergebnis = async (a: Anfrage, d: Dienste) => {
  const r = await analysieren(a, d);
  if (!r.ok) throw new Error(r.message);
  return { r, von: (t: string) => r.ergebnisse.find((e) => e.thema === t)! };
};

describe("Analyse", () => {
  it("liefert je Thema Wert, Quelle, Abrufdatum und Status", async () => {
    const { d } = aufbau();
    const { r, von } = await ergebnis(ANFRAGE, d);
    expect(r).toMatchObject({ gemeinde: "München", genauigkeit: "haus", bundesland: "BY" });
    expect(r.ergebnisse.map((e) => e.thema)).toEqual(["schneelast", "erdbeben", "hoehe", "radon", "wasserschutz", "hochwasser", "laerm", "strom"]);
    expect(von("schneelast")).toMatchObject({ status: "ermittelt", wert: "1a", abgerufenAm: JETZT.toISOString() });
    expect(von("schneelast").quelle).toMatch(/DIBt/);
    expect(von("erdbeben")).toMatchObject({ wert: "keine" });
    expect(von("hoehe")).toMatchObject({ wert: "519 m" });
    expect(von("radon")).toMatchObject({ wert: "nein" });
    expect(von("radon").hinweis).toMatch(/93,5 kBq/);
    expect(von("wasserschutz")).toMatchObject({ wert: "gebiet", anzeige: "Wasserschutzgebiet Musterried" });
    expect(von("hochwasser")).toMatchObject({ wert: "nein" });
    expect(von("laerm").anzeige).toBe("Straße: LDEN 65 dB(A)");
    expect(von("strom")).toMatchObject({ status: "nicht_ermittelbar", wert: null, viewer: expect.stringContaining("marktstammdatenregister") });
  });

  it("zweite Analyse: nichts geht hinaus, Limit zählt nicht, Datum bleibt das erste", async () => {
    const { d, hol, limit } = aufbau();
    await ergebnis(ANFRAGE, d);
    expect(limit).toHaveBeenCalledTimes(1);
    const n = hol.mock.calls.length;
    const spaeter: Dienste = { ...d, jetzt: () => new Date(JETZT.getTime() + 24 * 3600 * 1000) };
    const { von } = await ergebnis(ANFRAGE, spaeter);
    expect(hol.mock.calls.length).toBe(n);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(von("wasserschutz").abgerufenAm).toBe(JETZT.toISOString());
  });

  it("Fristen je Thema: Zonen lange, Karten Wochen; danach wird neu abgefragt", async () => {
    expect(CACHE_TAGE.schneelast).toBeGreaterThan(CACHE_TAGE.laerm);
    expect(CACHE_TAGE.wasserschutz).toBeLessThanOrEqual(30);
    const { d, cache, hol } = aufbau();
    await ergebnis(ANFRAGE, d);
    const eintrag = (t: string) => [...cache.values()].find((x) => x.thema === t)!;
    const tage = (t: string) => Math.round((new Date(eintrag(t).gueltigBis).getTime() - JETZT.getTime()) / 86400000);
    expect(tage("schneelast")).toBe(365);
    expect(tage("wasserschutz")).toBe(28);
    const n = hol.mock.calls.length;
    await ergebnis(ANFRAGE, { ...d, jetzt: () => new Date(JETZT.getTime() + 29 * 86400000) });
    const neu = hol.mock.calls.slice(n).map((c) => c[0]);
    expect(neu.some((u) => u.includes("wasser/wsg"))).toBe(true);
    expect(neu.some((u) => u.includes("photon"))).toBe(false);
  });

  it("Fehler eines Dienstes bleibt beim Thema und wird nie gespeichert", async () => {
    const { d, cache } = aufbau((u) => {
      if (u.includes("wasser/wsg")) throw new Error("HTTP 503");
      return antworten(u);
    });
    const { von } = await ergebnis(ANFRAGE, d);
    expect(von("wasserschutz")).toMatchObject({ status: "fehler", wert: null, vorgewaehlt: false });
    expect(von("wasserschutz").viewer).toBeTruthy();
    expect(von("hochwasser").status).toBe("ermittelt");
    expect([...cache.values()].some((x) => x.thema === "wasserschutz")).toBe(false);
    // beim nächsten Mal wird genau dieser Dienst erneut gefragt
    const zweiter = aufbau();
    const { von: von2 } = await ergebnis(ANFRAGE, { ...d, holen: zweiter.hol });
    expect(von2("wasserschutz").status).toBe("ermittelt");
  });

  it("Fehlerseite statt Kartenantwort zählt als Fehler, nicht als „kein Gebiet“", async () => {
    const { d } = aufbau((u) => (u.includes("wasser/wsg") ? "<html>Error</html>" : antworten(u)));
    const { von } = await ergebnis(ANFRAGE, d);
    expect(von("wasserschutz").status).toBe("fehler");
  });

  it("ohne Radon-Bodenluftwert steht das Vorsorgegebiet trotzdem fest", async () => {
    const { d } = aufbau((u) => {
      if (u.includes("imis.bfs.de")) throw new Error("Zeitüberschreitung");
      return antworten(u);
    });
    const { von } = await ergebnis(ANFRAGE, d);
    expect(von("radon")).toMatchObject({ status: "ermittelt", wert: "nein" });
    expect(von("radon").hinweis).toMatch(/nicht abrufbar/);
  });

  it("Tageslimit erreicht: keine Abfrage an die Dienste", async () => {
    const { d, hol } = aufbau(antworten, false);
    const r = await analysieren(ANFRAGE, d);
    expect(r).toMatchObject({ ok: false, code: "limit" });
    expect(hol).not.toHaveBeenCalled();
  });

  it("Tageslimit erreicht, aber alles im Cache: Antwort kommt trotzdem", async () => {
    const a = aufbau();
    await ergebnis(ANFRAGE, a.d);
    const r = await analysieren(ANFRAGE, { ...a.d, limitZaehlen: async () => false });
    expect(r.ok).toBe(true);
  });

  it("Adresse nicht gefunden und Adresssuche nicht erreichbar sind verschiedene Meldungen, nichts wird gespeichert", async () => {
    const nichts = aufbau((u) => (u.includes("photon") ? '{"features":[]}' : antworten(u)));
    expect(await analysieren(ANFRAGE, nichts.d)).toMatchObject({ ok: false, code: "adresse_nicht_gefunden" });
    expect(nichts.cache.size).toBe(0);
    const weg = aufbau((u) => {
      if (u.includes("photon")) throw new Error("HTTP 403");
      return antworten(u);
    });
    const antwort = await analysieren(ANFRAGE, weg.d);
    expect(antwort).toMatchObject({ ok: false, code: "error" });
    expect(!antwort.ok && antwort.message).toContain("HTTP 403");
    expect(weg.cache.size).toBe(0);
  });

  it("Adresse liegt in einem anderen Bundesland als am Projekt eingetragen", async () => {
    const { d } = aufbau();
    expect(await analysieren({ ...ANFRAGE, land: "BW" }, d)).toMatchObject({ ok: false, code: "bundesland_passt_nicht" });
  });

  it("andere Straße trotz gleicher Nummer: nur der Ort zählt, keine Karten an falscher Stelle", async () => {
    const { d, hol } = aufbau((u) => (u.includes("photon") ? photon({ housenumber: "8", street: "Leonhardstraße" }) : antworten(u)));
    const { r, von } = await ergebnis(ANFRAGE, d);
    expect(r.genauigkeit).toBe("ort");
    expect(von("wasserschutz").status).toBe("nicht_ermittelbar");
    expect(von("schneelast").wert).toBe("1a");
    expect(hol.mock.calls.some((c) => c[0].includes("wasser/wsg"))).toBe(false);
  });

  it("Treffer in einem fremden Ort wird nicht genommen", async () => {
    const { d } = aufbau((u) => (u.includes("photon") ? photon({ housenumber: "8", street: "Marienplatz", city: "Passau", postcode: "94032" }, 48.57, 13.46) : antworten(u)));
    expect(await analysieren(ANFRAGE, d)).toMatchObject({ ok: false, code: "adresse_nicht_gefunden" });
  });

  it("Gemeinde nicht im Verzeichnis: Zonen und Radon nicht ermittelbar, Karten trotzdem", async () => {
    const { d } = aufbau((u) => (u.includes("photon") ? photon({ housenumber: "8", street: "Marienplatz", city: "Gibtsnichthausen" }) : antworten(u)));
    const { von } = await ergebnis({ ...ANFRAGE, ort: "Gibtsnichthausen" }, d);
    expect(von("schneelast")).toMatchObject({ status: "nicht_ermittelbar", grund: expect.stringContaining("Gemeindeverzeichnis") });
    expect(von("radon").status).toBe("nicht_ermittelbar");
    expect(von("wasserschutz").status).toBe("ermittelt");
  });

  it("nur der Ort gefunden: Zonen ja, Abfragen am Punkt nein", async () => {
    const { d, hol } = aufbau();
    const { r, von } = await ergebnis({ ...ANFRAGE, strasse: null }, d);
    expect(r.genauigkeit).toBe("ort");
    expect(von("schneelast").status).toBe("ermittelt");
    expect(von("wasserschutz")).toMatchObject({ status: "nicht_ermittelbar" });
    expect(von("wasserschutz").grund).toMatch(/keine Straße/);
    expect(hol.mock.calls.some((c) => c[0].includes("wasser/wsg"))).toBe(false);
  });

  it("nur auf die Straße genau: Kartenwerte sind nicht vorausgewählt, Zonen schon", async () => {
    const { d } = aufbau((u) => (u.includes("photon") ? photon({ housenumber: "50", street: "Marienplatz" }) : antworten(u)));
    const { r, von } = await ergebnis(ANFRAGE, d);
    expect(r.genauigkeit).toBe("strasse");
    expect(von("wasserschutz").vorgewaehlt).toBe(false);
    expect(von("schneelast").vorgewaehlt).toBe(true);
  });

  const DORNSTADT: Anfrage = { land: "BW", strasse: "Rathausgasse 1", plz: "89160", ort: "Dornstadt", gemarkung: null };
  const bw = (laerm: string) => (u: string) =>
    u.includes("photon") ? photon({ housenumber: "1", street: "Rathausgasse", city: "Dornstadt", postcode: "89160", state: "Baden-Württemberg" }, 48.463, 9.961) : u.includes("Umgebungslaermkartierung") ? laerm : antworten(u);

  it("BW: Erdbeben nicht ermittelbar mit Grund und Viewer, Lärm aus der LUBW-Karte", async () => {
    const { d, cache } = aufbau(bw(JSON.stringify({ features: [{ attributes: { ART: "Lden", DB_LOW: 60, DB_HIGH: 65 } }] })));
    const { von } = await ergebnis(DORNSTADT, d);
    expect(von("schneelast").wert).toBe("1a");
    expect(von("erdbeben")).toMatchObject({ status: "nicht_ermittelbar", viewer: expect.stringContaining("mlw.baden-wuerttemberg") });
    expect(von("laerm")).toMatchObject({ status: "ermittelt", anzeige: "Straße: LDEN 60 bis 65 dB(A)", vorgewaehlt: true });
    expect(von("laerm").quelle).toMatch(/LUBW/);
    expect(von("laerm").hinweis).toMatch(/DIN 4109/);
    expect([...cache.values()].some((x) => x.thema === "erdbeben")).toBe(false);
    expect([...cache.values()].some((x) => x.thema === "laerm")).toBe(true);
  });

  it("BW: Lärm ohne Fläche, höchste Stufe und Fehler des Dienstes", async () => {
    expect((await ergebnis(DORNSTADT, aufbau(bw('{"features":[]}')).d)).von("laerm").anzeige).toBe("Kein kartierter Straßenlärm am Standort");
    expect((await ergebnis(DORNSTADT, aufbau(bw(JSON.stringify({ features: [{ attributes: { ART: "Lden", DB_LOW: 75, DB_HIGH: 99 } }] }))).d)).von("laerm").anzeige).toBe("Straße: LDEN über 75 dB(A)");
    const { d, cache } = aufbau(bw("<html>Fehler</html>"));
    expect((await ergebnis(DORNSTADT, d)).von("laerm")).toMatchObject({ status: "fehler", viewer: expect.stringContaining("udo.lubw") });
    expect([...cache.values()].some((x) => x.thema === "laerm")).toBe(false);
  });

  it("an die Dienste gehen nur Adresse und Koordinaten", async () => {
    const { d, hol } = aufbau();
    await ergebnis(ANFRAGE, d);
    for (const [u] of hol.mock.calls) expect(u).not.toMatch(/projectId|bauherr/i);
    const adresse = hol.mock.calls.filter(([u]) => u.includes("Marienplatz")).map(([u]) => u);
    expect(adresse.length).toBeGreaterThan(0);
    expect(adresse.every((u) => u.includes("photon"))).toBe(true);
  });

  it("Schreibweise der Adresse ergibt denselben Cache-Schlüssel", () => {
    expect(adressSchluessel({ ...ANFRAGE, strasse: "Marienplatz  8" })).toBe(adressSchluessel({ ...ANFRAGE, strasse: "marienplatz 8" }));
  });

  it("Tagesbeginn für das Limit", () => {
    expect(tagesbeginn(new Date("2026-11-01T23:59:00Z"))).toBe("2026-11-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Auswahl "Alle übernehmen" und Kreuze im PDF
// ---------------------------------------------------------------------------

const e = (thema: Ergebnis["thema"], x: Partial<Ergebnis> = {}): Ergebnis => ({ thema, status: "ermittelt", wert: "2", anzeige: "Zone 2", quelle: "Q", abgerufenAm: "2026-11-01T10:00:00Z", grund: null, hinweis: null, viewer: null, vorgewaehlt: true, ...x });

describe("Alle übernehmen", () => {
  const liste = [
    e("schneelast"),
    e("wasserschutz", { wert: "gebiet", anzeige: "Wasserschutzgebiet Musterried" }),
    e("laerm", { wert: "Straße", anzeige: "Straße", vorgewaehlt: false }),
    e("strom", { status: "nicht_ermittelbar", wert: null, anzeige: null, quelle: null, abgerufenAm: null, grund: "G", vorgewaehlt: false }),
  ];

  it("Ausgangszustand: Sicheres angehakt, Unsicheres und Fehlendes nicht", () => {
    expect(zeilenAus(liste).map((z) => [z.thema, z.gewaehlt])).toEqual([["schneelast", true], ["wasserschutz", true], ["laerm", false], ["strom", false]]);
  });

  it("übernimmt nur Angehaktes, mit Wert, Quelle und Datum", () => {
    const u = uebernahme(liste, zeilenAus(liste));
    expect(Object.keys(u)).toEqual(["schneelast", "wasserschutz"]);
    expect(u.schneelast).toEqual({ wert: "2", anzeige: "Zone 2", quelle: "Q", abgerufenAm: "2026-11-01T10:00:00Z", geaendert: false });
  });

  it("abgewählte Werte bleiben draußen", () => {
    const z = zeilenAus(liste).map((x) => (x.thema === "schneelast" ? { ...x, gewaehlt: false } : x));
    expect(Object.keys(uebernahme(liste, z))).toEqual(["wasserschutz"]);
  });

  it("geänderte Werte werden gemerkt und im Klartext gezeigt", () => {
    const z = zeilenAus(liste).map((x) => (x.thema === "wasserschutz" ? { ...x, wert: "3" } : x));
    expect(uebernahme(liste, z).wasserschutz).toMatchObject({ wert: "3", anzeige: "Wasserschutzgebiet, Zone III", geaendert: true });
  });

  it("nicht Ermitteltes bekommt auch angehakt keinen Wert", () => {
    const z = zeilenAus(liste).map((x) => (x.thema === "strom" ? { ...x, gewaehlt: true, wert: "Stadtwerke" } : x));
    expect(uebernahme(liste, z).strom).toBeUndefined();
  });

  it("leerer Wert wird nicht übernommen, Bisheriges bleibt erhalten", () => {
    const bisher = { radon: { wert: "nein", anzeige: "Kein Radonvorsorgegebiet", quelle: "Q", abgerufenAm: null, geaendert: false } };
    const z = zeilenAus(liste).map((x) => (x.thema === "schneelast" ? { ...x, wert: "  " } : x));
    const u = uebernahme(liste, z, bisher);
    expect(u.schneelast).toBeUndefined();
    expect(u.radon).toEqual(bisher.radon);
  });
});

describe("Kreuze im PDF", () => {
  const w = (wert: string, anzeige = wert) => ({ wert, anzeige, quelle: null, abgerufenAm: null, geaendert: false });

  it("ohne übernommene Werte wird nichts angekreuzt (Vorschläge landen nie im PDF)", () => {
    expect(ankreuzWerte("schwabenhaus", undefined)).toEqual({ kreuze: [], offen: [] });
    expect(ankreuzWerte("living-haus", {})).toEqual({ kreuze: [], offen: [] });
  });

  it("Living Haus und Bien-Zenker: Kontrollkästchen", () => {
    const { kreuze } = ankreuzWerte("living-haus", { schneelast: w("1a"), erdbeben: w("keine"), wasserschutz: w("3") });
    expect(kreuze.map((k) => k.feld)).toEqual(["Kontrollkästchen 2.04", "Kontrollkästchen 2.11", "Kontrollkästchen 2.19"]);
    expect(ankreuzWerte("bien-zenker", { schneelast: w("2") }).kreuze).toEqual([{ feld: "Kontrollkästchen 2.05" }]);
  });

  it("Schwabenhaus: Radio-Gruppen und Radon", () => {
    const { kreuze } = ankreuzWerte("schwabenhaus", { schneelast: w("3"), erdbeben: w("0"), radon: w("nein"), wasserschutz: w("gebiet") });
    expect(kreuze).toEqual([
      { feld: "SLZ", widget: 14 },
      { feld: "Erdbebenzone", widget: 8 },
      { feld: "Radon", widget: 5 },
      { feld: "Wasserschutz", widget: 2 },
    ]);
  });

  it("was keine Entsprechung hat, wird nicht angekreuzt, sondern gemeldet", () => {
    expect(ankreuzWerte("living-haus", { schneelast: w("3a", "Zone 3a") })).toEqual({ kreuze: [], offen: ["Zone 3a"] });
    expect(ankreuzWerte("schwabenhaus", { erdbeben: w("keine", "Keine Erdbebenzone") })).toEqual({ kreuze: [], offen: ["Keine Erdbebenzone"] });
    // Zone offen: FB-22 fragt die Zone ab und bekommt kein geratenes Kreuz
    expect(ankreuzWerte("living-haus", { wasserschutz: w("gebiet", "Wasserschutzgebiet Musterried") })).toEqual({ kreuze: [], offen: ["Wasserschutzgebiet Musterried"] });
  });

  it("Schwabenhaus: kein Wasserschutzgebiet heißt leerer Kreis, nichts zu vermerken", () => {
    expect(ankreuzWerte("schwabenhaus", { wasserschutz: w("keine") })).toEqual({ kreuze: [], offen: [] });
  });

  it("Lärm, Hochwasser und Höhe kreuzen nie etwas an", () => {
    const { kreuze, offen } = ankreuzWerte("living-haus", { laerm: w("Straße LDEN 70 dB(A)"), hochwasser: w("ja"), hoehe: w("480 m") });
    expect(kreuze).toEqual([]);
    expect(offen).toEqual([]);
  });
});

// Das Feld-Inventar (docs/planungsprotokoll) stammt aus den echten Vorlagen: so prüft das auch die CI, wo die PDFs fehlen
describe("Kreuze passen zum Feld-Inventar der Vorlagen", () => {
  type Widget = { name: string; widget: number; seite: number; x: number; y: number; breite: number; hoehe: number; beschriftung: string | null };
  const inventar = (v: string): Widget[] => JSON.parse(readFileSync(`docs/planungsprotokoll/${v}.json`, "utf8")).felder;
  const gleicheBeschriftung: Record<string, string> = { gebiet: "Wasserschutzgebiet, Auflagen:", "1": "1", ja: "ja", nein: "nein" };

  it("Schwabenhaus: jede Auswahl trifft ihre Beschriftung und liegt zuoberst (kein leeres Kästchen darüber)", () => {
    const felder = inventar("schwabenhaus");
    for (const [thema, ziele] of Object.entries(ANKREUZ.schwabenhaus)) {
      for (const [wert, ziel] of Object.entries(ziele)) {
        // Das Inventar ist nach Lage sortiert; "widget" ist die Position in der Datei, ab 1
        const widgets = felder.filter((f) => f.name === ziel.feld);
        const w = widgets.find((x) => x.widget === ziel.widget! + 1)!;
        expect(w, `${thema}/${wert}`).toBeDefined();
        const erwartet = thema === "wasserschutz" ? "Wasserschutzgebiet, Auflagen:" : (gleicheBeschriftung[wert] ?? wert);
        expect(w.beschriftung, `${thema}/${wert}`).toBe(erwartet);
        // Später gezeichnete Widgets derselben Gruppe an derselben Stelle würden das Kreuz überdecken
        const darueber = widgets.filter((x) => x.widget > w.widget && x.seite === w.seite && Math.abs(x.x - w.x) < 3 && Math.abs(x.y - w.y) < 3);
        expect(darueber, `${thema}/${wert}`).toEqual([]);
      }
    }
  });

  for (const v of ["living-haus", "bien-zenker"] as const) {
    it(`${v}: jedes Kästchen trifft seine Beschriftung und Zeile`, () => {
      const felder = inventar(v);
      const zeile: Record<string, string> = { schneelast: "Schneelastzone", erdbeben: "Erdbebenzone", wasserschutz: "Wasserschutzzone" };
      for (const [thema, ziele] of Object.entries(ANKREUZ[v])) {
        for (const [wert, ziel] of Object.entries(ziele)) {
          const w = felder.find((f) => f.name === ziel.feld) as Widget & { gruppe: string };
          expect(w.beschriftung, `${thema}/${wert}`).toBe(wert);
          expect(w.gruppe, `${thema}/${wert}`).toContain(zeile[thema]);
        }
      }
    });
  }
});

describe("Demo-Modus", () => {
  it("prüft wie der Echtbetrieb und fragt keinen Dienst", () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect(demoStandort({ bundesland: "NW", siteCity: "Köln" })).toMatchObject({ ok: false, code: "bundesland_nicht_unterstuetzt" });
    expect(demoStandort({})).toMatchObject({ ok: false, code: "fehlende_angaben" });
    const r = demoStandort({ bundesland: "BW", siteStreet: "Musterweg 1", sitePostalCode: "89000", siteCity: "Musterstadt" });
    expect(r.ok && r.ergebnisse).toHaveLength(8);
    expect(r.ok && r.ergebnisse.find((x) => x.thema === "strom")?.status).toBe("nicht_ermittelbar");
    expect(f).not.toHaveBeenCalled();
    f.mockRestore();
  });
});

