// Schornsteinfeger vorschlagen: Hausnummern-Abgleich, Straßen-Normalisierung, Parser der Quelle, Eingabe, Bauadresse.
// Alle Namen, Kennungen und Kontaktdaten sind erfunden; nur die Hausnummernlisten folgen der Struktur der Quelle.
import { describe, expect, it } from "vitest";
import { cacheGrenze, cacheGueltig, MAX_ABRUFE_PRO_TAG, parseAnfrage, speicherFrist, suchAntwort, tagesbeginn, TIMEOUT_MS, CACHE_TAGE, CACHE_NICHT_GEFUNDEN_STUNDEN, bsmIds } from "../../../supabase/functions/schornsteinfeger-suche/logic";
import source from "../../../supabase/functions/schornsteinfeger-suche/index.ts?raw";
import {
  bauadresseFuerSuche,
  bezirkeAbgleichen,
  demoDetails,
  demoSuche,
  detailsLesen,
  hausnummerNormalisieren,
  hausnummernListe,
  hausnummerPasst,
  kontaktAusDetails,
  passendeTreffer,
  plzAusOrt,
  strasseAusBauadresse,
  strassenAnfang,
  strassenLesen,
  strassenSchluessel,
  strasseNormalisieren,
  strasseUndHausnummer,
  type Treffer,
} from "./schornsteinfeger";

const S20 = "2/a,2/b,4,6,8,10,12,16/a,16/b,18,18/1,18/2,22,22/a,23,24,25,27,29,31,35,28,30,30a,30b,32,32a,37,38,39,40,41,42,42a,43,44,45,47,49,50,51,52,53,54,54a,55,56,58,60,62,66,66/1,68,70,72,74,76,78,80,82,84,86,88,90,145 a";
const S21 = "1,3,5,7,9,11,13,15,15 A,17,19";
const S17 =
  "57,59,61,63,65,67,69,71,75,77,79,81/1,81/2,81/A,81/B,83/1,83/2,89,91,93/1,93a,95a,96-104,97,99a,101a,103/B,105,107,108,109a,110,111,113,115,117,121,123,123/A,125,127,129,131,133/1,135/A,139,141,143,145/A,145/B,147,147 A-C,148,149/A,151/A,153/1,155,157,161,163";

const VOGELSANG: Treffer[] = [
  {
    strasse: "Vogelsangstraße",
    ortsteil: null,
    plz: "70176",
    ort: "Stuttgart",
    bezirke: [
      { bezirk: "S20", name: "Anna Ruß", bsmId: "9101", hnr: S20 },
      { bezirk: "S21", name: "Bernd Kamin", bsmId: "9102", hnr: S21 },
      { bezirk: "S17", name: "Carla Esse", bsmId: "9103", hnr: S17 },
    ],
  },
];

/** Antwort der Straßensuche im Aufbau der Quelle (data-all in einfachen Anführungszeichen, JSON-Escapes \/ und ß). */
function suchHtml(zeilen: { plz: string; strasse: string; ortsteil?: string; all?: object | string }[]): string {
  const tr = zeilen
    .map((z) => {
      const all = z.all === undefined ? "" : ` data-geteilt='ja' data-all='${typeof z.all === "string" ? z.all : JSON.stringify(z.all).replace(/\//g, "\\/").replace(/ß/g, "\\u00df")}'`;
      return `<tr class='click mark' data-ortid='1'><td>${z.strasse}</td><td>${z.ortsteil ?? "Stuttgart"}</td><td class='auswaehlen' align='center'><a style='color:#2991d6;'${all} data-plz='${z.plz}' data-strassenId='1'>Auswählen</a></td></tr>`;
    })
    .join("");
  return `\n<table id='street' class='display street'><thead><tr><th>Straße</th><th>Ortsteil</th><th class='auswaehlen'></th></tr></thead><tbody>${tr}</tbody></table>`;
}
const kbz = (id: string, vor: string, nach: string, bsm: string, hnr: string) => ({ [id]: { BSMVorname: vor, BSMName: nach, BSMId: bsm, [id]: id, Hnr: hnr } });

/** Detailantwort im Aufbau der Quelle, Felder einzeln weglassbar. */
function detailHtml(o: { name?: string; email?: string | null; mobil?: string | null; innung?: string } = {}): string {
  const name = o.name ?? "Erika Beispiel";
  const email = o.email === undefined ? "info@beispiel.de" : o.email;
  const mobil = o.mobil === undefined ? "0170-0000000" : o.mobil;
  return (
    `\n<div class='beraterliste'><div style='margin-left:2px;'><div class='beraterbild' style="background-image:url('x.jpg');"></div></div>` +
    `<div style='font-size:10px;font-weight:bold;'>Schornsteinfegermeister - Mitglied der ${o.innung ?? "Innung Musterstadt"}</div>` +
    `<div class='adresse_block1'><strong style='color:#0070b1;'>${name}</strong><br/>\n\t\t\t\t\t\t\t\t71726 Musterort /N <br/> Beispielstr. 39<br/>` +
    (email ? `<b>E-Mail: </b>${email}<br>` : "") +
    `</div><div class='adresse_block2'><b>Tel.:</b> 07144-00000 <br/><b>Fax: </b> 07144 / 00001<br/>` +
    (mobil ? `<strong>Mobil: </strong>${mobil}<br/>` : "") +
    `<br/></div></div>`
  );
}

describe("Hausnummern normalisieren und auflösen", () => {
  it('"15 A", "15/A", "15a" sind gleich; zwischen Ziffern bleibt der Schrägstrich', () => {
    expect(hausnummerNormalisieren("15 A")).toBe("15a");
    expect(hausnummerNormalisieren("15/A")).toBe("15a");
    expect(hausnummerNormalisieren("15a")).toBe("15a");
    expect(hausnummerNormalisieren(" 145 a ")).toBe("145a");
    expect(hausnummerNormalisieren("18/1")).toBe("18/1");
  });
  it('löst "147 A-C" in 147a, 147b, 147c auf und hält "96-104" als Bereich', () => {
    expect(hausnummernListe("147 A-C")).toEqual(["147a", "147b", "147c"].map((wert) => ({ art: "nummer", wert })));
    expect(hausnummernListe("96-104")).toEqual([{ art: "bereich", von: 96, bis: 104 }]);
    expect(hausnummernListe("1, ,3")).toHaveLength(2);
  });
  it("Bereich gilt nur für Nummern gleicher Parität wie der Startwert, und nur unsicher", () => {
    expect(hausnummerPasst("96-104", "100")).toBe("unsicher");
    expect(hausnummerPasst("96-104", "96")).toBe("unsicher");
    expect(hausnummerPasst("96-104", "99")).toBe("nein");
    expect(hausnummerPasst("96-104", "106")).toBe("nein");
  });
  it("genau gleich = ja, nur Grundnummer gleich = unsicher", () => {
    expect(hausnummerPasst("12,14", "12")).toBe("ja");
    expect(hausnummerPasst("12a,14", "12")).toBe("unsicher");
    expect(hausnummerPasst("12,14", "12a")).toBe("unsicher");
    expect(hausnummerPasst("18/1,18/2", "18")).toBe("unsicher");
    expect(hausnummerPasst("181", "18/1")).toBe("nein");
    expect(hausnummerPasst("12", "ohne")).toBe("nein");
  });
});

describe("Abgleich Vogelsangstraße 70176 (Fixture)", () => {
  const kurz = (h: string | null) => {
    const r = bezirkeAbgleichen(VOGELSANG, h);
    return { status: r.status, passend: r.kandidaten.filter((k) => k.passt !== "nein").map((k) => `${k.bezirk}:${k.passt}`) };
  };
  it("4 → S20, eindeutig", () => expect(kurz("4")).toEqual({ status: "eindeutig", passend: ["S20:ja"] }));
  it("15a → S21, eindeutig", () => expect(kurz("15a")).toEqual({ status: "eindeutig", passend: ["S21:ja"] }));
  it("15 A und 15/A wie 15a", () => {
    expect(kurz("15 A")).toEqual({ status: "eindeutig", passend: ["S21:ja"] });
    expect(kurz("15/A")).toEqual({ status: "eindeutig", passend: ["S21:ja"] });
  });
  it("100 → S17 (unsicher, Bereich), nicht automatisch gewählt", () => expect(kurz("100")).toEqual({ status: "mehrdeutig", passend: ["S17:unsicher"] }));
  it("147b → S17, eindeutig", () => expect(kurz("147b")).toEqual({ status: "eindeutig", passend: ["S17:ja"] }));
  it("145 → S20 und S17 nur über die Grundnummer: unsicher", () => expect(kurz("145")).toEqual({ status: "mehrdeutig", passend: ["S20:unsicher", "S17:unsicher"] }));
  it("999 → kein Treffer: alle Bezirke mit nein zur Auswahl", () => {
    const r = bezirkeAbgleichen(VOGELSANG, "999");
    expect(r.status).toBe("mehrdeutig");
    expect(r.kandidaten.map((k) => k.passt)).toEqual(["nein", "nein", "nein"]);
    expect(suchAntwort(VOGELSANG, "999", "Vogelsangstraße").meldung).toContain("999");
  });
  it("ohne Nummer → drei Kandidaten, Status ohne_hausnummer", () => {
    for (const h of [null, "", "o. Nr."]) {
      const r = bezirkeAbgleichen(VOGELSANG, h);
      expect(r.status).toBe("ohne_hausnummer");
      expect(r.kandidaten.map((k) => k.bezirk)).toEqual(["S20", "S21", "S17"]);
      expect(r.kandidaten.every((k) => k.passt === "unsicher")).toBe(true);
    }
  });
  it("sichere Treffer stehen vor unsicheren, die vor den übrigen", () => {
    const r = bezirkeAbgleichen(VOGELSANG, "15");
    expect(r.kandidaten[0]).toMatchObject({ bezirk: "S21", passt: "ja", name: "Bernd Kamin", bsmId: "9102", strasse: "Vogelsangstraße" });
  });
  it("ohne Treffer bzw. ohne Bezirke: nicht_gefunden", () => {
    expect(bezirkeAbgleichen([], "4").status).toBe("nicht_gefunden");
    const ohne: Treffer[] = [{ ...VOGELSANG[0], bezirke: null }];
    expect(suchAntwort(ohne, "4", "x")).toMatchObject({ status: "nicht_gefunden", kandidaten: [] });
    expect(suchAntwort(ohne, "4", "x").meldung).toContain("keinen Kehrbezirk");
  });
  it("mehrere Treffer (Ortsteile): Kandidaten aus allen", () => {
    const zwei: Treffer[] = [VOGELSANG[0], { strasse: "Vogelsangstraße", ortsteil: "Nord", plz: "70176", ort: null, bezirke: [{ bezirk: "N1", name: "Dora Zug", bsmId: "9104", hnr: "4" }] }];
    const r = bezirkeAbgleichen(zwei, "4");
    expect(r.status).toBe("mehrdeutig");
    expect(r.kandidaten.filter((k) => k.passt === "ja").map((k) => k.ortsteil)).toEqual([null, "Nord"]);
    expect(bsmIds(zwei)).toEqual(["9101", "9102", "9103", "9104"]);
  });
});

describe("Straßennamen", () => {
  it("normalisiert Abkürzungen", () => {
    expect(strasseNormalisieren("Vogelsangstr.")).toBe("Vogelsangstraße");
    expect(strasseNormalisieren("Vogelsangstr")).toBe("Vogelsangstraße");
    expect(strasseNormalisieren("  Ulmer   Str. ")).toBe("Ulmer Straße");
    expect(strasseNormalisieren("Hauptstrasse")).toBe("Hauptstraße");
    expect(strasseNormalisieren("Am Hang")).toBe("Am Hang");
  });
  it("Namensanfang für den zweiten Versuch", () => {
    expect(strassenAnfang("Vogelsangstr.")).toBe("Vogelsang");
    expect(strassenAnfang("Ulmer Straße")).toBe("Ulmer");
    expect(strassenAnfang("Am Hang")).toBe("");
  });
  it("Schlüssel für Zwischenspeicher und Vergleich", () => {
    expect(strassenSchluessel("Vogelsangstr.")).toBe("vogelsangstrasse");
    expect(strassenSchluessel("Vogelsang-Straße")).toBe(strassenSchluessel("vogelsangstraße"));
    expect(strassenSchluessel("Römerweg")).toBe("roemerweg");
  });
  it("teilt die Bauadresse in Straße und Hausnummer", () => {
    expect(strasseUndHausnummer("Vogelsangstraße 147 b")).toEqual({ strasse: "Vogelsangstraße", hausnummer: "147 b" });
    expect(strasseUndHausnummer("Vogelsangstraße 15/A")).toEqual({ strasse: "Vogelsangstraße", hausnummer: "15/A" });
    expect(strasseUndHausnummer("Im Wiesengrund 4-6")).toEqual({ strasse: "Im Wiesengrund", hausnummer: "4-6" });
    expect(strasseUndHausnummer("Baugebiet Lerchenfeld")).toEqual({ strasse: "Baugebiet Lerchenfeld", hausnummer: null });
    expect(strasseUndHausnummer("Straße des 17. Juni 3")).toEqual({ strasse: "Straße des 17. Juni", hausnummer: "3" });
  });
});

describe("PLZ aus dem Feld Bauort", () => {
  it('liest die PLZ nur aus der Form "PLZ Ort"', () => {
    expect(plzAusOrt("75173 Pforzheim")).toBe("75173");
    expect(plzAusOrt("  89073   Ulm ")).toBe("89073");
    expect(plzAusOrt("Pforzheim")).toBeNull();
    expect(plzAusOrt("Pforzheim 75173")).toBeNull();
    expect(plzAusOrt("7517 Pforzheim")).toBeNull();
    expect(plzAusOrt("75173")).toBeNull();
    expect(plzAusOrt(null)).toBeNull();
  });
});

describe("Straße und Hausnummer aus der Bauadresse", () => {
  const fall = (eingabe: string, strasse: string, hausnummer: string | null, plz: string | null = null) =>
    it(`"${eingabe}"`, () => expect(strasseAusBauadresse(eingabe)).toEqual({ strasse, hausnummer, plz }));
  fall("Vogelsangstraße 4", "Vogelsangstraße", "4");
  fall("Hauptstr. 12a", "Hauptstraße", "12a");
  fall("Hauptstr.12a", "Hauptstraße", "12a");
  fall("Am Bach 3/1", "Am Bach", "3/1");
  fall("Ulmer Str. 15 A", "Ulmer Straße", "15 A");
  fall("Vogelsangstraße 4, 75173 Pforzheim", "Vogelsangstraße", "4", "75173");
  fall("Vogelsangstraße 4, Pforzheim", "Vogelsangstraße", "4");
  fall("Baugebiet Lerchenfeld", "Baugebiet Lerchenfeld", null);
  fall("Flurstück 1234/5", "", null);
  fall("Flst. 88", "", null);
  fall("", "", null);
});

describe("Bauadresse für die Suche", () => {
  it("Bauort „75173 Pforzheim“ und Bauadresse ohne PLZ: Suche möglich (der gemeldete Fall)", () => {
    expect(bauadresseFuerSuche({ buildingAddress: "Vogelsangstraße 4", location: "75173 Pforzheim" })).toEqual({ anfrage: { plz: "75173", strasse: "Vogelsangstraße", hausnummer: "4" }, fehlt: [] });
  });
  it("PLZ: Protokollfeld vor Bauadresse vor Bauort", () => {
    expect(bauadresseFuerSuche({ buildingAddress: "Hauptstr. 12a, 89000 Musterstadt", location: "75173 Pforzheim" }).anfrage?.plz).toBe("89000");
    expect(bauadresseFuerSuche({ sitePostalCode: "70176", buildingAddress: "Hauptstr. 12a, 89000 Musterstadt", location: "75173 Pforzheim" }).anfrage?.plz).toBe("70176");
  });
  it("Straße: Protokollfeld „Bauort Straße“ vor der Bauadresse", () => {
    expect(bauadresseFuerSuche({ siteStreet: "Am Bach 3/1", buildingAddress: "Vogelsangstraße 4", location: "75173 Pforzheim" }).anfrage).toEqual({ plz: "75173", strasse: "Am Bach", hausnummer: "3/1" });
    // leeres Protokollfeld zählt nicht
    expect(bauadresseFuerSuche({ siteStreet: "  ", buildingAddress: "Vogelsangstraße 4", location: "75173 Pforzheim" }).anfrage?.strasse).toBe("Vogelsangstraße");
  });
  it("ohne Hausnummer ist die Suche möglich", () => {
    expect(bauadresseFuerSuche({ buildingAddress: "Baugebiet Lerchenfeld", location: "89000 Musterstadt" }).anfrage).toEqual({ plz: "89000", strasse: "Baugebiet Lerchenfeld", hausnummer: null });
  });
  it("die Anschrift des Bauherrn wird nie verwendet", () => {
    // Auch wenn ein Aufrufer den ganzen Kontakt übergibt: address, street, postalCode, city spielen keine Rolle
    const kontakt = { address: "Wohnweg 1, 89073 Ulm", street: "Wohnweg 1", postalCode: "89073", city: "Ulm", buildingAddress: null, location: null };
    const r = bauadresseFuerSuche(kontakt as Parameters<typeof bauadresseFuerSuche>[0]);
    expect(r.anfrage).toBeNull();
    expect(r.fehlt.map((f) => f.feld)).toEqual(["bauadresse", "plz"]);
  });
  it("nennt genau, was fehlt und wo es einzutragen ist", () => {
    const leer = bauadresseFuerSuche({});
    expect(leer.fehlt.map((f) => f.feld)).toEqual(["bauadresse", "plz"]);
    expect(leer.fehlt[0].text).toBe("Bauadresse fehlt, bitte in der Übersicht über den Stift bei „Projektbeteiligte“ eintragen (z. B. „Vogelsangstraße 4“).");
    expect(leer.fehlt[1].text).toContain("PLZ des Bauorts fehlt");
    expect(leer.fehlt[1].text).toContain("„Projektdaten“");

    const nurPlz = bauadresseFuerSuche({ location: "75173 Pforzheim" });
    expect(nurPlz.fehlt.map((f) => f.feld)).toEqual(["bauadresse"]);

    const flurstueck = bauadresseFuerSuche({ buildingAddress: "Flurstück 1234/5", location: "75173 Pforzheim" });
    expect(flurstueck.fehlt[0].text).toContain("„Flurstück 1234/5“) steht keine Straße");

    const ortOhnePlz = bauadresseFuerSuche({ buildingAddress: "Vogelsangstraße 4", location: "Pforzheim" });
    expect(ortOhnePlz.fehlt).toEqual([{ feld: "plz", text: expect.stringContaining("Im Bauort („Pforzheim“) steht keine PLZ") }]);

    const kurz = bauadresseFuerSuche({ siteStreet: "Musterweg 1", sitePostalCode: "890" });
    expect(kurz.fehlt).toEqual([{ feld: "plz", text: expect.stringContaining("(„890“) ist nicht fünfstellig") }]);
  });
});

describe("Parser Straßensuche", () => {
  const vogelsang = { id: "1", Strasse: "Vogelsangstraße", Ortsteil: "", plz: "70176", KBZar: { ...kbz("S20", "Anna", "Ruß", "9101", "2/a,4"), ...kbz("S21", "Bernd", "Kamin", "9102", "15 A") }, Ort: "Stuttgart" };
  it("liest Zeilen mit data-all samt JSON-Escapes", () => {
    const r = strassenLesen(suchHtml([{ plz: "70176", strasse: "Vogelsangstraße", all: vogelsang }]));
    expect(r).toEqual({
      ok: true,
      treffer: [
        {
          strasse: "Vogelsangstraße",
          ortsteil: "Stuttgart",
          plz: "70176",
          ort: "Stuttgart",
          bezirke: [
            { bezirk: "S20", name: "Anna Ruß", bsmId: "9101", hnr: "2/a,4" },
            { bezirk: "S21", name: "Bernd Kamin", bsmId: "9102", hnr: "15 A" },
          ],
        },
      ],
    });
  });
  it("unscharfe Vorschläge anderer PLZ (ohne data-all) werden herausgefiltert", () => {
    const r = strassenLesen(
      suchHtml([
        { plz: "70499", strasse: "Giebelstraße" },
        { plz: "70176", strasse: "Vogelsangstraße", all: vogelsang },
        { plz: "70565", strasse: "Vogelsangweg" },
      ]),
    );
    if (!r.ok) throw new Error("nicht lesbar");
    expect(r.treffer).toHaveLength(3);
    expect(passendeTreffer(r.treffer, "70176", "Vogelsangstr.", "genau").map((t) => t.strasse)).toEqual(["Vogelsangstraße"]);
    expect(passendeTreffer(r.treffer, "70565", "Vogelsang", "anfang").map((t) => t.strasse)).toEqual(["Vogelsangweg"]);
    expect(passendeTreffer(r.treffer, "70176", "Giebelstraße", "genau")).toEqual([]);
  });
  it("leere Tabelle bzw. leere Antwort: keine Treffer", () => {
    expect(strassenLesen(suchHtml([]))).toEqual({ ok: true, treffer: [] });
    expect(strassenLesen("  ")).toEqual({ ok: true, treffer: [] });
  });
  it("Strukturänderung oder kaputtes JSON: nicht lesbar, kein Absturz", () => {
    expect(strassenLesen("<html><body>Wartungsarbeiten</body></html>")).toEqual({ ok: false });
    expect(strassenLesen(suchHtml([{ plz: "70176", strasse: "Vogelsangstraße", all: '{"id":"1","KBZar":{' }]))).toEqual({ ok: false });
    expect(strassenLesen(suchHtml([{ plz: "70176", strasse: "Vogelsangstraße", all: { id: "1", KBZar: "kaputt" } }]))).toEqual({ ok: false });
    expect(strassenLesen(undefined as unknown as string)).toEqual({ ok: false });
  });
  it("eine kaputte Zeile neben einer guten wird übergangen", () => {
    const r = strassenLesen(suchHtml([{ plz: "70176", strasse: "Vogelsangstraße", all: "{kaputt" }, { plz: "70176", strasse: "Vogelsangstraße", ortsteil: "Nord", all: vogelsang }]));
    expect(r.ok && r.treffer.length).toBe(1);
  });
});

describe("Parser Details", () => {
  it("alle Felder da", () => {
    expect(detailsLesen(detailHtml())).toEqual({
      ok: true,
      details: { name: "Erika Beispiel", plz_ort: "71726 Musterort /N", strasse: "Beispielstr. 39", email: "info@beispiel.de", tel: "07144-00000", mobil: "0170-0000000", fax: "07144 / 00001", innung: "Innung Musterstadt" },
    });
  });
  it("Mobil fehlt", () => {
    const r = detailsLesen(detailHtml({ mobil: null }));
    expect(r.ok && r.details).toMatchObject({ mobil: null, tel: "07144-00000", email: "info@beispiel.de" });
  });
  it("E-Mail fehlt", () => {
    const r = detailsLesen(detailHtml({ email: null }));
    expect(r.ok && r.details).toMatchObject({ email: null, strasse: "Beispielstr. 39", mobil: "0170-0000000" });
  });
  it("leere oder fremde Antwort: nicht lesbar", () => {
    expect(detailsLesen("")).toEqual({ ok: false });
    expect(detailsLesen("\n")).toEqual({ ok: false });
    expect(detailsLesen("<div>Kein Eintrag</div>")).toEqual({ ok: false });
    expect(detailsLesen("<div class='adresse_block1'><br/></div>")).toEqual({ ok: false });
  });
  it("Umlaute und HTML-Entitäten im Namen", () => {
    const r = detailsLesen(detailHtml({ name: "J&ouml;rg M&uuml;ller-Wei&szlig; &amp; S&#246;hne &#x00C4;", innung: "Innung Schw&auml;bisch Hall" }));
    expect(r.ok && r.details.name).toBe("Jörg Müller-Weiß & Söhne Ä");
    expect(r.ok && r.details.innung).toBe("Innung Schwäbisch Hall");
  });
  it("Übernahme ins Formular: fehlende Angaben bleiben leer, Anschrift aus Straße und PLZ/Ort", () => {
    const r = detailsLesen(detailHtml({ mobil: null, email: null }));
    if (!r.ok) throw new Error("nicht lesbar");
    expect(kontaktAusDetails(r.details)).toEqual({ name: "Erika Beispiel", address: "Beispielstr. 39, 71726 Musterort /N", phone: "07144-00000", mobile: "", email: "" });
  });
});

describe("Eingabe, Limits, Funktion", () => {
  it("prüft beide Aufrufarten", () => {
    expect(parseAnfrage({ art: "suche", plz: "70176", strasse: " Vogelsangstraße ", hausnummer: "" })).toEqual({ ok: true, anfrage: { art: "suche", plz: "70176", strasse: "Vogelsangstraße", hausnummer: null } });
    expect(parseAnfrage({ art: "details", bsmId: "751" })).toEqual({ ok: true, anfrage: { art: "details", bsmId: "751" } });
    expect(parseAnfrage({ art: "suche", plz: "7017", strasse: "X Weg" }).ok).toBe(false);
    expect(parseAnfrage({ art: "suche", plz: "70176", strasse: "" }).ok).toBe(false);
    expect(parseAnfrage({ art: "details", bsmId: "1; drop" }).ok).toBe(false);
    expect(parseAnfrage({ art: "alles" }).ok).toBe(false);
    expect(parseAnfrage(null).ok).toBe(false);
  });
  it("Zwischenspeicher 90 Tage, 30 Abrufe je Tag, 10 s Timeout", () => {
    expect(CACHE_TAGE).toBe(90);
    expect(MAX_ABRUFE_PRO_TAG).toBe(30);
    expect(TIMEOUT_MS).toBe(10_000);
    expect(cacheGrenze(new Date("2026-10-20T12:00:00Z"))).toBe("2026-07-22T12:00:00.000Z");
    expect(tagesbeginn(new Date("2026-10-20T23:59:00Z"))).toBe("2026-10-20T00:00:00.000Z");
  });
  it("Speicherfrist je Ergebnis: Treffer 90 Tage, nicht_gefunden 24 Stunden, quelle_nicht_erreichbar gar nicht", () => {
    expect(CACHE_NICHT_GEFUNDEN_STUNDEN).toBe(24);
    const tag = 24 * 60 * 60 * 1000;
    for (const s of ["eindeutig", "mehrdeutig", "ohne_hausnummer"] as const) expect(speicherFrist(s), s).toBe(90 * tag);
    expect(speicherFrist("nicht_gefunden")).toBe(tag);
    expect(speicherFrist("quelle_nicht_erreichbar")).toBeNull();
  });
  it("gespeicherte Treffer gelten 90 Tage, unabhängig von der Hausnummer", () => {
    const am = "2026-07-22T12:00:00.000Z";
    expect(cacheGueltig(VOGELSANG, am, new Date("2026-10-20T11:59:59Z"))).toBe(true);
    expect(cacheGueltig(VOGELSANG, am, new Date("2026-10-20T12:00:00Z"))).toBe(false);
  });
  it("gespeichertes nicht_gefunden (leer oder ohne Bezirke) gilt nur 24 Stunden", () => {
    const am = "2026-10-20T08:00:00.000Z";
    for (const treffer of [[], [{ ...VOGELSANG[0], bezirke: null }]] as Treffer[][]) {
      expect(cacheGueltig(treffer, am, new Date("2026-10-21T07:59:59Z"))).toBe(true);
      expect(cacheGueltig(treffer, am, new Date("2026-10-21T08:00:00Z"))).toBe(false);
      expect(cacheGueltig(treffer, am, new Date("2026-11-01T08:00:00Z"))).toBe(false);
    }
    expect(cacheGueltig(VOGELSANG, "kein Datum", new Date())).toBe(false);
  });
  it("die Funktion speichert nur mit Frist und prüft sie beim Lesen", () => {
    expect(source).toContain("cacheGueltig(cached.data.treffer");
    expect(source).toMatch(/if \(speicherFrist\(antwort\.status\) !== null\) \{\s*await admin\.from\("schornsteinfeger_suche"\)\.upsert/);
    // nur ein Schreibzugriff auf den Such-Zwischenspeicher, und der steht hinter der Fristprüfung
    expect(source.match(/from\("schornsteinfeger_suche"\)\.upsert/g)).toHaveLength(1);
  });
  it("die Funktion prüft Rolle, hört bei 403/429 auf und holt Details nur für Kandidaten aus einer Suche", () => {
    expect(source).toContain('role?.role !== "admin" && role?.role !== "mitarbeiter"');
    expect(source).toContain("status === 403 || status === 429");
    expect(source).toContain('.contains("bsm_ids", [anfrage.bsmId])');
    expect(source).toContain("AbortSignal.timeout(TIMEOUT_MS)");
    expect(source).not.toMatch(/Promise\.all/);
  });
});

describe("Demo-Modus", () => {
  it("feste Beispielantwort, Abgleich wie im Echtbetrieb", () => {
    const r = demoSuche({ plz: "70176", strasse: "Vogelsangstraße", hausnummer: "15a" });
    expect(r.status).toBe("eindeutig");
    expect(r.kandidaten[0]).toMatchObject({ bsmId: "9001", passt: "ja" });
    expect(r.meldung).toContain("Demo-Modus");
    expect(demoSuche({ plz: "70176", strasse: "X", hausnummer: null }).status).toBe("ohne_hausnummer");
    expect(demoSuche({ plz: "70176", strasse: "X", hausnummer: "20" }).kandidaten[0]).toMatchObject({ bsmId: "9002", passt: "unsicher" });
  });
  it("Details zu beiden Demo-Kandidaten, einer ohne Mobil und E-Mail", () => {
    expect(demoDetails("9001")).toMatchObject({ ok: true, details: { name: "Erika Rußmann" } });
    expect(demoDetails("9002")).toMatchObject({ ok: true, details: { mobil: null, email: null } });
    expect(demoDetails("1").ok).toBe(false);
  });
});
