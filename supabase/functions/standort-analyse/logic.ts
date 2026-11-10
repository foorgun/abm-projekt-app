// Reine Logik der Edge Function standort-analyse: Adresse aus dem Projekt, Zuordnung der Zonen, Lesen der Dienste, Cache-Fristen
// und der Ablauf einer Analyse. Ohne Importe, damit dieselbe Datei in Deno (Funktion) und in der App (Demo-Modus, vitest) läuft.
// Quellen, Lizenzen und Genauigkeit: docs/standort-analyse.md.

export const USER_AGENT = "ABM-Projekt-App/1.0 (Planungsprotokoll, Architekturbuero Ulm)";
export const TIMEOUT_MS = 12_000;
/** Höchstens so viele Analysen mit Abfragen an die Dienste je Person und Tag (Antworten aus dem Cache zählen nicht). */
export const MAX_ANALYSEN_PRO_TAG = 20;
/** Pause zwischen den Suchen einer Adresse (Photon bittet um faire Nutzung). */
export const SUCH_PAUSE_MS = 1_000;
/** Weiter darf der Mittelpunkt einer Gemeinde nicht vom Treffer entfernt sein, sonst ist es eine gleichnamige andere. */
export const MAX_GEMEINDE_KM = 35;

export const THEMEN = ["schneelast", "erdbeben", "hoehe", "radon", "wasserschutz", "hochwasser", "laerm", "strom"] as const;
export type Thema = (typeof THEMEN)[number];
export type Status = "ermittelt" | "nicht_ermittelbar" | "fehler";
export type Land = "BW" | "BY" | "HE";
export const LAENDER: Land[] = ["BW", "BY", "HE"];

export const THEMA_LABEL: Record<Thema, string> = {
  schneelast: "Schneelastzone",
  erdbeben: "Erdbebenzone",
  hoehe: "Geländehöhe über NN",
  radon: "Radonvorsorgegebiet",
  wasserschutz: "Wasserschutzgebiet",
  hochwasser: "Hochwassergefahr (HQ100)",
  laerm: "Lärmkartierung",
  strom: "Stromversorger",
};

const TAG = 24 * 60 * 60 * 1000;
/** Gültigkeit im Cache je Thema: Zonen ändern sich selten, Karten werden laufend fortgeschrieben. */
export const CACHE_TAGE: Record<Exclude<Thema, "strom"> | "geokodierung", number> = {
  geokodierung: 365,
  schneelast: 365,
  erdbeben: 365,
  hoehe: 365,
  radon: 180,
  wasserschutz: 28,
  hochwasser: 28,
  laerm: 90,
};

export interface Ergebnis {
  thema: Thema;
  status: Status;
  /** Wert für die Übernahme: bei Zonen der Wert des Ankreuzfelds, sonst Text. null, wenn nichts ermittelt wurde. */
  wert: string | null;
  /** Klartext für die Liste */
  anzeige: string | null;
  quelle: string | null;
  /** ISO-Zeit der Abfrage an der Quelle (bei Treffern aus dem Cache die ursprüngliche) */
  abgerufenAm: string | null;
  /** Warum kein Wert da ist */
  grund: string | null;
  /** Einschränkung des Werts */
  hinweis: string | null;
  /** Nur bei fehlendem Wert: Viewer als Notlösung */
  viewer: string | null;
  /** Bei "Alle übernehmen" vorausgewählt? Unsichere Werte müssen bewusst angehakt werden. */
  vorgewaehlt: boolean;
}

export type Genauigkeit = "haus" | "strasse" | "ort";

export interface StandortAntwort {
  ok: true;
  adresse: string;
  bundesland: Land;
  gemeinde: string | null;
  genauigkeit: Genauigkeit;
  ergebnisse: Ergebnis[];
}

export interface StandortFehler {
  ok: false;
  code: "forbidden" | "limit" | "fehlende_angaben" | "bundesland_nicht_unterstuetzt" | "adresse_nicht_gefunden" | "bundesland_passt_nicht" | "error";
  message: string;
  /** Bei fehlende_angaben: was fehlt und wo es einzutragen ist */
  fehlt?: string[];
}

// ---------------------------------------------------------------------------
// Adresse aus dem Projekt: nur Bauort und Bauadresse, nie die Anschrift des Bauherrn
// ---------------------------------------------------------------------------

export interface Projektangaben {
  bundesland?: string | null;
  location?: string | null;
  gemarkung?: string | null;
  siteStreet?: string | null;
  sitePostalCode?: string | null;
  siteCity?: string | null;
  siteState?: string | null;
  buildingAddress?: string | null;
}

export interface Anfrage {
  land: Land;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  gemarkung: string | null;
}

const text = (v: string | null | undefined): string => (v ?? "").replace(/\s+/g, " ").trim();

const LAND_NAMEN: Record<string, string> = {
  "baden-wuerttemberg": "BW", "bayern": "BY", "berlin": "BE", "brandenburg": "BB", "bremen": "HB", "hamburg": "HH", "hessen": "HE", "mecklenburg-vorpommern": "MV",
  "niedersachsen": "NI", "nordrhein-westfalen": "NW", "rheinland-pfalz": "RP", "saarland": "SL", "sachsen": "SN", "sachsen-anhalt": "ST", "schleswig-holstein": "SH", "thueringen": "TH",
};
const umlaute = (s: string) => s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

/** Kürzel des Bundeslands: am Projekt (Kürzel), sonst aus dem Freitext beim Bauort. */
export function bundeslandKuerzel(p: Projektangaben): string | null {
  const code = text(p.bundesland).toUpperCase();
  if (code) return code;
  const frei = umlaute(text(p.siteState).toLowerCase());
  if (!frei) return null;
  return LAND_NAMEN[frei] ?? (/^[a-z]{2}$/.test(frei) ? frei.toUpperCase() : null);
}

/** Straße, PLZ und Ort: getrennte Felder des Bauorts, sonst die Bauadresse, sonst das Feld Bauort. Fehlt etwas, nennt `fehlt` genau was. */
export function anfrageAusProjekt(p: Projektangaben): { anfrage: Anfrage | null; fehler: StandortFehler | null } {
  const bau = text(p.buildingAddress);
  const bauTeile = bau.match(/^(?:(.*?)[,\s]+)?(\d{5})\s+(.+)$/);
  const flurstueck = /^(flst|flurst|flur\b|gemarkung)/i;
  const ohneOrt = bauTeile ? text(bauTeile[1]?.replace(/,\s*$/, "")) : text(bau.split(",")[0]);
  const strasse = text(p.siteStreet) || (flurstueck.test(ohneOrt) ? "" : ohneOrt);
  const loc = text(p.location);
  const locTeile = loc.match(/^(\d{5})\s+(.+)$/);
  const plz = text(p.sitePostalCode).replace(/\s/g, "") || bauTeile?.[2] || locTeile?.[1] || "";
  const ort = text(p.siteCity) || bauTeile?.[3] || locTeile?.[2] || loc;

  const fehlt: string[] = [];
  const land = bundeslandKuerzel(p);
  if (!land) fehlt.push("Bundesland des Bauorts fehlt: bitte in der Übersicht bei „Projektdaten“ eintragen.");
  if (!ort && !plz) fehlt.push("Bauort fehlt: bitte in der Übersicht bei „Projektdaten“ als „PLZ Ort“ eintragen (z. B. „89073 Ulm“).");
  else if (plz && !/^\d{5}$/.test(plz)) fehlt.push(`Die PLZ des Bauorts („${plz}“) ist nicht fünfstellig: bitte in der Übersicht korrigieren.`);
  if (fehlt.length) return { anfrage: null, fehler: { ok: false, code: "fehlende_angaben", message: fehlt.join(" "), fehlt } };
  if (!LAENDER.includes(land as Land)) {
    return { anfrage: null, fehler: { ok: false, code: "bundesland_nicht_unterstuetzt", message: `Für dieses Bundesland (${land}) noch nicht verfügbar. Bisher: Baden-Württemberg, Bayern, Hessen.` } };
  }
  return { anfrage: { land: land as Land, strasse: strasse || null, plz: plz || null, ort: ort || null, gemarkung: text(p.gemarkung) || null }, fehler: null };
}

export const adresseText = (a: Anfrage): string => [a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");

// ---------------------------------------------------------------------------
// Zonen (Tabellen: zonen.ts)
// ---------------------------------------------------------------------------

export interface SchneeAusnahme { name: string; zone: string; teilweise?: boolean }
export interface SchneeKreis { name: string; zone: string; ausnahmen: SchneeAusnahme[] }
export interface SchneeLand { gemeinden: Record<string, string>; kreise: Record<string, SchneeKreis> }
export type ErdbebenEintrag = string | null | { g: string; z: string | null }[];
export interface Tabellen {
  SCHNEELAST: Record<Land, SchneeLand>;
  ERDBEBEN: Record<"BY" | "HE", Record<string, ErdbebenEintrag>>;
  ERDBEBEN_BY_KREISE: Record<string, string | null>;
  /** Gemeindeverzeichnis: Schlüssel, Name, Breite, Länge */
  GEMEINDEN: Record<Land, [string, string, number, number][]>;
}

/** Gemeindenamen vergleichbar machen: "Wangen i. Allgäu" = "Wangen im Allgäu", "Rot a. d. Rot" = "Rot an der Rot". */
export function nameSchluessel(s: string): string {
  return umlaute(s.toLowerCase())
    .replace(/\ba\.\s*d\.\s*/g, "an der ")
    .replace(/\bi\.\s*d\.\s*/g, "in der ")
    .replace(/\bi\.\s*/g, "im ")
    .replace(/\ba\.\s*/g, "am ")
    .replace(/\bst\.\s*/g, "sankt ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Gleicher Name, oder einer ist der Anfang des anderen ("Isny" = "Isny im Allgäu", "Lahr" = "Lahr/Schwarzwald"). */
export function nameGleich(a: string, b: string): boolean {
  const [x, y] = [nameSchluessel(a), nameSchluessel(b)];
  return !!x && !!y && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `));
}

/**
 * Trifft eine namentliche Ausnahme der Tabelle diese Gemeinde? Gleicher Name, oder die Tabelle nennt eine Kurzform ("Isny" für "Isny im
 * Allgäu"). Nie umgekehrt: Im Alb-Donau-Kreis gibt es "Altheim" und "Altheim (Alb)" mit verschiedenen Zonen.
 */
export function ausnahmeTrifft(ausnahme: string, gemeinde: string): boolean {
  const [x, y] = [nameSchluessel(ausnahme), nameSchluessel(gemeinde)];
  return !!x && (x === y || y.startsWith(`${x} `));
}

/** Gemeinden, deren Schlüssel sich nach Stand der DIBt-Tabellen geändert hat: Hanau ist seit 2026 kreisfrei. */
const AGS_IN_TABELLEN: Record<string, string> = { "06415000": "06435014" };

export type Zuordnung = { zone: string; unsicher?: string } | { zone: null; grund: string };

const SCHNEE_STAND = "DIBt, Zuordnung der Schneelastzonen nach Verwaltungsgrenzen (Stand 07.02.2023)";
const ERDBEBEN_STAND = "DIBt, Zuordnung der Erdbebenzonen (Stand 02.06.2022)";

export function schneelastZone(t: Tabellen, land: Land, agsAktuell: string, gemeinde: string): Zuordnung {
  const ags = AGS_IN_TABELLEN[agsAktuell] ?? agsAktuell;
  const tab = t.SCHNEELAST[land];
  const direkt = tab.gemeinden[ags];
  if (direkt) return { zone: direkt };
  const kreis = tab.kreise[ags.slice(0, 5)];
  if (!kreis) return { zone: null, grund: `Die DIBt-Tabelle nennt diese Gemeinde und diesen Kreis nicht (Schlüssel ${ags}).` };
  const treffer = kreis.ausnahmen.find((a) => ausnahmeTrifft(a.name, gemeinde));
  if (treffer?.teilweise) return { zone: treffer.zone, unsicher: `Gilt laut Tabelle nur für Teile von ${treffer.name}, sonst Zone ${kreis.zone}. Bitte prüfen.` };
  return { zone: treffer?.zone ?? kreis.zone };
}

/** Erdbebenzone. Bayern und Hessen führen sie je Gemarkung: ohne passende Gemarkung am Projekt wird bei gemischten Gemeinden nicht geraten. */
export function erdbebenZone(t: Tabellen, land: Land, agsAktuell: string, gemarkung: string | null): Zuordnung {
  const ags = AGS_IN_TABELLEN[agsAktuell] ?? agsAktuell;
  if (land === "BW") {
    return { zone: null, grund: "Baden-Württemberg verweist nur auf die amtliche Karte 1:350 000. Eine Tabelle oder einen offenen Dienst gibt es nicht (der LUBW-Datensatz ist zugangsgeschützt)." };
  }
  const eintrag = t.ERDBEBEN[land][ags];
  if (eintrag === undefined) {
    const kreis = land === "BY" ? t.ERDBEBEN_BY_KREISE[ags.slice(0, 5)] : undefined;
    if (kreis) return { zone: kreis };
    if (kreis === null) return { zone: null, grund: "Die Tabelle führt diesen Kreis als „alle außer …“ ohne Namen der Ausnahme." };
    return { zone: null, grund: `Die Gemeinde steht nicht in der DIBt-Tabelle (Schlüssel ${ags}).` };
  }
  if (typeof eintrag === "string") return { zone: eintrag };
  if (eintrag === null) return { zone: null, grund: "Die DIBt-Tabelle macht für diese Gemeinde keine Angabe („k. A.“)." };
  const passend = gemarkung ? eintrag.find((x) => nameGleich(x.g, gemarkung)) : undefined;
  if (passend?.z) return { zone: passend.z };
  const zonen = [...new Set(eintrag.map((x) => (x.z === null ? "keine Angabe" : x.z === "keine" ? "keine Zone" : `Zone ${x.z}`)))].sort().join(", ");
  return { zone: null, grund: gemarkung ? `Die Zone hängt von der Gemarkung ab (${zonen}), „${gemarkung}“ steht nicht in der Tabelle.` : `Die Zone hängt von der Gemarkung ab (${zonen}). Bitte die Gemarkung am Projekt eintragen und erneut ermitteln.` };
}

// Radonvorsorgegebiete nach § 121 StrlSchG: BW Liste des Umweltministeriums (Stand 15.06.2021), BY Allgemeinverfügung BayMBl. 2021 Nr. 63
// (Landkreis Wunsiedel i. Fichtelgebirge), Hessen hat laut BfS keine festgelegt.
const RADON_BW = new Set([
  "08315014", "08315056", "08315130", "08315084", "08315102", "08336004", "08336010", "08336025", "08336106", "08336107", "08336079", "08336080", "08336087", "08336089", "08336090",
  "08336094", "08336096", "08336103", "08317039", "08325036", "08325051", "08326055", "08337027", "08337045", "08337049", "08337059", "08337090", "08337097", "08337108",
]);
export const RADON_QUELLE: Record<Land, string> = {
  BW: "Umweltministerium BW, Liste der Radonvorsorgegebiete (Stand 15.06.2021)",
  BY: "StMUV Bayern, Allgemeinverfügung BayMBl. 2021 Nr. 63",
  HE: "BfS, Radon-Vorsorgegebiete in Deutschland (Hessen: keine festgelegt)",
};
export function radonvorsorgegebiet(land: Land, ags: string): boolean {
  if (land === "BW") return RADON_BW.has(ags);
  if (land === "BY") return ags.startsWith("09479");
  return false;
}

/** Zone aus dem Text der Kartendienste. "Zone III und IIIA" → 3, "Schutzzone II" → 2. Zone I und II zusammengefasst: nicht zu trennen, also null. */
export function wasserschutzZone(s: string | null | undefined): "1" | "2" | "3" | null {
  const t = text(s).toUpperCase();
  const zonen = [...t.matchAll(/\b(III|II|I)[A-C]?\b/g)].map((m) => m[1].length);
  const verschieden = [...new Set(zonen)];
  return verschieden.length === 1 ? (String(verschieden[0]) as "1" | "2" | "3") : null;
}

// ---------------------------------------------------------------------------
// Dienste: Adressen und Antworten lesen
// ---------------------------------------------------------------------------

const LUBW = "https://rips-gdi.lubw.baden-wuerttemberg.de/arcgis/services/wms";
const LFU = "https://www.lfu.bayern.de/gdi/wms";
const HLNUG = "https://geodienste-umwelt.hessen.de/arcgis/services/inspire";
const HE_LAERM = "https://umweltatlas.hessen.de/arcgis/rest/services/laerm/laerm_oden/MapServer/identify";
const BW_LAERM = "https://rips-gdi.lubw.baden-wuerttemberg.de/arcgis/rest/services/wfs/Umgebungslaermkartierung_Strassenenverkehrslaerm_24_Stunden/MapServer/0/query";
const BFS_WMS = "https://www.imis.bfs.de/ogc/opendata/wms";
const PHOTON = "https://photon.komoot.io/api/";
const HOEHE = "https://api.opentopodata.org/v1/eudem25m";

const KARTEN: Record<"wasserschutz" | "hochwasser", Record<Land, { url: string; layer: string; quelle: string }>> = {
  wasserschutz: {
    BW: { url: `${LUBW}/UIS_0100007500200036_AGGR/MapServer/WMSServer`, layer: "0", quelle: "LUBW, WMS Wasserschutzgebietszone" },
    BY: { url: `${LFU}/wasser/wsg`, layer: "twsg,hqsg", quelle: "Bayerisches Landesamt für Umwelt, www.lfu.bayern.de" },
    HE: { url: `${HLNUG}/bewirtschaftungsgebiete/MapServer/WmsServer`, layer: "TWS_HQS_ALK", quelle: "HLNUG, Bewirtschaftungsgebiete Hessen" },
  },
  hochwasser: {
    BW: { url: `${LUBW}/UIS_0100000003900001/MapServer/WMSServer`, layer: "0", quelle: "LUBW, WMS Überschwemmungsgebiet (HQ100-Gebiet)" },
    BY: { url: `${LFU}/wasser/ueberschwemmungsgebiete`, layer: "hwgf_hq100,hwgg_hq100", quelle: "Bayerisches Landesamt für Umwelt, www.lfu.bayern.de" },
    HE: { url: `${HLNUG}/gebiete_naturbedingter_risiken/MapServer/WmsServer`, layer: "Hochwasser_mit_mittlerer_Wahrscheinlichkeit,Ueberschwemmungsgebiete_HQ100_nach_HWG", quelle: "HLNUG, Gebiete naturbedingter Risiken Hessen" },
  },
};

const VIEWER: Record<Exclude<Thema, "hoehe">, Record<Land, string>> = {
  schneelast: { BW: "https://www.dlubal.com/de/loesungen/dienstleistungen/schneelastzonen", BY: "https://www.dlubal.com/de/loesungen/dienstleistungen/schneelastzonen", HE: "https://www.dlubal.com/de/loesungen/dienstleistungen/schneelastzonen" },
  erdbeben: {
    BW: "https://mlw.baden-wuerttemberg.de/de/bauen-wohnen/bautechnik-und-bauoekologie/erdbebensicher-bauen",
    BY: "https://www.umweltatlas.bayern.de",
    HE: "https://geoportal.hessen.de",
  },
  radon: { BW: "https://www.imis.bfs.de/geoportal/", BY: "https://www.imis.bfs.de/geoportal/", HE: "https://www.imis.bfs.de/geoportal/" },
  wasserschutz: { BW: "https://umweltdaten.lubw.baden-wuerttemberg.de", BY: "https://www.umweltatlas.bayern.de", HE: "https://umweltdaten.hessen.de" },
  hochwasser: { BW: "https://udo.lubw.baden-wuerttemberg.de/public/", BY: "https://www.umweltatlas.bayern.de", HE: "https://umweltdaten.hessen.de" },
  laerm: { BW: "https://udo.lubw.baden-wuerttemberg.de/public/", BY: "https://www.umweltatlas.bayern.de", HE: "https://laerm.hessen.de" },
  strom: { BW: "https://www.marktstammdatenregister.de/MaStR", BY: "https://www.marktstammdatenregister.de/MaStR", HE: "https://www.marktstammdatenregister.de/MaStR" },
};
export const viewerFuer = (thema: Thema, land: Land): string | null => (thema === "hoehe" ? null : VIEWER[thema][land]);

/** GetFeatureInfo am Punkt: kleiner Kartenausschnitt um den Standort, abgefragt wird das mittlere Pixel. */
export function featureInfoUrl(basis: string, layer: string, lat: number, lon: number, format = "text/xml"): string {
  const d = 0.0005;
  const q = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo", SRS: "EPSG:4326",
    BBOX: [lon - d, lat - d, lon + d, lat + d].map((x) => x.toFixed(6)).join(","),
    WIDTH: "101", HEIGHT: "101", X: "50", Y: "50", LAYERS: layer, QUERY_LAYERS: layer, STYLES: "", FORMAT: "image/png", INFO_FORMAT: format, FEATURE_COUNT: "10",
  });
  return `${basis}?${q}`;
}

export type Treffer = Record<string, string>;

/** Antwort eines ArcGIS-WMS (text/xml): je Treffer ein FIELDS-Element. Ohne das Wurzelelement ist die Antwort kein Ergebnis, sondern ein Fehler. */
export function featureInfoLesen(xml: string): Treffer[] | null {
  if (typeof xml !== "string" || !/<FeatureInfoResponse\b/.test(xml)) return null;
  return [...xml.matchAll(/<FIELDS\b([^>]*?)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([^\s=]+)="([^"]*)"/g)].map((a) => [a[1], a[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")])));
}

/** Abfrage der LUBW-Straßenlärmkarte am Punkt (ArcGIS-REST, Flächen je 5-dB-Stufe des LDEN). */
export function laermBwUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    f: "json", geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: "ART,DB_LOW,DB_HIGH", returnGeometry: "false",
  });
  return `${BW_LAERM}?${q}`;
}

/**
 * Antwort der LUBW-Straßenlärmkarte: höchste Pegelstufe am Punkt als { von, bis } in dB(A); keine Fläche: null.
 * Ohne features-Liste ist die Antwort kein Ergebnis, sondern ein Fehler (undefined).
 */
export function laermBwLesen(json: string): { von: number; bis: number } | null | undefined {
  let j: { features?: { attributes?: { ART?: string; DB_LOW?: number; DB_HIGH?: number } }[] };
  try {
    j = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!Array.isArray(j?.features)) return undefined;
  const stufen = j.features
    .map((f) => f.attributes)
    .filter((a): a is { ART?: string; DB_LOW: number; DB_HIGH: number } => !!a && typeof a.DB_LOW === "number" && typeof a.DB_HIGH === "number" && (!a.ART || /lden/i.test(a.ART)))
    .sort((x, y) => y.DB_LOW - x.DB_LOW);
  return stufen.length ? { von: stufen[0].DB_LOW, bis: stufen[0].DB_HIGH } : null;
}

/** Rasterwert eines Lärm-Layers (Attribut "Classify.Pixel…"). Kein Wert: null. */
export function pegelLesen(attribute: Treffer | undefined): number | null {
  if (!attribute) return null;
  const k = Object.keys(attribute).find((x) => /pixel/i.test(x));
  const n = k ? Number(attribute[k].replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const km = (lat1: number, lon1: number, lat2: number, lon2: number) => Math.hypot((lat1 - lat2) * 111, (lon1 - lon2) * 111 * Math.cos((lat1 * Math.PI) / 180));

/**
 * Gemeinde samt Schlüssel im amtlichen Verzeichnis: gleicher Name, bei gleichnamigen Gemeinden die nächstgelegene. Nur eine Kurzform
 * ("Lahr" für "Lahr/Schwarzwald") zählt, wenn sie eindeutig ist. Was zu weit weg liegt oder unklar bleibt, ergibt keinen Treffer.
 */
export function gemeindeFinden(t: Tabellen, land: Land, namen: (string | null | undefined)[], lat: number, lon: number): { ags: string; name: string } | null {
  const liste = t.GEMEINDEN[land];
  for (const name of namen) {
    const key = nameSchluessel(name ?? "");
    if (!key) continue;
    const genau = liste.filter((g) => nameSchluessel(g[1]) === key);
    const kurz = genau.length ? [] : liste.filter((g) => nameGleich(g[1], key));
    const auswahl = genau.length ? genau : kurz.length === 1 ? kurz : [];
    const naechste = [...auswahl].sort((x, y) => km(lat, lon, x[2], x[3]) - km(lat, lon, y[2], y[3]))[0];
    if (naechste && km(lat, lon, naechste[2], naechste[3]) <= MAX_GEMEINDE_KM) return { ags: naechste[0], name: naechste[1] };
  }
  return null;
}

export interface PhotonTreffer { lat: number; lon: number; hausnummer: string | null; strasse: string | null; plz: string | null; ort: string | null; land: string | null; bundesland: string | null }

/** Antwort von Photon lesen. Nicht lesbar: null (das ist ein Fehler, nicht "nichts gefunden"). */
export function photonLesen(roh: string): PhotonTreffer[] | null {
  let j: { features?: { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[] };
  try {
    j = JSON.parse(roh);
  } catch {
    return null;
  }
  if (!Array.isArray(j?.features)) return null;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return j.features.flatMap((f) => {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties ?? {};
    if (typeof lat !== "number" || typeof lon !== "number") return [];
    return [{ lat, lon, hausnummer: txt(p.housenumber), strasse: txt(p.street) ?? (p.osm_key === "highway" ? txt(p.name) : null), plz: txt(p.postcode), ort: txt(p.city), land: txt(p.countrycode), bundesland: txt(p.state) }];
  });
}

/** "Hauptstr. 12 a" → Straße und Nummer, beide vergleichbar. Ohne Nummer: nummer null. */
export function strasseTeilen(s: string): { strasse: string; nummer: string | null } {
  const t = text(s);
  const m = t.match(/^(.*\D)\s+(\d+\s*[a-z]?(?:\s*[-/]\s*\d*[a-z]?)?)$/i);
  const roh = m ? m[1] : t;
  return { strasse: nameSchluessel(roh.replace(/str\.?$/i, "strasse")), nummer: m ? m[2].replace(/\s+/g, "").toLowerCase() : null };
}

/** Passt der Treffer zur gesuchten Straße? "haus": Straße und Nummer, "strasse": nur die Straße. Photon sucht unscharf, deshalb diese Prüfung. */
export function trefferGuete(t: PhotonTreffer, a: Anfrage): "haus" | "strasse" | null {
  if (!a.strasse || !t.strasse) return null;
  const soll = strasseTeilen(a.strasse);
  if (strasseTeilen(t.strasse).strasse !== soll.strasse) return null;
  return soll.nummer && t.hausnummer?.replace(/\s+/g, "").toLowerCase() === soll.nummer ? "haus" : "strasse";
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

export interface Standort { lat: number; lon: number; genauigkeit: Genauigkeit; gemeinde: string | null; ags: string | null; bundesland: string | null; hinweis: string | null }

export interface Dienste {
  jetzt: () => Date;
  warten: (ms: number) => Promise<void>;
  /** Text einer URL. Wirft bei Zeitüberschreitung, Netzfehler oder HTTP-Fehler. */
  holen: (url: string) => Promise<string>;
  cacheLesen: (schluessel: string[], jetzt: Date) => Promise<Map<string, { wert: unknown; abgerufenAm: string }>>;
  cacheSchreiben: (eintrag: { schluessel: string; thema: string; wert: unknown; abgerufenAm: string; gueltigBis: string }) => Promise<void>;
  /** Liefert false, wenn das Tageslimit erreicht ist; sonst wird die Analyse gezählt. */
  limitZaehlen: () => Promise<boolean>;
  tabellen: Tabellen;
}

/** Teil des Cache-Schlüssels der Zonen: neue Tabellen gelten sofort, nicht erst nach Ablauf der Frist. */
export const ZONEN_VERSION = "2023-02-07-b";
const rund = (n: number) => n.toFixed(5);
export const adressSchluessel = (a: Anfrage) => `geokodierung|${nameSchluessel([a.strasse, a.plz, a.ort].filter(Boolean).join(" "))}`;
const themaSchluessel = (t: Thema, land: Land, s: Standort, gemarkung: string | null) =>
  t === "schneelast" || t === "erdbeben" || t === "radon" ? `${t}|${ZONEN_VERSION}|${land}|${s.ags ?? ""}|${t === "erdbeben" ? nameSchluessel(gemarkung ?? "") : ""}` : `${t}|${land}|${rund(s.lat)}|${rund(s.lon)}`;

function leer(thema: Thema, land: Land, status: Exclude<Status, "ermittelt">, grund: string): Ergebnis {
  return { thema, status, wert: null, anzeige: null, quelle: null, abgerufenAm: null, grund, hinweis: null, viewer: viewerFuer(thema, land), vorgewaehlt: false };
}

const nichtErreichbar = "Der Dienst hat nicht geantwortet oder einen Fehler gemeldet. Bitte später erneut versuchen.";

type Wertteil = Pick<Ergebnis, "wert" | "anzeige" | "quelle"> & { hinweis?: string | null; unsicher?: boolean };

/**
 * Geokodieren über Photon, höchstens drei Suchen: ganze Adresse, Straße ohne Nummer, Ort. Es zählt nur ein Treffer im Ort bzw. in der
 * PLZ des Projekts. Der Gemeindeschlüssel kommt aus dem amtlichen Verzeichnis.
 */
async function geokodieren(a: Anfrage, d: Dienste): Promise<Standort | null> {
  const ortsteil = [a.plz, a.ort].filter(Boolean).join(" ");
  const suche = async (q: string) => {
    const t = photonLesen(await d.holen(`${PHOTON}?${new URLSearchParams({ q, limit: "5", lang: "de" })}`));
    if (!t) throw new Error("Antwort nicht lesbar");
    // Im Ort des Projekts: gleiche PLZ oder gleicher Ort (ein Ort kann mehrere PLZ haben)
    return t.filter((x) => (!x.land || x.land === "DE") && ((a.plz && x.plz === a.plz) || (a.ort && x.ort && nameGleich(x.ort, a.ort))));
  };
  let treffer: PhotonTreffer | undefined;
  let genauigkeit: Genauigkeit = "ort";
  let hinweis: string | null = null;
  if (a.strasse) {
    const erste = await suche(`${a.strasse} ${ortsteil}`);
    const haus = erste.find((x) => trefferGuete(x, a) === "haus");
    let strasse = erste.find((x) => trefferGuete(x, a) === "strasse");
    if (!haus && !strasse) {
      await d.warten(SUCH_PAUSE_MS);
      strasse = (await suche(`${strasseTeilen(a.strasse).strasse} ${ortsteil}`)).find((x) => trefferGuete(x, a) !== null);
    }
    treffer = haus ?? strasse;
    if (treffer) genauigkeit = haus ? "haus" : "strasse";
    else hinweis = `Die Straße „${a.strasse}“ wurde nicht gefunden, verwendet wurde der Ort.`;
    if (!treffer) await d.warten(SUCH_PAUSE_MS);
  }
  treffer ??= (await suche(ortsteil))[0];
  if (!treffer) return null;
  if (a.plz && treffer.plz && treffer.plz !== a.plz && genauigkeit === "haus") {
    genauigkeit = "strasse";
    hinweis = `Gefunden wurde die PLZ ${treffer.plz} statt ${a.plz}. Bitte die Adresse prüfen.`;
  }
  const g = gemeindeFinden(d.tabellen, a.land, [treffer.ort, a.ort], treffer.lat, treffer.lon);
  return { lat: treffer.lat, lon: treffer.lon, genauigkeit, gemeinde: g?.name ?? treffer.ort, ags: g?.ags ?? null, bundesland: treffer.bundesland, hinweis };
}

async function karteAbfragen(thema: "wasserschutz" | "hochwasser", land: Land, s: Standort, d: Dienste): Promise<Wertteil> {
  const k = KARTEN[thema][land];
  const treffer = featureInfoLesen(await d.holen(featureInfoUrl(k.url, k.layer, s.lat, s.lon)));
  if (!treffer) throw new Error(`${thema}: Antwort nicht lesbar`);
  if (thema === "hochwasser") {
    const name = treffer.map((x) => x["Gewässername"] || x.GEWAESSER || x.BEMERKUNG_LUBW).find(Boolean);
    return treffer.length
      ? { wert: "ja", anzeige: `Im HQ100-Gebiet${name ? ` (${name.replace(/_/g, ", ")})` : ""}`, quelle: k.quelle }
      : { wert: "nein", anzeige: "Nicht im kartierten HQ100-Gebiet", quelle: k.quelle, hinweis: "Kartiert sind nur die untersuchten Gewässer, Starkregen ist nicht erfasst." };
  }
  if (!treffer.length) return { wert: "keine", anzeige: "Kein Wasserschutzgebiet am Standort", quelle: k.quelle };
  const name = treffer.map((x) => x.Gebietsname || x.WSG_KURZNAME || x.WSG).find(Boolean);
  const zonen = [...new Set(treffer.map((x) => x.ZONE).filter(Boolean))];
  const zone = zonen.length === 1 ? wasserschutzZone(zonen[0]) : null;
  const titel = `Wasserschutzgebiet${name ? ` ${name.trim().replace(/^WSG\s+/i, "").replace(/\s+,/g, ",")}` : ""}`;
  if (zone) return { wert: zone, anzeige: `${titel}, Zone ${["I", "II", "III"][Number(zone) - 1]}`, quelle: k.quelle };
  return { wert: "gebiet", anzeige: titel, quelle: k.quelle, hinweis: zonen.length ? `Zonenangabe der Quelle: ${zonen.join(", ")}. Die genaue Zone bitte wählen.` : "Die Quelle nennt keine Zone. Die genaue Zone bitte wählen (Auskunft: Kreisverwaltungsbehörde)." };
}

async function laermAbfragen(land: Land, s: Standort, d: Dienste): Promise<Wertteil> {
  const fmt = (n: number) => `${Math.round(n)} dB(A)`;
  if (land === "BW") {
    const quelle = "LUBW, Umgebungslärmkartierung Straßenverkehr (2022)";
    const hinweis = "Kartiert sind nur Hauptverkehrsstraßen; für große Städte wie Ulm und Stuttgart enthält der Dienst keine Werte, dann den Viewer der Stadt nutzen. Kein Ersatz für den Lärmpegelbereich nach DIN 4109, deshalb kein Eintrag im PDF.";
    const stufe = laermBwLesen(await d.holen(laermBwUrl(s.lat, s.lon)));
    if (stufe === undefined) throw new Error("laerm: Antwort nicht lesbar");
    if (!stufe) return { wert: "Kein kartierter Pegel", anzeige: "Kein kartierter Straßenlärm am Standort", quelle, hinweis };
    const v = stufe.bis >= 99 ? `LDEN über ${stufe.von} dB(A)` : `LDEN ${stufe.von} bis ${stufe.bis} dB(A)`;
    return { wert: `Straße ${v}`, anzeige: `Straße: ${v}`, quelle, hinweis };
  }
  if (land === "BY") {
    const quelle = "Bayerisches Landesamt für Umwelt, www.lfu.bayern.de (Umgebungslärmkartierung 2022)";
    const url = `${LFU}/laerm/hauptverkehrsstrassen`;
    const hinweis = "Kartiert sind nur Hauptverkehrsstraßen außerhalb der Ballungsräume. Kein Ersatz für den Lärmpegelbereich nach DIN 4109, deshalb kein Eintrag im PDF.";
    const [den, night] = await Promise.all(["mroadbylden2022", "mroadbyln2022"].map(async (l) => {
      const t = featureInfoLesen(await d.holen(featureInfoUrl(url, l, s.lat, s.lon)));
      if (!t) throw new Error("laerm: Antwort nicht lesbar");
      return pegelLesen(t[0]);
    }));
    if (den === null && night === null) return { wert: "Kein kartierter Pegel", anzeige: "Kein kartierter Straßenlärm am Standort", quelle, hinweis };
    const v = [den !== null && `LDEN ${fmt(den)}`, night !== null && `LNight ${fmt(night)}`].filter(Boolean).join(", ");
    return { wert: `Straße ${v}`, anzeige: `Straße: ${v}`, quelle, hinweis };
  }
  // Hessen: "PLUS"-Kartierung 2022 mit weitgehend allen Straßen
  const q = new URLSearchParams({
    f: "json", geometry: `${s.lon},${s.lat}`, geometryType: "esriGeometryPoint", sr: "4326", layers: "all:0,1,2,5,6,7", tolerance: "0",
    mapExtent: [s.lon - 0.01, s.lat - 0.01, s.lon + 0.01, s.lat + 0.01].join(","), imageDisplay: "400,400,96", returnGeometry: "false",
  });
  const j = JSON.parse(await d.holen(`${HE_LAERM}?${q}`)) as { results?: { layerName?: string; attributes?: Treffer }[] };
  if (!Array.isArray(j.results)) throw new Error("laerm: Antwort nicht lesbar");
  const pegel = (art: string, tag: string) => pegelLesen(j.results!.find((r) => r.layerName?.includes(art) && r.layerName.endsWith(tag))?.attributes);
  const teile = ([["Strassen", "Straße"], ["Schiene", "Schiene"], ["Grossflughafen", "Flughafen"]] as const).flatMap(([art, name]) => {
    const [den, night] = [pegel(art, "LDEN"), pegel(art, "LNight")];
    return den === null && night === null ? [] : [`${name} ${[den !== null && `LDEN ${fmt(den)}`, night !== null && `LNight ${fmt(night)}`].filter(Boolean).join(", ")}`];
  });
  const quelle = "HLNUG, Umgebungslärmkartierung 2022 (Hessen)";
  const hinweis = "Kein Ersatz für den Lärmpegelbereich nach DIN 4109, deshalb kein Eintrag im PDF.";
  return teile.length ? { wert: teile.join("; "), anzeige: teile.join("; "), quelle, hinweis } : { wert: "Kein kartierter Pegel", anzeige: "Kein kartierter Lärm am Standort", quelle, hinweis };
}

async function radonAbfragen(land: Land, s: Standort, d: Dienste): Promise<Wertteil> {
  const ja = radonvorsorgegebiet(land, s.ags!);
  let bodenluft: string | null = null;
  try {
    const j = JSON.parse(await d.holen(featureInfoUrl(BFS_WMS, "opendata:radon222_boden_rfv_risikokommunikation", s.lat, s.lon, "application/json"))) as { features?: { properties?: { rn_max?: number } }[] };
    const n = j.features?.[0]?.properties?.rn_max;
    if (typeof n === "number") bodenluft = `Radon-222 in der Bodenluft laut BfS-Rasterkarte: ${String(n).replace(".", ",")} kBq/m³ (Übersichtswert, keine Messung am Grundstück).`;
  } catch {
    // Die Bodenluft ist nur eine Zusatzangabe: die Festlegung des Vorsorgegebiets steht auch ohne sie fest
    bodenluft = "Der Wert für Radon in der Bodenluft war gerade nicht abrufbar.";
  }
  return { wert: ja ? "ja" : "nein", anzeige: ja ? "Radonvorsorgegebiet" : "Kein Radonvorsorgegebiet", quelle: RADON_QUELLE[land], hinweis: bodenluft };
}

async function hoeheAbfragen(s: Standort, d: Dienste): Promise<Wertteil> {
  const j = JSON.parse(await d.holen(`${HOEHE}?locations=${s.lat},${s.lon}`)) as { status?: string; results?: { elevation?: number | null }[] };
  const h = j.results?.[0]?.elevation;
  if (j.status !== "OK" || typeof h !== "number") throw new Error("hoehe: Antwort nicht lesbar");
  return { wert: `${Math.round(h)} m`, anzeige: `etwa ${Math.round(h)} m ü. NN`, quelle: "EU-DEM 25 m (Copernicus), über Open Topo Data", hinweis: "Gelände-Übersichtswert (±7 m oder mehr), kein Vermesserwert. Deshalb kein Eintrag bei „Höhe über NN“ im PDF." };
}

/** Eine Analyse. Fehler einzelner Themen betreffen nur diese Themen und werden nie gespeichert. */
export async function analysieren(a: Anfrage, d: Dienste): Promise<StandortAntwort | StandortFehler> {
  const jetzt = d.jetzt();
  const iso = jetzt.toISOString();
  const land = a.land;
  const gueltigBis = (t: keyof typeof CACHE_TAGE) => new Date(jetzt.getTime() + CACHE_TAGE[t] * TAG).toISOString();

  // Das Limit zählt jede Analyse, die Dienste abfragt, einmal
  let gezaehlt = false;
  const limitPruefen = async () => {
    if (gezaehlt) return true;
    gezaehlt = await d.limitZaehlen();
    return gezaehlt;
  };
  const limitFehler: StandortFehler = { ok: false, code: "limit", message: `Für heute sind die ${MAX_ANALYSEN_PRO_TAG} Analysen aufgebraucht. Morgen wieder, oder bitte von Hand eintragen.` };

  const adrKey = adressSchluessel(a);
  const adrCache = await d.cacheLesen([adrKey], jetzt);
  let standort = adrCache.get(adrKey)?.wert as Standort | undefined;
  if (!standort) {
    if (!(await limitPruefen())) return limitFehler;
    let neu: Standort | null;
    try {
      neu = await geokodieren(a, d);
    } catch (e) {
      const grund = e instanceof Error ? e.message : "unbekannt";
      console.error(`standort-analyse: Geokodierung: ${grund}`);
      return { ok: false, code: "error", message: `Die Adresssuche (Photon, OpenStreetMap) ist gerade nicht erreichbar (${grund}). Bitte später erneut versuchen.` };
    }
    if (!neu) return { ok: false, code: "adresse_nicht_gefunden", message: `Die Adresse „${adresseText(a)}“ wurde nicht gefunden. Bitte Bauort und Bauadresse in der Übersicht prüfen.` };
    standort = neu;
    await d.cacheSchreiben({ schluessel: adrKey, thema: "geokodierung", wert: standort, abgerufenAm: iso, gueltigBis: gueltigBis("geokodierung") });
  }
  const s = standort;
  const gefunden = s.bundesland ? LAND_NAMEN[umlaute(s.bundesland.toLowerCase())] : null;
  if (gefunden && gefunden !== land) {
    return { ok: false, code: "bundesland_passt_nicht", message: `Die Adresse liegt laut Adresssuche in ${s.bundesland}, am Projekt steht ${land}. Bitte Bundesland und Bauort prüfen.` };
  }

  const keys = Object.fromEntries(THEMEN.filter((t) => t !== "strom").map((t) => [t, themaSchluessel(t, land, s, a.gemarkung)])) as Record<Exclude<Thema, "strom">, string>;
  const cache = await d.cacheLesen(Object.values(keys), jetzt);

  const ausCache = (thema: Thema, key: string): Ergebnis | null => {
    const c = cache.get(key);
    if (!c) return null;
    const w = c.wert as Wertteil;
    return { thema, status: "ermittelt", wert: w.wert, anzeige: w.anzeige, quelle: w.quelle, abgerufenAm: c.abgerufenAm, grund: null, hinweis: w.hinweis ?? null, viewer: null, vorgewaehlt: !w.unsicher };
  };
  const speichern = async (thema: Exclude<Thema, "strom">, w: Wertteil): Promise<Ergebnis> => {
    await d.cacheSchreiben({ schluessel: keys[thema], thema, wert: w, abgerufenAm: iso, gueltigBis: gueltigBis(thema) });
    return { thema, status: "ermittelt", wert: w.wert, anzeige: w.anzeige, quelle: w.quelle, abgerufenAm: iso, grund: null, hinweis: w.hinweis ?? null, viewer: null, vorgewaehlt: !w.unsicher };
  };
  /** Ein Thema mit Dienstabfrage: Cache, sonst Abfrage. Fehler bleiben beim Thema. */
  const mitDienst = async (thema: Exclude<Thema, "strom">, abfrage: () => Promise<Wertteil>): Promise<Ergebnis> => {
    const c = ausCache(thema, keys[thema]);
    if (c) return c;
    try {
      return await speichern(thema, await abfrage());
    } catch (e) {
      console.error(`standort-analyse: ${thema}: ${e instanceof Error ? e.message : "Fehler"}`);
      return leer(thema, land, "fehler", nichtErreichbar);
    }
  };

  const zonenErgebnis = async (thema: "schneelast" | "erdbeben"): Promise<Ergebnis> => {
    if (!s.ags) return leer(thema, land, "nicht_ermittelbar", `Die Gemeinde „${s.gemeinde ?? a.ort ?? ""}“ steht so nicht im amtlichen Gemeindeverzeichnis. Bitte den Bauort prüfen.`);
    const c = ausCache(thema, keys[thema]);
    if (c) return c;
    const z = thema === "schneelast" ? schneelastZone(d.tabellen, land, s.ags, s.gemeinde ?? "") : erdbebenZone(d.tabellen, land, s.ags, a.gemarkung);
    if (z.zone === null) return leer(thema, land, "nicht_ermittelbar", z.grund);
    const unsicher = "unsicher" in z ? z.unsicher : undefined;
    const by = thema === "schneelast" && land === "BY" ? "Das DIBt verweist für Bayern zusätzlich auf ein DWD-Forschungsprojekt zu Schneelastzonen." : null;
    const ohneFeld = thema === "schneelast" && (z.zone === "3a" || z.zone === ">3a") ? `Für Zone ${z.zone} gibt es in den Vorlagen kein Ankreuzfeld. Bitte im PDF von Hand vermerken.` : null;
    const hinweis = [unsicher, ohneFeld, by].filter(Boolean).join(" ") || null;
    const w: Wertteil = {
      wert: z.zone,
      anzeige: z.zone === "keine" ? "Keine Erdbebenzone" : `Zone ${z.zone}`,
      quelle: thema === "schneelast" ? SCHNEE_STAND : ERDBEBEN_STAND,
      hinweis,
      ...(unsicher ? { unsicher: true } : {}),
    };
    return speichern(thema, w);
  };

  const braucht = (thema: Exclude<Thema, "strom">) => !cache.has(keys[thema]);
  const genau = s.genauigkeit !== "ort";
  const punkt = (thema: "wasserschutz" | "hochwasser" | "laerm" | "hoehe") => (genau ? braucht(thema) : false);
  // Radon braucht den Gemeindeschlüssel
  const dienstNoetig = punkt("wasserschutz") || punkt("hochwasser") || punkt("hoehe") || punkt("laerm") || (!!s.ags && braucht("radon"));
  if (dienstNoetig && !(await limitPruefen())) return limitFehler;

  const nurOrt = (thema: Thema) => leer(thema, land, "nicht_ermittelbar", a.strasse ? "Die Adresse wurde nur auf Ortsebene gefunden. Für diese Abfrage braucht es den genauen Standort." : "Es ist keine Straße eingetragen. Für diese Abfrage braucht es den genauen Standort. Bitte die Bauadresse ergänzen.");
  const ergebnisse: Ergebnis[] = await Promise.all([
    zonenErgebnis("schneelast"),
    zonenErgebnis("erdbeben"),
    genau ? mitDienst("hoehe", () => hoeheAbfragen(s, d)) : nurOrt("hoehe"),
    s.ags ? mitDienst("radon", () => radonAbfragen(land, s, d)) : leer("radon", land, "nicht_ermittelbar", `Die Gemeinde „${s.gemeinde ?? a.ort ?? ""}“ steht so nicht im amtlichen Gemeindeverzeichnis. Bitte den Bauort prüfen.`),
    genau ? mitDienst("wasserschutz", () => karteAbfragen("wasserschutz", land, s, d)) : nurOrt("wasserschutz"),
    genau ? mitDienst("hochwasser", () => karteAbfragen("hochwasser", land, s, d)) : nurOrt("hochwasser"),
    genau ? mitDienst("laerm", () => laermAbfragen(land, s, d)) : nurOrt("laerm"),
    leer("strom", land, "nicht_ermittelbar", "Es gibt keine amtliche, frei nutzbare Zuordnung von Standort zu Netzbetreiber. Das Marktstammdatenregister führt die Betreiber, aber keine Netzgebiete."),
  ]);

  // Nur auf Straßenebene gefunden: Kartenwerte nicht vorauswählen
  const ungenau = s.genauigkeit === "strasse";
  const fertig = ergebnisse.map((e) =>
    ungenau && e.status === "ermittelt" && ["hoehe", "wasserschutz", "hochwasser", "laerm"].includes(e.thema)
      ? { ...e, vorgewaehlt: false, hinweis: [s.hinweis ?? "Die Hausnummer wurde nicht gefunden, der Standort ist nur auf die Straße genau.", e.hinweis].filter(Boolean).join(" ") }
      : e,
  );
  return { ok: true, adresse: adresseText(a), bundesland: land, gemeinde: s.gemeinde, genauigkeit: s.genauigkeit, ergebnisse: fertig };
}

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

/** Beginn des Tages (UTC) für das Tageslimit. */
export function tagesbeginn(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Projekt-ID prüfen, bevor etwas nachgeschlagen wird. */
export function parseProjektId(body: unknown): string | null {
  const id = (body as { projectId?: unknown } | null)?.projectId;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}
