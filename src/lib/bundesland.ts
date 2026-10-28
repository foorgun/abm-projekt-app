// Bundesland des Bauorts: Kürzel (BW, BY, …), Vorbelegung aus der PLZ oder einem ausgeschriebenen Landesnamen,
// Anzeige "BW - Stuttgart" wie in der Excel-Spalte "Bundesland - Bauort". Reine Funktionen (getestet).
// Das Feld ist nie Pflicht; die Vorbelegung ist nur ein Vorschlag (PLZ-Gebiete folgen nicht genau den Landesgrenzen).

export const BUNDESLAENDER = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
] as const;

export type BundeslandCode = (typeof BUNDESLAENDER)[number]["code"];

const CODES = new Set<string>(BUNDESLAENDER.map((b) => b.code));

export function isBundesland(v: string | null | undefined): v is BundeslandCode {
  return Boolean(v && CODES.has(v));
}

export function bundeslandName(code: string | null | undefined): string | null {
  return BUNDESLAENDER.find((b) => b.code === code)?.name ?? null;
}

/** Kürzel aus Kürzel oder Landesname ("Baden-Württemberg", "baden württemberg", "NRW"). Sonst null. */
export function bundeslandFromText(text: string | null | undefined): BundeslandCode | null {
  const t = text?.trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (up === "NRW") return "NW";
  if (CODES.has(up)) return up as BundeslandCode;
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");
  return BUNDESLAENDER.find((b) => norm(b.name) === norm(t))?.code ?? null;
}

// Leitregionen (erste zwei Ziffern) → überwiegendes Bundesland. Ausnahmen mit drei Ziffern gehen vor
// (u. a. Neu-Ulm/Günzburg 892–894 in Bayern, Ulm 890/891 in Baden-Württemberg).
const PLZ2: Record<string, BundeslandCode> = {
  "01": "SN", "02": "SN", "03": "BB", "04": "SN", "06": "ST", "07": "TH", "08": "SN", "09": "SN",
  "10": "BE", "12": "BE", "13": "BE", "14": "BB", "15": "BB", "16": "BB", "17": "MV", "18": "MV", "19": "MV",
  "20": "HH", "21": "NI", "22": "HH", "23": "SH", "24": "SH", "25": "SH", "26": "NI", "27": "NI", "28": "HB", "29": "NI",
  "30": "NI", "31": "NI", "32": "NW", "33": "NW", "34": "HE", "35": "HE", "36": "HE", "37": "NI", "38": "NI", "39": "ST",
  "40": "NW", "41": "NW", "42": "NW", "44": "NW", "45": "NW", "46": "NW", "47": "NW", "48": "NW", "49": "NI",
  "50": "NW", "51": "NW", "52": "NW", "53": "NW", "54": "RP", "55": "RP", "56": "RP", "57": "NW", "58": "NW", "59": "NW",
  "60": "HE", "61": "HE", "63": "HE", "64": "HE", "65": "HE", "66": "SL", "67": "RP", "68": "BW", "69": "BW",
  "70": "BW", "71": "BW", "72": "BW", "73": "BW", "74": "BW", "75": "BW", "76": "BW", "77": "BW", "78": "BW", "79": "BW",
  "80": "BY", "81": "BY", "82": "BY", "83": "BY", "84": "BY", "85": "BY", "86": "BY", "87": "BY", "88": "BW", "89": "BW",
  "90": "BY", "91": "BY", "92": "BY", "93": "BY", "94": "BY", "95": "BY", "96": "BY", "97": "BY", "98": "TH", "99": "TH",
};
const PLZ3: Record<string, BundeslandCode> = {
  "637": "BY", "638": "BY", "639": "BY",
  "686": "HE",
  "892": "BY", "893": "BY", "894": "BY",
  "275": "HB",
};

/** Vorschlag aus einer fünfstelligen PLZ, oder null. */
export function bundeslandFromPlz(plz: string | null | undefined): BundeslandCode | null {
  const m = plz?.match(/\b(\d{5})\b/);
  if (!m) return null;
  return PLZ3[m[1].slice(0, 3)] ?? PLZ2[m[1].slice(0, 2)] ?? null;
}

/**
 * Vorschlag für ein Projekt: erst ein Landesname beim Bauort (Bauherr), dann die PLZ des Bauorts (Bauherr oder im Feld
 * "Bauort", z. B. "75173 Pforzheim"). Ohne Anhaltspunkt null.
 */
export function suggestBundesland(src: { siteState?: string | null; sitePostalCode?: string | null; location?: string | null }): BundeslandCode | null {
  return bundeslandFromText(src.siteState) ?? bundeslandFromPlz(src.sitePostalCode) ?? bundeslandFromPlz(src.location);
}

/** Anzeige der Spalte "Bundesland - Bauort": "BW - Stuttgart", "BW", "Stuttgart" oder null (leer). */
export function ortLabel(bundesland: string | null | undefined, location: string | null | undefined): string | null {
  const parts = [bundesland?.trim(), location?.trim()].filter(Boolean);
  return parts.length ? parts.join(" - ") : null;
}
