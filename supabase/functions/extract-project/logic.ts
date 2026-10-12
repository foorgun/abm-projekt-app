// Reine Logik der Edge Function extract-project: Eingabeprüfung, Schema, Anweisung, Limits, Kostenschätzung.
// Ohne Importe, damit dieselbe Datei in Deno (Funktion) und in vitest (Tests der App) läuft.
// Die Feldliste muss zu src/lib/extract/types.ts passen (ein Test der App prüft das).

export const FIELDS = [
  "bauherrLabel",
  "bauherrName",
  "phone",
  "email",
  "address",
  "bauherr2Name",
  "bauherr2Phone",
  "bauherr2Email",
  "company",
  "buildingAddress",
  "location",
  "flurstueck",
  "gemarkung",
  "vermesser",
  "vertragsart",
  "vertragsdatum",
  "vertragspreis",
  "angebotsnummer",
  "haustyp",
  "rechtsform",
  "foerderung",
] as const;

export type FieldKey = (typeof FIELDS)[number];

export const MAX_IMAGES = 2;
/** Größte Bilddatei je Bild (Base64-Zeichen; entspricht etwa 2,2 MB). Die App sendet Seiten mit höchstens 1600 px Kantenlänge. */
export const MAX_IMAGE_BASE64 = 3_000_000;
export const MAX_TOKENS = 2000;
export const TIMEOUT_MS = 60_000;
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export interface ImageInput {
  mediaType: "image/jpeg" | "image/png";
  data: string;
}

export type Failure = { ok: false; code: "disabled" | "limit" | "forbidden" | "error"; message: string };

/** Prüft den Aufruf. Liefert die Bilder oder eine Fehlermeldung (ohne Inhalte zu wiederholen). */
export function parseRequest(body: unknown): { ok: true; images: ImageInput[] } | Failure {
  const bad = (message: string): Failure => ({ ok: false, code: "error", message });
  if (!body || typeof body !== "object") return bad("Ungültiger Aufruf.");
  const images = (body as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length < 1) return bad("Es wurde kein Bild übergeben.");
  if (images.length > MAX_IMAGES) return bad(`Höchstens ${MAX_IMAGES} Bilder je Auslesung.`);
  const out: ImageInput[] = [];
  for (const img of images) {
    const i = img as { mediaType?: unknown; data?: unknown };
    if (i?.mediaType !== "image/jpeg" && i?.mediaType !== "image/png") return bad("Nur JPEG oder PNG.");
    if (typeof i.data !== "string" || i.data.length < 100) return bad("Das Bild ist leer.");
    if (i.data.length > MAX_IMAGE_BASE64) return bad("Das Bild ist zu groß.");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(i.data)) return bad("Das Bild ist nicht lesbar.");
    out.push({ mediaType: i.mediaType, data: i.data });
  }
  return { ok: true, images: out };
}

/**
 * JSON-Schema der Antwort: je Feld {wert, quelle, seite, sicherheit}, dazu Hinweise. Kein Freitext außerhalb.
 * Leerer Text bzw. 0 heißt "nicht vorhanden" (das Schema kommt so ohne null-Varianten aus).
 */
export function outputSchema(): Record<string, unknown> {
  const field = {
    type: "object",
    properties: {
      wert: { type: "string" },
      quelle: { type: "string" },
      seite: { type: "integer" },
      sicherheit: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
    },
    required: ["wert", "quelle", "seite", "sicherheit"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      felder: {
        type: "object",
        properties: Object.fromEntries(FIELDS.map((k) => [k, field])),
        required: [...FIELDS],
        additionalProperties: false,
      },
      hinweise: { type: "array", items: { type: "string" } },
    },
    required: ["felder", "hinweise"],
    additionalProperties: false,
  };
}

/** Anweisung an das Modell. Feste Zeichenkette (keine Zeit, keine Nutzerdaten), damit sie sich zwischenspeichern lässt. */
export const SYSTEM_PROMPT = `Du liest für ein Architekturbüro die erste Seite eines Vertrags aus (oft ein gescanntes Formular mit handschriftlichen Eintragungen) und füllst die vorgegebenen Felder. Ein Mensch prüft danach jedes Feld; lieber ein Feld leer lassen als raten.

Dokumentarten:
- werkvertrag: Vertrag zwischen Bauherren und einer Hausbaufirma über die Errichtung eines Hauses.
- vermessungsvertrag: Auftrag an ein Vermessungsbüro.
- sonstiges: alles andere.

Felder:
- bauherrLabel: Nachname des ersten Bauherrn. bauherrName: Vorname und Nachname des ersten Bauherrn.
- phone, email: Telefon und E-Mail des ersten Bauherrn. address: Wohnanschrift der Bauherren (Straße Hausnummer, PLZ Ort).
- bauherr2Name, bauherr2Phone, bauherr2Email: zweiter Bauherr, falls eingetragen.
- company: Hausbaufirma bzw. Auftragnehmer (aus Briefkopf oder Vertragstext).
- buildingAddress, location, flurstueck, gemarkung: NUR wenn die Stelle ausdrücklich als Baugrundstück, Bauort, Flurstück oder Gemarkung bezeichnet ist. Im Werkvertrag steht das Baugrundstück nicht: dort diese vier Felder immer leer lassen. Die Wohnanschrift ist nie die Bauadresse.
- vermesser: Name des Vermessungsbüros, wenn genannt.
- vertragsart: genau einer der Werte werkvertrag, vermessungsvertrag, sonstiges.
- vertragsdatum: Datum des Vertrags als JJJJ-MM-TT. vertragspreis: Betrag wie im Vertrag, z. B. "312.450,00 €". angebotsnummer: Angebots- oder Auftragsnummer, wie sie dasteht. haustyp: Bezeichnung des Hauses.
- rechtsform: "Eheleute" oder "Bauherrengemeinschaft", nur wenn angekreuzt oder eingetragen.
- foerderung: "ja", wenn eine KfW- oder WEF-Förderung angekreuzt ist, sonst leer.

Je Feld:
- wert: der gelesene Wert, oder leerer Text, wenn nichts dasteht oder du es nicht lesen kannst.
- quelle: die Stelle im Dokument in wenigen Wörtern (Beschriftung und Eintrag), höchstens 80 Zeichen; leer, wenn wert leer ist.
- seite: Nummer des Bildes, auf dem die Stelle steht (1 oder 2), 0, wenn wert leer ist.
- sicherheit: hoch nur bei klar gedrucktem Text; mittel bei gut lesbarer Handschrift; niedrig, sobald ein Zeichen unsicher ist. Telefonnummern und E-Mail-Adressen in Handschrift sind höchstens mittel.

Nicht auslesen und nirgends wiedergeben: Geburtsdatum, Beruf, Bankverbindung, Ausweisdaten.
Leere Vorlagen (Formular ohne Eintragungen): alle Felder außer vertragsart und ggf. company/vermesser leer lassen und das in hinweise sagen.
hinweise: höchstens drei kurze Sätze für den prüfenden Menschen (z. B. schwer lesbare Stelle, leere Vorlage). Keine personenbezogenen Daten in hinweise.`;

/** Antwort des Modells in die Form der App bringen: leere Werte werden null, nur bekannte Felder. */
export function toResponse(raw: unknown): { ok: true; felder: Record<FieldKey, { wert: string | null; quelle: { text: string; seite: number | null } | null; sicherheit: string }>; hinweise: string[] } | Failure {
  const r = raw as { felder?: Record<string, { wert?: unknown; quelle?: unknown; seite?: unknown; sicherheit?: unknown }>; hinweise?: unknown };
  if (!r || typeof r !== "object" || !r.felder || typeof r.felder !== "object") return { ok: false, code: "error", message: "Die Auslesung lieferte kein verwertbares Ergebnis." };
  const felder = {} as Record<FieldKey, { wert: string | null; quelle: { text: string; seite: number | null } | null; sicherheit: string }>;
  for (const k of FIELDS) {
    const f = r.felder[k];
    const wert = typeof f?.wert === "string" && f.wert.trim() ? f.wert.trim() : null;
    const text = typeof f?.quelle === "string" ? f.quelle.trim() : "";
    const seite = typeof f?.seite === "number" && f.seite >= 1 && f.seite <= MAX_IMAGES ? f.seite : null;
    const sicherheit = f?.sicherheit === "hoch" || f?.sicherheit === "mittel" ? f.sicherheit : "niedrig";
    felder[k] = { wert, quelle: wert && text ? { text, seite } : null, sicherheit: wert ? sicherheit : "niedrig" };
  }
  const hinweise = Array.isArray(r.hinweise) ? r.hinweise.filter((h): h is string => typeof h === "string").slice(0, 3) : [];
  return { ok: true, felder, hinweise };
}

// ---------------------------------------------------------------------------
// Kostenbremse
// ---------------------------------------------------------------------------

export interface Limits {
  perUserPerDay: number;
  totalPerDay: number;
  monthlyBudgetEur: number;
}

export const DEFAULT_LIMITS: Limits = { perUserPerDay: 20, totalPerDay: 100, monthlyBudgetEur: 20 };

/** Limits aus den Secrets; ungültige oder fehlende Werte fallen auf den Standard zurück. */
export function limitsFromEnv(env: (name: string) => string | undefined): Limits {
  const num = (name: string, fallback: number) => {
    const v = Number(env(name));
    return Number.isFinite(v) && v >= 0 && env(name)?.trim() ? v : fallback;
  };
  return {
    perUserPerDay: num("EXTRACTOR_LIMIT_USER_PER_DAY", DEFAULT_LIMITS.perUserPerDay),
    totalPerDay: num("EXTRACTOR_LIMIT_TOTAL_PER_DAY", DEFAULT_LIMITS.totalPerDay),
    monthlyBudgetEur: num("EXTRACTOR_MONTHLY_BUDGET_EUR", DEFAULT_LIMITS.monthlyBudgetEur),
  };
}

/** Nur der genaue Text "true" schaltet frei (Standard: aus). */
export function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export interface Usage {
  userToday: number;
  totalToday: number;
  monthCostEur: number;
}

/** Entscheidet vor dem Aufruf des KI-Dienstes. Bei Überschreitung gibt es keinen Aufruf. */
export function checkLimits(usage: Usage, limits: Limits): Failure | null {
  if (usage.userToday >= limits.perUserPerDay) return { ok: false, code: "limit", message: `Tageslimit erreicht (${limits.perUserPerDay} Auslesungen pro Person und Tag). Bitte das Projekt von Hand anlegen oder morgen erneut versuchen.` };
  if (usage.totalToday >= limits.totalPerDay) return { ok: false, code: "limit", message: `Tageslimit erreicht (${limits.totalPerDay} Auslesungen pro Tag im Büro). Bitte das Projekt von Hand anlegen oder morgen erneut versuchen.` };
  if (usage.monthCostEur >= limits.monthlyBudgetEur) return { ok: false, code: "limit", message: "Monatsbudget für die Auslesung erreicht. Bitte das Projekt von Hand anlegen." };
  return null;
}

/** Listenpreise in US-Dollar je Million Tokens (Stand Oktober 2026). Unbekannte Modelle rechnen mit dem teuersten Satz. */
export const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
const UNKNOWN_PRICE = { input: 10, output: 50 };

/**
 * Geschätzte Kosten in Euro. `usdToEur` ist ein grober Umrechnungsfaktor (Secret EXTRACTOR_USD_EUR, Standard 1,0:
 * lieber etwas zu hoch schätzen als das Budget zu überziehen). Maßgeblich bleibt die Abrechnung des Anbieters.
 */
export function estimateCostEur(model: string, inputTokens: number, outputTokens: number, usdToEur = 1): number {
  const p = PRICES_USD_PER_MTOK[model] ?? UNKNOWN_PRICE;
  const usd = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return Math.round(usd * usdToEur * 10_000) / 10_000;
}

/** Beginn des heutigen Tages und des laufenden Monats (UTC) als ISO-Zeitpunkt, für die Zählung im Protokoll. */
export function periodStarts(now: Date): { day: string; month: string } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { day: day.toISOString(), month: month.toISOString() };
}
