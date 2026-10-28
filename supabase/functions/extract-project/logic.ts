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

/** Dokumentarten (wie public.document_type, Migration 0019). */
export const DOC_TYPES = ["werkvertrag", "vermessungsvertrag", "baugrundauftrag", "honorarvereinbarung", "sonstiges"] as const;
export type DocType = (typeof DOC_TYPES)[number];

const BAUHERR: FieldKey[] = ["bauherrLabel", "bauherrName", "phone", "email", "address", "bauherr2Name", "bauherr2Phone", "bauherr2Email"];
const GRUNDSTUECK: FieldKey[] = ["buildingAddress", "location", "flurstueck", "gemarkung"];
const VERTRAG: FieldKey[] = ["vertragsart", "vertragsdatum", "vertragspreis", "angebotsnummer"];

/** Schema je Dokumentart: nur diese Felder werden übernommen. Muss zu FIELDS_BY_TYPE der App passen (Test). */
export const FIELDS_BY_TYPE: Record<DocType, readonly FieldKey[]> = {
  werkvertrag: [...BAUHERR, "company", ...VERTRAG, "haustyp", "rechtsform", "foerderung"],
  vermessungsvertrag: ["bauherrLabel", "bauherrName", "phone", "email", "address", ...GRUNDSTUECK, "vermesser", ...VERTRAG],
  baugrundauftrag: ["bauherrLabel", "bauherrName", "phone", "email", "address", ...GRUNDSTUECK, ...VERTRAG],
  honorarvereinbarung: [...BAUHERR, ...GRUNDSTUECK, ...VERTRAG],
  sonstiges: FIELDS.filter((k) => k !== "haustyp" && k !== "rechtsform" && k !== "foerderung"),
};

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);
}

/** Höchstens vier Seitenbilder je Dokument (die App schickt zwei, beim Nachlesen eine). Weit unter den Grenzen des Dienstes. */
export const MAX_IMAGES = 4;
/** Größe einer Datei im Entwurf, wie in der Datenbank (project_draft_files) und in der App: 30 MB. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
/** Grenze des KI-Dienstes: höchstens 5 MB je Bild (Größe der Bilddatei, nicht des Base64-Texts). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * Längste Kante in Pixeln. Die App sendet höchstens 1568 px (JPEG, Qualität 85). Mehr als 2576 px verarbeitet das Modell
 * ohnehin nicht in voller Auflösung, kostet aber mehr; deshalb wird Größeres abgelehnt statt stillschweigend bezahlt.
 */
export const MAX_IMAGE_EDGE_PX = 2576;
export const MAX_TOKENS = 2000;
export const TIMEOUT_MS = 60_000;
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export interface ImageInput {
  mediaType: "image/jpeg" | "image/png";
  data: string;
  /** Größe der Bilddatei in Bytes */
  bytes: number;
  /** Breite und Höhe in Pixeln, aus dem Kopf der Bilddatei */
  width: number;
  height: number;
}

/** Bytes aus Base64 (nur der Anfang wird gebraucht, um den Kopf der Bilddatei zu lesen). */
function decodeStart(base64: string, maxChars: number): Uint8Array {
  const chunk = base64.slice(0, Math.min(base64.length, maxChars - (maxChars % 4)));
  const bin = atob(chunk.length % 4 ? chunk.slice(0, chunk.length - (chunk.length % 4)) : chunk);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Art und Pixelmaße einer Bilddatei aus ihrem Kopf: PNG (IHDR) oder JPEG (SOF-Abschnitt).
 * null, wenn es weder PNG noch JPEG ist oder die Maße nicht im gelesenen Anfang stehen.
 */
export function imageDimensions(base64: string): { mediaType: "image/jpeg" | "image/png"; width: number; height: number } | null {
  let b: Uint8Array;
  try {
    b = decodeStart(base64, 400_000);
  } catch {
    return null;
  }
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mediaType: "image/png", width: u32(16), height: u32(20) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++; // Füllbyte
        continue;
      }
      // SOF0 bis SOF15, ohne DHT (C4), JPG (C8) und DAC (CC): dort stehen Höhe und Breite
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { mediaType: "image/jpeg", width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

/** Größe der Bilddatei in Bytes aus der Länge des Base64-Texts. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export type Failure = { ok: false; code: "disabled" | "limit" | "forbidden" | "error"; message: string };

/** Prüft den Aufruf. Liefert die Bilder oder eine Fehlermeldung (ohne Inhalte zu wiederholen). */
export interface ParsedRequest {
  ok: true;
  images: ImageInput[];
  /** Feststehende Dokumentart; fehlt sie, bestimmt das Modell die Art. */
  art: DocType | null;
  /** Datei im Entwurf, für das Protokoll (Kosten je Projekt). */
  draftFileId: string | null;
  /** Seitennummern der Bilder im Dokument */
  pages: number[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRequest(body: unknown): ParsedRequest | Failure {
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
    const bytes = base64Bytes(i.data);
    if (bytes > MAX_IMAGE_BYTES) return bad(`Das Bild ist zu groß (${Math.round(bytes / 1024)} kB, erlaubt sind höchstens 5 MB).`);
    if (i.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(i.data)) return bad("Das Bild ist nicht lesbar.");
    // Der Kopf der Datei muss zum angegebenen Typ passen, sonst lehnt der KI-Dienst die Anfrage ab
    const dim = imageDimensions(i.data);
    if (!dim) return bad("Das Bild ist weder JPEG noch PNG oder beschädigt.");
    if (dim.mediaType !== i.mediaType) return bad("Bildtyp und Inhalt passen nicht zusammen.");
    if (dim.width < 1 || dim.height < 1) return bad("Das Bild ist nicht lesbar.");
    if (Math.max(dim.width, dim.height) > MAX_IMAGE_EDGE_PX) return bad(`Das Bild ist zu groß (${dim.width}×${dim.height} px, erlaubt sind höchstens ${MAX_IMAGE_EDGE_PX} px Kantenlänge).`);
    out.push({ mediaType: i.mediaType, data: i.data, bytes, width: dim.width, height: dim.height });
  }
  const b = body as { art?: unknown; draftFileId?: unknown; pages?: unknown };
  if (b.art !== undefined && b.art !== null && !isDocType(b.art)) return bad("Unbekannte Dokumentart.");
  if (b.draftFileId !== undefined && b.draftFileId !== null && (typeof b.draftFileId !== "string" || !UUID_RE.test(b.draftFileId))) return bad("Ungültige Datei-ID.");
  const pages = Array.isArray(b.pages) && b.pages.length === out.length && b.pages.every((n) => Number.isInteger(n) && n >= 1 && n <= 10_000) ? (b.pages as number[]) : out.map((_, i) => i + 1);
  return { ok: true, images: out, art: isDocType(b.art) ? b.art : null, draftFileId: typeof b.draftFileId === "string" ? b.draftFileId : null, pages };
}

/** Text der Anfrage nach den Bildern: welche Seiten es sind und welche Art feststeht. Keine Nutzerdaten. */
export function questionText(art: DocType | null, pages: number[]): string {
  const bilder = pages.map((p, i) => `Bild ${i + 1} ist Seite ${p}`).join(", ");
  const artText = art ? `Die Dokumentart steht fest: ${art}. Fülle nur die Felder dieser Art.` : "Bestimme zuerst die Dokumentart (vertragsart) und fülle dann nur die Felder dieser Art.";
  return `${bilder} des Dokuments. ${artText}`;
}

/**
 * JSON-Schema der Antwort, bewusst klein: ein flaches Array "felder" mit Einträgen {feld, wert, quelle, seite, sicherheit}
 * und "hinweise". Keine enums, keine Objekte je Feldname: die frühere Form (ein Unterobjekt je Feld) ergab beim
 * KI-Dienst eine zu große Grammatik ("The compiled grammar is too large", Fehler 400). Welche Feldnamen und
 * Sicherheitsstufen erlaubt sind, steht in der Anweisung; geprüft wird das hier in toResponse.
 */
export function outputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      felder: {
        type: "array",
        items: {
          type: "object",
          properties: {
            feld: { type: "string" },
            wert: { type: "string" },
            quelle: { type: "string" },
            seite: { type: "integer" },
            sicherheit: { type: "string" },
          },
          required: ["feld", "wert", "quelle", "seite", "sicherheit"],
          additionalProperties: false,
        },
      },
      hinweise: { type: "array", items: { type: "string" } },
    },
    required: ["felder", "hinweise"],
    additionalProperties: false,
  };
}

/** Für das Log: nur Anzahl, Pixelmaße und Dateigröße der Bilder, nie der Inhalt. */
export function describeImages(images: ImageInput[]): string {
  return images.map((i) => `${i.width}x${i.height} px, ${Math.round(i.bytes / 1024)} kB, ${i.mediaType}`).join(" | ");
}

/**
 * Modelle, die den Parameter output_config.effort annehmen (die aktuelle 5er-Familie und die 4.6er bis 4.8er).
 * Bei anderen Modellen in EXTRACTOR_MODEL (z. B. claude-haiku-4-5) lehnt der Dienst ihn mit Fehler 400 ab.
 */
export function supportsEffort(model: string): boolean {
  return /^claude-(?:sonnet|opus|haiku|fable|mythos)-5(?:-\d+)?$/.test(model) || /^claude-opus-4-[5-8]$/.test(model) || model === "claude-sonnet-4-6";
}

/**
 * Parameter der Ausgabe, passend zum Modell. `strict`: Antwort an das JSON-Schema binden (strukturierte Ausgabe).
 * Ohne strict verlangt nur die Anweisung reines JSON (JSON_ONLY), und die Funktion prüft die Antwort selbst.
 * "effort" nur wo es gültig ist. Bewusst nicht gesetzt: thinking, temperature, tool_choice.
 * Liefert undefined, wenn gar kein Parameter nötig ist.
 */
export function outputConfig(model: string, strict = true): { format?: { type: "json_schema"; schema: Record<string, unknown> }; effort?: "low" } | undefined {
  const out: { format?: { type: "json_schema"; schema: Record<string, unknown> }; effort?: "low" } = {};
  // wenig Nachdenken: es ist reines Ablesen, und die Antwort muss in max_tokens passen
  if (supportsEffort(model)) out.effort = "low";
  if (strict) out.format = { type: "json_schema", schema: outputSchema() };
  return out.effort || out.format ? out : undefined;
}

/** Nur der genaue Text "false" schaltet die Schema-Bindung ab (Secret EXTRACTOR_STRICT, Standard: an). */
export function strictEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() !== "false";
}

/**
 * Lehnt der KI-Dienst das Schema selbst ab (zu große Grammatik, nicht unterstütztes Schlüsselwort)? Dann lohnt ein
 * zweiter Versuch ohne Schema-Bindung. Andere Fehler 400 (Bild, Guthaben, Modell) würden genauso wieder scheitern.
 */
export function isSchemaRejection(info: { type: string; message: string }): boolean {
  return info.type === "invalid_request_error" && /grammar|schema|output_config|structured output|json_schema/i.test(info.message);
}

/** Zusatz zur Anweisung, wenn die Antwort nicht an ein Schema gebunden ist. */
export const JSON_ONLY = `

Antworte ausschließlich mit einem einzigen JSON-Objekt in genau dieser Form, ohne Text davor oder danach und ohne Markdown:
{"felder": [{"feld": "bauherrLabel", "wert": "…", "quelle": "…", "seite": 1, "sicherheit": "mittel"}], "hinweise": []}`;

/** Nachfrage, wenn die Antwort kein gültiges JSON war. Enthält nur die Fehlerart, nichts aus dem Dokument. */
export function repairMessage(problem: string): string {
  return `Deine Antwort ließ sich nicht als JSON lesen (${problem}). Antworte noch einmal, diesmal ausschließlich mit dem JSON-Objekt {"felder": [...], "hinweise": [...]} wie beschrieben: kein Text davor oder danach, kein Markdown, alle Zeichenketten in doppelten Anführungszeichen.`;
}

/**
 * JSON-Objekt aus einer Antwort lesen. Verträgt Markdown-Zäune und Text um das Objekt herum.
 * Liefert den geparsten Wert oder eine kurze Fehlerart (ohne Inhalte), z. B. für die Nachfrage.
 */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, problem: "kein JSON-Objekt gefunden" };
  try {
    const value: unknown = JSON.parse(cleaned.slice(start, end + 1));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, problem: "kein JSON-Objekt" };
    return { ok: true, value };
  } catch {
    return { ok: false, problem: "ungültiges JSON" };
  }
}

/**
 * Schlüsselwörter, die die strukturierte Ausgabe des KI-Dienstes nicht annimmt (Anfrage scheitert sonst mit Fehler 400).
 * Ein Test der App prüft das Schema dagegen.
 */
export const UNSUPPORTED_SCHEMA_KEYWORDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "patternProperties", "not", "if", "then", "else", "oneOf"];

/**
 * Fehlertyp und Meldung aus der Antwort des KI-Dienstes, für das Log. Nur diese zwei Angaben: sie nennen den Parameter
 * und den Grund, keine Dokumentinhalte. Vorsichtshalber werden lange Base64-artige Folgen und Schlüssel entfernt.
 */
export function apiErrorInfo(error: unknown): { type: string; message: string } {
  const e = (error ?? {}) as { type?: unknown; error?: { type?: unknown; message?: unknown; error?: { type?: unknown; message?: unknown } } };
  const inner = e.error?.error ?? e.error ?? {};
  const type = typeof inner.type === "string" && inner.type !== "error" ? inner.type : typeof e.type === "string" ? e.type : "unbekannt";
  const raw = typeof inner.message === "string" ? inner.message : "ohne Meldung";
  const message = raw
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[Schlüssel entfernt]")
    .replace(/[A-Za-z0-9+/=]{60,}/g, "[…]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  return { type: type.slice(0, 60), message };
}

/** Anweisung an das Modell. Feste Zeichenkette (keine Zeit, keine Nutzerdaten), damit sie sich zwischenspeichern lässt. */
export const SYSTEM_PROMPT = `Du liest für ein Architekturbüro Verträge und Aufträge zu einem Bauvorhaben aus (oft gescannte Formulare mit handschriftlichen Eintragungen) und füllst die vorgegebenen Felder. Du bekommst die ersten Seiten eines Dokuments als Bilder. Ein Mensch prüft danach jedes Feld; lieber ein Feld leer lassen als raten.

Dokumentarten (Feld vertragsart, genau einer dieser Werte):
- werkvertrag: Vertrag zwischen Bauherren und einer Hausbaufirma über die Errichtung eines Hauses.
- vermessungsvertrag: Auftrag an ein Vermessungsbüro (Lageplan, Absteckung, Vermessung).
- baugrundauftrag: Auftrag für ein Baugrund- oder Bodengutachten.
- honorarvereinbarung: Honorar- bzw. Architektenvertrag mit dem Architekturbüro.
- sonstiges: alles andere.

Felder je Dokumentart (nur diese ausfüllen, alle anderen weglassen):
- werkvertrag: ${FIELDS_BY_TYPE.werkvertrag.join(", ")}
- vermessungsvertrag: ${FIELDS_BY_TYPE.vermessungsvertrag.join(", ")}
- baugrundauftrag: ${FIELDS_BY_TYPE.baugrundauftrag.join(", ")}
- honorarvereinbarung: ${FIELDS_BY_TYPE.honorarvereinbarung.join(", ")}
- sonstiges: ${FIELDS_BY_TYPE.sonstiges.join(", ")}

Bedeutung der Felder:
- bauherrLabel: Nachname des ersten Bauherrn bzw. Auftraggebers. bauherrName: Vorname und Nachname.
- phone, email: Telefon und E-Mail des ersten Bauherrn. address: Wohnanschrift der Bauherren (Straße Hausnummer, PLZ Ort).
- bauherr2Name, bauherr2Phone, bauherr2Email: zweiter Bauherr, falls eingetragen.
- company: Hausbaufirma bzw. Auftragnehmer des Werkvertrags (aus Briefkopf oder Vertragstext).
- buildingAddress, location, flurstueck, gemarkung: NUR wenn die Stelle ausdrücklich als Baugrundstück, Bauort, Bauvorhaben, Flurstück oder Gemarkung bezeichnet ist. Im Werkvertrag steht das Baugrundstück nicht. Die Wohnanschrift ist nie die Bauadresse. location ist der Ort des Bauvorhabens (z. B. "Blaustein").
- vermesser: Name des Vermessungsbüros.
- vertragsdatum: Datum des Vertrags bzw. Auftrags als JJJJ-MM-TT. vertragspreis: Betrag wie im Dokument, z. B. "312.450,00 €". angebotsnummer: Angebots- oder Auftragsnummer, wie sie dasteht. haustyp: Bezeichnung des Hauses.
- rechtsform: "Eheleute" oder "Bauherrengemeinschaft", nur wenn angekreuzt oder eingetragen.
- foerderung: "ja", wenn eine KfW- oder WEF-Förderung angekreuzt ist, sonst weglassen.

Ausgabe: ein Array "felder" mit einem Eintrag je gefundenem Feld und ein Array "hinweise".
Erlaubte Werte für "feld" (genau diese Schreibweise, jedes höchstens einmal, keine anderen): ${FIELDS.join(", ")}.
Felder, zu denen nichts dasteht oder die du nicht lesen kannst, lässt du einfach weg. vertragsart gibst du immer an.
Je Eintrag:
- feld: einer der erlaubten Feldnamen.
- wert: der gelesene Wert.
- quelle: die Stelle im Dokument in wenigen Wörtern (Beschriftung und Eintrag), höchstens 80 Zeichen.
- seite: Nummer des Bildes, auf dem die Stelle steht (1, 2, …).
- sicherheit: genau eines der Wörter hoch, mittel, niedrig. hoch nur bei klar gedrucktem Text; mittel bei gut lesbarer Handschrift; niedrig, sobald ein Zeichen unsicher ist. Telefonnummern und E-Mail-Adressen in Handschrift sind höchstens mittel.

Nicht auslesen und nirgends wiedergeben: Geburtsdatum, Beruf, Bankverbindung, Ausweisdaten.
Leere Vorlagen (Formular ohne Eintragungen): nur vertragsart und ggf. company/vermesser liefern und das in hinweise sagen.
hinweise: höchstens drei kurze Sätze für den prüfenden Menschen (z. B. schwer lesbare Stelle, leere Vorlage, wichtige Angaben vermutlich auf späteren Seiten). Keine personenbezogenen Daten in hinweise.`;

const LEVELS: Record<string, "hoch" | "mittel" | "niedrig"> = { hoch: "hoch", high: "hoch", mittel: "mittel", medium: "mittel", niedrig: "niedrig", low: "niedrig", gering: "niedrig" };

/** Sicherheitsstufe vereinheitlichen; alles Unbekannte gilt als "niedrig". */
export function normalizeLevel(raw: unknown): "hoch" | "mittel" | "niedrig" {
  return typeof raw === "string" ? (LEVELS[raw.trim().toLowerCase()] ?? "niedrig") : "niedrig";
}

type AppField = { wert: string | null; quelle: { text: string; seite: number | null } | null; sicherheit: "hoch" | "mittel" | "niedrig" };

/**
 * Antwort des Modells prüfen und in die Form der App bringen ({wert, quelle, sicherheit} je Feld).
 * Das Schema bindet nur die Form; hier wird der Inhalt geprüft: unbekannte Feldnamen werden verworfen, bei doppelten
 * zählt der erste Eintrag mit Wert, die Sicherheitsstufe wird vereinheitlicht, fehlende Felder sind leer.
 */
export function toResponse(raw: unknown, art: DocType | null = null): { ok: true; dokumentart: DocType; felder: Record<FieldKey, AppField>; hinweise: string[] } | Failure {
  const r = raw as { felder?: unknown; hinweise?: unknown };
  if (!r || typeof r !== "object" || !Array.isArray(r.felder)) return { ok: false, code: "error", message: "Die Auslesung lieferte kein verwertbares Ergebnis." };
  const felder = Object.fromEntries(FIELDS.map((k) => [k, { wert: null, quelle: null, sicherheit: "niedrig" }])) as Record<FieldKey, AppField>;
  for (const entry of r.felder as { feld?: unknown; wert?: unknown; quelle?: unknown; seite?: unknown; sicherheit?: unknown }[]) {
    if (!entry || typeof entry !== "object") continue;
    const name = typeof entry.feld === "string" ? entry.feld.trim() : "";
    if (!(FIELDS as readonly string[]).includes(name)) continue; // unbekanntes Feld (z. B. Geburtsdatum): verwerfen
    const key = name as FieldKey;
    if (felder[key].wert) continue;
    const wert = typeof entry.wert === "string" && entry.wert.trim() ? entry.wert.trim().slice(0, 300) : null;
    if (!wert) continue;
    const text = typeof entry.quelle === "string" ? entry.quelle.trim().slice(0, 120) : "";
    const seite = typeof entry.seite === "number" && Number.isInteger(entry.seite) && entry.seite >= 1 && entry.seite <= MAX_IMAGES ? entry.seite : null;
    felder[key] = { wert, quelle: text ? { text, seite } : null, sicherheit: normalizeLevel(entry.sicherheit) };
  }
  const hinweise = Array.isArray(r.hinweise) ? r.hinweise.filter((h): h is string => typeof h === "string" && h.trim().length > 0).map((h) => h.trim().slice(0, 200)).slice(0, 3) : [];
  // Schema der Art anwenden: feststehende Art vor der erkannten, Unbekanntes ist "sonstiges"
  const erkannt = felder.vertragsart.wert?.toLowerCase() ?? null;
  const dokumentart: DocType = art ?? (isDocType(erkannt) ? erkannt : "sonstiges");
  const allowed = new Set<FieldKey>(FIELDS_BY_TYPE[dokumentart]);
  for (const k of FIELDS) if (k !== "vertragsart" && !allowed.has(k)) felder[k] = { wert: null, quelle: null, sicherheit: "niedrig" };
  felder.vertragsart = { ...felder.vertragsart, wert: dokumentart, sicherheit: art ? "hoch" : felder.vertragsart.sicherheit };
  return { ok: true, dokumentart, felder, hinweise };
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
  if (usage.userToday >= limits.perUserPerDay)
    return { ok: false, code: "limit", message: `Dein Tageslimit ist erreicht: ${limits.perUserPerDay} ausgelesene Dokumente pro Person und Tag (jedes Dokument zählt einzeln). Die Datei ist gespeichert; bitte die Felder von Hand ausfüllen oder morgen erneut auslesen.` };
  if (usage.totalToday >= limits.totalPerDay)
    return { ok: false, code: "limit", message: `Das Tageslimit des Büros ist erreicht: ${limits.totalPerDay} ausgelesene Dokumente pro Tag. Die Datei ist gespeichert; bitte die Felder von Hand ausfüllen oder morgen erneut auslesen.` };
  if (usage.monthCostEur >= limits.monthlyBudgetEur)
    return { ok: false, code: "limit", message: `Das Monatsbudget für die Auslesung ist aufgebraucht (${formatEur(usage.monthCostEur)} von ${formatEur(limits.monthlyBudgetEur)}). Die Datei ist gespeichert; bitte die Felder von Hand ausfüllen. Ab dem Monatsersten geht es wieder.` };
  return null;
}

function formatEur(v: number): string {
  return `${v.toFixed(2).replace(".", ",")} €`;
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
