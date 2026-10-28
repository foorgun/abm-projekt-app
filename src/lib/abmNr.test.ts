import { describe, expect, it } from "vitest";
import { abmHints, abmSortKey, cleanPrefix, companyForAbm, parseAbm, suggestAbmNr } from "./abmNr";
import { compareAbm } from "./projectFilters";
import { validateProjectFields } from "./projectForm";
import type { Company, Project } from "./types";

const companies: Company[] = [
  { id: "bz", name: "Bien-Zenker", numberPrefix: "8161" },
  { id: "sh", name: "Schwabenhaus", numberPrefix: "8185" },
  { id: "lh", name: "Living Haus", numberPrefix: "8260" },
  { id: "fh", name: "Fingerhaus", numberPrefix: null },
];
const nr = (...abm: (string | null)[]) => abm.map((abmNr) => ({ abmNr }));

describe("ABM-Nr.: Format", () => {
  it("vier Ziffern, Bindestrich, Nummer mit variabler Länge", () => {
    for (const s of ["8161-1588", "8185-633", "8260-321", "8161-1", "8161-123456"]) expect(parseAbm(s), s).not.toBeNull();
    for (const s of ["816-12", "81610-12", "8161-", "8161 12", "8161/12", "Bauvoranfrage", "", null]) expect(parseAbm(s), String(s)).toBeNull();
    expect(parseAbm(" 8185-633 ")).toEqual({ prefix: "8185", num: 633 });
  });

  it("Formular: falsches Format und führende Nullen sind Fehler", () => {
    const check = (abmNr: string) => validateProjectFields({ bauherrLabel: "Meier", kind: "neubau", abmNr, hausbauNr: null, intakeMonth: null }, []).abmNr;
    expect(check("8161-1588")).toBeUndefined();
    expect(check("8161-12345")).toBeUndefined(); // variable Länge, auch fünfstellig
    expect(check("8161/12")).toMatch(/Format/);
    expect(check("8161-0633")).toMatch(/Ohne führende Nullen, also 8161-633/);
  });
});

describe("ABM-Nr.: Vorschlag der nächsten Nummer", () => {
  it("vergleicht als Zahl, nicht als Text: nach 633 und 1588 kommt 1589", () => {
    // als Text wäre "633" > "1588"; der Vorschlag wäre dann fälschlich 634
    expect(suggestAbmNr("8185", nr("8185-633", "8185-1588", "8185-99"))).toBe("8185-1589");
  });

  it("nur derselbe Nummernkreis zählt, ohne führende Nullen, erste Nummer 1", () => {
    expect(suggestAbmNr("8260", nr("8161-1588", "8260-41", "8260-041x", "Bauvoranfrage", null))).toBe("8260-42");
    expect(suggestAbmNr("8260", nr("8260-099"))).toBe("8260-100");
    expect(suggestAbmNr("9999", nr("8161-1588"))).toBe("9999-1");
    expect(suggestAbmNr(null, nr("8161-1588"))).toBe("");
  });
});

describe("ABM-Nr.: Sortierung", () => {
  it("erst Nummernkreis, dann Nummer als Zahl (633 vor 1588); Ungültiges ans Ende", () => {
    const list = ["8185-1588", "8161-1588", "8185-633", "Bauvoranfrage", "8260-321", "8161-99"];
    const sorted = ["8161-99", "8161-1588", "8185-633", "8185-1588", "8260-321", "Bauvoranfrage"];
    expect([...list].sort(compareAbm)).toEqual(sorted);
    // derselbe Schlüssel für die Sortierung per Spaltenkopf (Zahl; ungültig = ans Ende)
    const byKey = [...list].sort((a, b) => (abmSortKey(a) ?? Infinity) - (abmSortKey(b) ?? Infinity));
    expect(byKey).toEqual(sorted);
    expect(abmSortKey("Bauvoranfrage")).toBeNull();
  });
});

describe("ABM-Nr.: Hausbaufirma aus dem Nummernkreis", () => {
  it("ordnet die drei Nummernkreise zu", () => {
    expect(companyForAbm("8161-1588", companies)?.name).toBe("Bien-Zenker");
    expect(companyForAbm("8185-633", companies)?.name).toBe("Schwabenhaus");
    expect(companyForAbm("8260-321", companies)?.name).toBe("Living Haus");
    expect(companyForAbm("9999-1", companies)).toBeNull();
    expect(companyForAbm("8161", companies)).toBeNull();
  });

  it("Firma fehlt: Vorschlag aus dem Nummernkreis", () => {
    const [h] = abmHints("8185-633", null, companies);
    expect(h.tone).toBe("info");
    expect(h.company?.id).toBe("sh");
  });

  it("unbekannter Nummernkreis: Warnung, kein Fehler", () => {
    const [h] = abmHints("9999-1", "bz", companies);
    expect(h.tone).toBe("warn");
    expect(h.text).toMatch(/9999 ist keiner Hausbaufirma zugeordnet/);
    expect(validateProjectFields({ bauherrLabel: "Meier", kind: "neubau", abmNr: "9999-1", hausbauNr: null, intakeMonth: null }, []).abmNr).toBeUndefined();
  });

  it("Nummer und Firma passen nicht zusammen: klar benannt, mit Vorschlag", () => {
    const [h] = abmHints("8161-1588", "lh", companies);
    expect(h.tone).toBe("warn");
    expect(h.text).toBe("ABM-Nr. und Hausbaufirma passen nicht zusammen: 8161 gehört zu Bien-Zenker, gewählt ist Living Haus (Nummernkreis 8260).");
    expect(h.company?.id).toBe("bz");
  });

  it("passend, leer oder ungültig: kein Hinweis", () => {
    expect(abmHints("8161-1588", "bz", companies)).toEqual([]);
    expect(abmHints("", "bz", companies)).toEqual([]);
    expect(abmHints("8161/1", "bz", companies)).toEqual([]);
  });
});

describe("ABM-Nr.: Dubletten", () => {
  const existing = [
    { id: "a", abmNr: "8185-633", bauherrLabel: "Scholz", status: "aktiv" },
    { id: "b", abmNr: "8260-041", bauherrLabel: "Engel", status: "aktiv" },
    { id: "c", abmNr: "8161-77", bauherrLabel: "Fuchs", status: "storno" },
  ] as Project[];
  const check = (abmNr: string) => validateProjectFields({ bauherrLabel: "Meier", kind: "neubau", abmNr, hausbauNr: null, intakeMonth: null }, existing).abmNr;

  it("vergebene Nummer wird abgelehnt, auch bei stornierten Projekten", () => {
    expect(check("8185-633")).toBe("Diese ABM-Nr. ist schon vergeben (Scholz).");
    expect(check("8161-77")).toBe("Diese ABM-Nr. ist schon vergeben (Fuchs, storniert).");
    expect(check("8185-634")).toBeUndefined();
  });

  it("vergleicht als Zahl: 8260-41 trifft die alte Schreibweise 8260-041", () => {
    expect(check("8260-41")).toMatch(/schon vergeben \(Engel\)/);
  });
});

describe("Nummernkreis in den Einstellungen", () => {
  it("genau vier Ziffern, eindeutig, leer heißt keiner", () => {
    expect(cleanPrefix(" 8300 ", "fh", companies)).toEqual({ ok: true, prefix: "8300" });
    expect(cleanPrefix("", "bz", companies)).toEqual({ ok: true, prefix: null });
    expect(cleanPrefix("830", "fh", companies)).toMatchObject({ ok: false, reason: expect.stringMatching(/vier Ziffern/) });
    expect(cleanPrefix("8161", "fh", companies)).toMatchObject({ ok: false, reason: "8161 ist schon Bien-Zenker zugeordnet." });
    expect(cleanPrefix("8161", "bz", companies)).toEqual({ ok: true, prefix: "8161" }); // eigener Wert bleibt erlaubt
  });
});
