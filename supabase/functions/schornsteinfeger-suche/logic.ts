// Reine Logik der Edge Function schornsteinfeger-suche: Eingabeprüfung, Straßen- und Hausnummern-Normalisierung,
// Hausnummern-Abgleich und die Parser für die Antworten der Fegersuche des Landesinnungsverbands BW.
// Ohne Importe, damit dieselbe Datei in Deno (Funktion) und in der App (Vorschlag, Demo-Modus, vitest) läuft.
// Die App bindet sie über src/lib/planungsprotokoll/schornsteinfeger.ts ein.

export const QUELLE_URL = "https://schornsteinfeger-liv-baden-wuerttemberg.de/wp-content/plugins/fegersuche/ajxloader.php";
export const QUELLE_LABEL = "Landesinnungsverband BW";
export const USER_AGENT = "ABM-App (Planungsprotokoll)";
export const TIMEOUT_MS = 10_000;
/** Gültigkeit des Zwischenspeichers für Treffer und Details */
export const CACHE_TAGE = 90;
/** "nicht_gefunden" gilt nur kurz (neue Straßen, Tippfehler der Quelle); "quelle_nicht_erreichbar" wird nie gespeichert */
export const CACHE_NICHT_GEFUNDEN_STUNDEN = 24;
/** Höchstens so viele Abrufe an der Quelle je Person und Tag (Treffer aus dem Zwischenspeicher zählen nicht) */
export const MAX_ABRUFE_PRO_TAG = 30;

// ---------------------------------------------------------------------------
// Typen (Antwort der Funktion; die App nutzt dieselben)
// ---------------------------------------------------------------------------

export type Passt = "ja" | "nein" | "unsicher";
export type SuchStatus = "eindeutig" | "mehrdeutig" | "ohne_hausnummer" | "nicht_gefunden" | "quelle_nicht_erreichbar";

/** Ein Kehrbezirk einer Straße, wie ihn die Quelle liefert (Rohdaten im Zwischenspeicher). */
export interface Bezirk {
  bezirk: string;
  name: string;
  bsmId: string;
  /** Hausnummern, kommagetrennt wie in der Quelle */
  hnr: string;
}

/** Eine Straße (Zeile der Trefferliste). `bezirke` = null: die Quelle nennt für diese Zeile keine Bezirke. */
export interface Treffer {
  strasse: string;
  ortsteil: string | null;
  plz: string;
  ort: string | null;
  bezirke: Bezirk[] | null;
}

export interface Kandidat {
  name: string;
  bsmId: string;
  bezirk: string;
  strasse: string;
  ortsteil: string | null;
  passt: Passt;
}

export interface SuchAntwort {
  ok: true;
  status: SuchStatus;
  kandidaten: Kandidat[];
  /** Erklärung für die Oberfläche (z. B. warum nichts gefunden wurde) */
  meldung: string | null;
  /** Wonach tatsächlich gesucht wurde (nach Normalisierung bzw. Rückfall auf den Namensanfang) */
  suchbegriff: string;
}

export interface Details {
  name: string;
  plz_ort: string | null;
  strasse: string | null;
  email: string | null;
  tel: string | null;
  mobil: string | null;
  fax: string | null;
  innung: string | null;
}

export interface DetailAntwort {
  ok: true;
  details: Details;
}

export interface Fehler {
  ok: false;
  code: "forbidden" | "limit" | "quelle_nicht_erreichbar" | "nicht_lesbar" | "error";
  message: string;
}

export type Anfrage = { art: "suche"; plz: string; strasse: string; hausnummer: string | null } | { art: "details"; bsmId: string };

// ---------------------------------------------------------------------------
// Eingabe
// ---------------------------------------------------------------------------

const text = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function parseAnfrage(body: unknown): { ok: true; anfrage: Anfrage } | Fehler {
  const bad = (message: string): Fehler => ({ ok: false, code: "error", message });
  if (!body || typeof body !== "object") return bad("Ungültiger Aufruf.");
  const b = body as Record<string, unknown>;
  if (b.art === "details") {
    const bsmId = text(b.bsmId);
    if (!/^\d{1,10}$/.test(bsmId)) return bad("Ungültige Kennung des Schornsteinfegers.");
    return { ok: true, anfrage: { art: "details", bsmId } };
  }
  if (b.art !== "suche") return bad("Ungültiger Aufruf.");
  const plz = text(b.plz);
  const strasse = text(b.strasse);
  const hausnummer = text(b.hausnummer);
  if (!/^\d{5}$/.test(plz)) return bad("Die PLZ muss fünfstellig sein.");
  if (strasse.length < 2 || strasse.length > 100) return bad("Bitte eine Straße angeben.");
  if (hausnummer.length > 20) return bad("Die Hausnummer ist zu lang.");
  return { ok: true, anfrage: { art: "suche", plz, strasse, hausnummer: hausnummer || null } };
}

// ---------------------------------------------------------------------------
// Straßen
// ---------------------------------------------------------------------------

/** "Vogelsangstr." → "Vogelsangstraße", "Ulmer Str" → "Ulmer Straße", "…strasse" → "…straße". */
export function strasseNormalisieren(s: string): string {
  return text(s)
    .replace(/(^|\s)str\.?$/i, "$1Straße")
    .replace(/str\.?$/i, "straße")
    .replace(/strasse$/i, (m) => (m[0] === "S" ? "Straße" : "straße"));
}

/** Namensanfang für den zweiten Versuch: "Vogelsangstraße" → "Vogelsang", "Ulmer Straße" → "Ulmer". Leer, wenn es keinen gibt. */
export function strassenAnfang(s: string): string {
  const n = strasseNormalisieren(s);
  const anfang = n.replace(/[\s-]*straße$/i, "").trim();
  return anfang.length >= 3 && anfang !== n ? anfang : "";
}

/** Vergleichsschlüssel (Zwischenspeicher, Abgleich mit der Trefferliste): klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern. */
export function strassenSchluessel(s: string): string {
  return strasseNormalisieren(s)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Bauadresse "Vogelsangstraße 147 b" in Straße und Hausnummer teilen. Ohne erkennbare Nummer (z. B. "Baugebiet Lerchenfeld")
 * ist die Hausnummer null.
 */
export function strasseUndHausnummer(s: string | null | undefined): { strasse: string; hausnummer: string | null } {
  const t = text(s).replace(/,$/, "");
  const m = t.match(/^(.*\D)\s+(\d+\s*(?:[a-z](?:\s*-\s*[a-z])?|\/\s*[a-z0-9]+|-\s*\d+)?)$/i);
  if (!m || !/[a-zäöüß]/i.test(m[1])) return { strasse: t, hausnummer: null };
  return { strasse: m[1].trim(), hausnummer: m[2].replace(/\s+/g, " ").trim() };
}

// ---------------------------------------------------------------------------
// Hausnummern
// ---------------------------------------------------------------------------

/**
 * Hausnummer vergleichbar machen: klein, ohne Leerzeichen, "/" vor einem Buchstaben weg ("15 A", "15/A", "15a" → "15a").
 * Zwischen Ziffern bleibt der Schrägstrich ("18/1" ist nicht "181").
 */
export function hausnummerNormalisieren(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\/(?=[a-zäöüß])/g, "");
}

const grundnummer = (n: string): string => n.match(/^\d+/)?.[0] ?? "";

type Eintrag = { art: "nummer"; wert: string } | { art: "bereich"; von: number; bis: number };

/**
 * Hausnummernliste der Quelle auflösen: "147 A-C" → 147a, 147b, 147c; "96-104" bleibt ein Bereich
 * (gilt nur für Nummern gleicher Parität wie der Startwert und zählt beim Abgleich als unsicher).
 */
export function hausnummernListe(hnr: string): Eintrag[] {
  const out: Eintrag[] = [];
  for (const roh of hnr.split(",")) {
    const n = hausnummerNormalisieren(roh);
    if (!n) continue;
    const buchstaben = n.match(/^(\d+)([a-z])-([a-z])$/);
    if (buchstaben) {
      const [von, bis] = [buchstaben[2].charCodeAt(0), buchstaben[3].charCodeAt(0)];
      for (let c = Math.min(von, bis); c <= Math.max(von, bis); c++) out.push({ art: "nummer", wert: buchstaben[1] + String.fromCharCode(c) });
      continue;
    }
    const bereich = n.match(/^(\d+)-(\d+)$/);
    if (bereich && Number(bereich[2]) > Number(bereich[1])) {
      out.push({ art: "bereich", von: Number(bereich[1]), bis: Number(bereich[2]) });
      continue;
    }
    out.push({ art: "nummer", wert: n });
  }
  return out;
}

/**
 * Passt die gesuchte Hausnummer zu einem Bezirk?
 *   ja:       genau dieselbe Nummer steht in der Liste
 *   unsicher: nur die Grundnummer ist gleich (12 gesucht, nur 12a vorhanden) oder die Nummer liegt in einem Bereich
 *   nein:     sonst
 */
export function hausnummerPasst(hnr: string, gesucht: string): Passt {
  const g = hausnummerNormalisieren(gesucht);
  const gGrund = grundnummer(g);
  if (!gGrund) return "nein";
  let ergebnis: Passt = "nein";
  for (const e of hausnummernListe(hnr)) {
    if (e.art === "nummer") {
      if (e.wert === g) return "ja";
      if (grundnummer(e.wert) === gGrund) ergebnis = "unsicher";
    } else {
      const n = Number(gGrund);
      if (n >= e.von && n <= e.bis && n % 2 === e.von % 2) ergebnis = "unsicher";
    }
  }
  return ergebnis;
}

const RANG: Record<Passt, number> = { ja: 0, unsicher: 1, nein: 2 };

/**
 * Bezirke aller Treffer mit der Hausnummer abgleichen.
 *   eindeutig:       genau ein Bezirk passt sicher, keiner unsicher
 *   mehrdeutig:      sonst (auch wenn keiner passt: dann alle mit "nein", der Mensch wählt)
 *   ohne_hausnummer: keine Hausnummer angegeben: alle Bezirke der Straße zur Auswahl
 *   nicht_gefunden:  keine Straße mit Bezirken
 */
export function bezirkeAbgleichen(treffer: Treffer[], hausnummer: string | null): { status: SuchStatus; kandidaten: Kandidat[] } {
  const mitBezirken = treffer.filter((t) => t.bezirke?.length);
  if (!mitBezirken.length) return { status: "nicht_gefunden", kandidaten: [] };
  const ohneNummer = !hausnummer || !grundnummer(hausnummerNormalisieren(hausnummer));
  const kandidaten: Kandidat[] = mitBezirken.flatMap((t) =>
    t.bezirke!.map((b) => ({
      name: b.name,
      bsmId: b.bsmId,
      bezirk: b.bezirk,
      strasse: t.strasse,
      ortsteil: t.ortsteil,
      passt: ohneNummer ? ("unsicher" as const) : hausnummerPasst(b.hnr, hausnummer!),
    })),
  );
  if (ohneNummer) return { status: "ohne_hausnummer", kandidaten };
  kandidaten.sort((a, b) => RANG[a.passt] - RANG[b.passt]);
  const ja = kandidaten.filter((k) => k.passt === "ja").length;
  const unsicher = kandidaten.filter((k) => k.passt === "unsicher").length;
  return { status: ja === 1 && unsicher === 0 ? "eindeutig" : "mehrdeutig", kandidaten };
}

/** Kurze Erklärung zum Ergebnis, für die Oberfläche. */
export function suchMeldung(status: SuchStatus, kandidaten: Kandidat[], hausnummer: string | null, treffer: Treffer[]): string | null {
  if (status === "nicht_gefunden") {
    return treffer.length ? "Die Straße ist bekannt, die Quelle nennt dazu aber keinen Kehrbezirk. Bitte von Hand eintragen." : "Zu PLZ und Straße hat die Quelle nichts gefunden. Bitte die Schreibweise prüfen oder von Hand eintragen.";
  }
  if (status === "ohne_hausnummer") return "Ohne Hausnummer lässt sich der Bezirk nicht bestimmen. Bitte den passenden Schornsteinfeger wählen.";
  if (status === "mehrdeutig") {
    if (kandidaten.every((k) => k.passt === "nein")) return `Die Hausnummer ${hausnummer} steht in keiner Liste. Bitte prüfen und wählen.`;
    return "Mehrere Bezirke kommen in Frage oder die Zuordnung ist unsicher. Bitte wählen.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTML der Quelle
// ---------------------------------------------------------------------------

const ENTITAETEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  egrave: "è",
};

export function entitaetenDecodieren(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITAETEN[e] ?? m;
  });
}

/** Tags entfernen, Entitäten auflösen, Leerraum zusammenfassen. */
const klartext = (html: string): string => entitaetenDecodieren(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const attribut = (html: string, name: string): string | null => {
  const m = html.match(new RegExp(`\\b${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, "i"));
  return m ? entitaetenDecodieren(m[1] ?? m[2] ?? "") : null;
};
const leerZuNull = (s: string | null | undefined): string | null => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t ? t : null;
};

function bezirkeAusJson(roh: string): { ok: true; ort: string | null; ortsteil: string | null; plz: string | null; bezirke: Bezirk[] } | { ok: false } {
  let j: unknown;
  try {
    j = JSON.parse(roh);
  } catch {
    return { ok: false };
  }
  if (!j || typeof j !== "object") return { ok: false };
  const o = j as Record<string, unknown>;
  const kbz = o.KBZar;
  if (!kbz || typeof kbz !== "object") return { ok: false };
  const bezirke: Bezirk[] = [];
  for (const [bezirk, v] of Object.entries(kbz as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    const bsmId = String(e.BSMId ?? "").trim();
    const name = [e.BSMVorname, e.BSMName].map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).join(" ");
    if (!/^\d+$/.test(bsmId) || !name) continue;
    bezirke.push({ bezirk, name, bsmId, hnr: typeof e.Hnr === "string" ? e.Hnr : "" });
  }
  if (!bezirke.length) return { ok: false };
  return { ok: true, ort: leerZuNull(o.Ort as string), ortsteil: leerZuNull(o.Ortsteil as string), plz: leerZuNull(o.plz as string), bezirke };
}

/**
 * Antwort der Straßensuche (do=suchestrasse) lesen. Die Quelle sucht unscharf und liefert auch ähnliche Straßen
 * anderer PLZ; das Filtern macht `passendeTreffer`. Nicht lesbar: unbekannte Struktur oder Zeilen mit kaputtem JSON.
 */
export function strassenLesen(html: string): { ok: true; treffer: Treffer[] } | { ok: false } {
  if (typeof html !== "string") return { ok: false };
  if (!html.trim()) return { ok: true, treffer: [] };
  const teile = html.split(/<tr\b[^>]*\bclass\s*=\s*['"][^'"]*\bclick\b[^'"]*['"][^>]*>/i).slice(1);
  if (!teile.length) return /id\s*=\s*['"]street['"]/i.test(html) ? { ok: true, treffer: [] } : { ok: false };
  const treffer: Treffer[] = [];
  let kaputt = 0;
  for (const teil of teile) {
    const zeile = teil.split(/<\/tr>/i)[0];
    const zellen = [...zeile.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const strasse = leerZuNull(klartext(zellen[0] ?? ""));
    if (!strasse) {
      kaputt++;
      continue;
    }
    const all = attribut(zeile, "data-all");
    const plzAttr = leerZuNull(attribut(zeile, "data-plz"));
    const ortsteilSpalte = leerZuNull(klartext(zellen[1] ?? ""));
    if (all === null) {
      treffer.push({ strasse, ortsteil: ortsteilSpalte, plz: plzAttr ?? "", ort: null, bezirke: null });
      continue;
    }
    const j = bezirkeAusJson(all);
    if (!j.ok) {
      kaputt++;
      continue;
    }
    treffer.push({ strasse, ortsteil: j.ortsteil ?? ortsteilSpalte, plz: j.plz ?? plzAttr ?? "", ort: j.ort, bezirke: j.bezirke });
  }
  // Alle Zeilen unlesbar: Strukturänderung. Einzelne kaputte Zeilen werden übergangen.
  if (kaputt && !treffer.length) return { ok: false };
  return { ok: true, treffer };
}

/** Nur Treffer mit derselben PLZ und demselben Straßennamen (bzw. demselben Namensanfang beim zweiten Versuch). */
export function passendeTreffer(treffer: Treffer[], plz: string, strasse: string, modus: "genau" | "anfang"): Treffer[] {
  const key = strassenSchluessel(strasse);
  if (!key) return [];
  return treffer.filter((t) => t.plz === plz && (modus === "genau" ? strassenSchluessel(t.strasse) === key : strassenSchluessel(t.strasse).startsWith(key)));
}

/** Antwort der Detailabfrage (do=zeigebevollmaechtigterbyName) lesen. Fehlende Felder sind null; ohne Namen nicht lesbar. */
export function detailsLesen(html: string): { ok: true; details: Details } | { ok: false } {
  if (typeof html !== "string" || !html.trim()) return { ok: false };
  const block = (cls: string): string | null => {
    const m = html.match(new RegExp(`<div\\b[^>]*class\\s*=\\s*['"]${cls}['"][^>]*>([\\s\\S]*?)<\\/div>`, "i"));
    return m ? m[1] : null;
  };
  const b1 = block("adresse_block1");
  if (b1 === null) return { ok: false };
  const b2 = block("adresse_block2") ?? "";
  const zeilen = (b: string) => b.split(/<br\s*\/?>/i).map(klartext).filter(Boolean);

  const name = leerZuNull(klartext(b1.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? ""));
  if (!name) return { ok: false };
  const d: Details = { name, plz_ort: null, strasse: null, email: null, tel: null, mobil: null, fax: null, innung: null };
  const wert = (z: string, label: RegExp) => leerZuNull(z.replace(label, ""));
  for (const z of zeilen(b1)) {
    if (z === name) continue;
    if (/^e-?mail\s*:/i.test(z)) d.email = wert(z, /^e-?mail\s*:/i);
    else if (/^\d{5}\s/.test(z)) d.plz_ort = z.replace(/\s+\/\s*([A-Za-zÄÖÜ]{1,3})$/, " /$1");
    else if (!d.strasse) d.strasse = z;
  }
  for (const z of zeilen(b2)) {
    if (/^tel\.?\s*:/i.test(z)) d.tel = wert(z, /^tel\.?\s*:/i);
    else if (/^fax\s*:/i.test(z)) d.fax = wert(z, /^fax\s*:/i);
    else if (/^mobil\s*:/i.test(z)) d.mobil = wert(z, /^mobil\s*:/i);
  }
  const innung = [...html.matchAll(/<div\b[^>]*>([^<]*Innung[^<]*)<\/div>/gi)].map((m) => klartext(m[1]))[0];
  if (innung) d.innung = innung.match(/Mitglied der (.+)$/i)?.[1]?.trim() ?? innung;
  return { ok: true, details: d };
}

// ---------------------------------------------------------------------------
// Zwischenspeicher und Limit
// ---------------------------------------------------------------------------

/** Ab wann ein Eintrag im Zwischenspeicher noch gilt (ISO-Zeit). */
export function cacheGrenze(now: Date): string {
  return new Date(now.getTime() - CACHE_TAGE * 24 * 60 * 60 * 1000).toISOString();
}

const STUNDE_MS = 60 * 60 * 1000;

/** Wie lange ein Suchergebnis gespeichert wird (in ms); null = gar nicht. */
export function speicherFrist(status: SuchStatus): number | null {
  if (status === "quelle_nicht_erreichbar") return null;
  if (status === "nicht_gefunden") return CACHE_NICHT_GEFUNDEN_STUNDEN * STUNDE_MS;
  return CACHE_TAGE * 24 * STUNDE_MS;
}

/** Gilt ein gespeichertes Suchergebnis noch? Die Frist hängt davon ab, ob es Bezirke enthält (nicht von der Hausnummer). */
export function cacheGueltig(treffer: Treffer[], abgerufenAm: string, now: Date): boolean {
  const frist = speicherFrist(bezirkeAbgleichen(treffer, null).status);
  const am = Date.parse(abgerufenAm);
  return frist !== null && Number.isFinite(am) && now.getTime() - am < frist;
}

/** Beginn des Tages (UTC) für das Tageslimit. */
export function tagesbeginn(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Alle BSM-Kennungen einer Trefferliste (Details gibt es nur für Kandidaten aus einer Suche). */
export const bsmIds = (treffer: Treffer[]): string[] => [...new Set(treffer.flatMap((t) => (t.bezirke ?? []).map((b) => b.bsmId)))];

/** Antwort einer Suche aus den (gespeicherten oder frischen) Treffern bilden. */
export function suchAntwort(treffer: Treffer[], hausnummer: string | null, suchbegriff: string): SuchAntwort {
  const { status, kandidaten } = bezirkeAbgleichen(treffer, hausnummer);
  return { ok: true, status, kandidaten, meldung: suchMeldung(status, kandidaten, hausnummer, treffer), suchbegriff };
}
