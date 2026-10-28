import { describe, expect, it } from "vitest";
import { BUNDESLAENDER, bundeslandFromPlz, bundeslandFromText, isBundesland, ortLabel, suggestBundesland } from "./bundesland";

describe("Bundesland", () => {
  it("16 Länder mit Kürzel", () => {
    expect(BUNDESLAENDER).toHaveLength(16);
    expect(new Set(BUNDESLAENDER.map((b) => b.code)).size).toBe(16);
    expect(isBundesland("BW")).toBe(true);
    expect(isBundesland("XX")).toBe(false);
  });

  it("Anzeige 'Bundesland - Bauort'", () => {
    expect(ortLabel("BW", "Stuttgart")).toBe("BW - Stuttgart");
    expect(ortLabel(null, "Stuttgart")).toBe("Stuttgart");
    expect(ortLabel("BY", null)).toBe("BY");
    expect(ortLabel(null, "  ")).toBeNull();
  });

  it("Kürzel aus Landesname oder Kürzel", () => {
    expect(bundeslandFromText("Baden-Württemberg")).toBe("BW");
    expect(bundeslandFromText("baden württemberg")).toBe("BW");
    expect(bundeslandFromText("by")).toBe("BY");
    expect(bundeslandFromText("NRW")).toBe("NW");
    expect(bundeslandFromText("Schwaben")).toBeNull();
  });

  it("Vorschlag aus der PLZ, mit Ausnahmen an der Grenze bei Ulm", () => {
    expect(bundeslandFromPlz("70173")).toBe("BW"); // Stuttgart
    expect(bundeslandFromPlz("75173 Pforzheim")).toBe("BW");
    expect(bundeslandFromPlz("89073")).toBe("BW"); // Ulm
    expect(bundeslandFromPlz("89231")).toBe("BY"); // Neu-Ulm
    expect(bundeslandFromPlz("80331")).toBe("BY"); // München
    expect(bundeslandFromPlz("10115")).toBe("BE");
    expect(bundeslandFromPlz("Ulm")).toBeNull();
  });

  it("Projekt-Vorschlag: erst Landesname beim Bauort, dann PLZ des Bauorts, dann PLZ im Feld Bauort", () => {
    expect(suggestBundesland({ siteState: "Bayern", sitePostalCode: "89073" })).toBe("BY");
    expect(suggestBundesland({ sitePostalCode: "89073", location: "80331 München" })).toBe("BW");
    expect(suggestBundesland({ location: "80331 München" })).toBe("BY");
    expect(suggestBundesland({ location: "Ulm" })).toBeNull();
  });
});
