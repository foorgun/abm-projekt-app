// Reine Logik der Edge Function versorger-suche: Eingabeprüfung, Anweisung an die KI (mit Websuche), Lesen und Prüfen der
// Antwort, Zwischenspeicher-Schlüssel und Kosten. Ohne Importe, damit dieselbe Datei in Deno (Funktion) und in der App
// (Vorschlag, Demo-Modus, vitest) läuft. Die App bindet sie über src/lib/planungsprotokoll/versorger.ts ein.
//
// Gesucht wird zum Bauort: Genehmigungsbehörde (Bauamt), Wasserversorger, Abwasser (meist Tiefbauamt der Stadt bzw.
// Gemeinde) und Stromnetzbetreiber. Absprache ABM 11.11.2026: „per Google bzw. KI ermitteln“, immer nur als Vorschlag.
// An den KI-Dienst gehen nur PLZ, Ort, Ortsteil und Bundesland des Bauorts: keine Namen, keine Straße, keine Projektdaten.

export const VERSORGER_ROLLEN = ["bauamt", "wasser", "abwasser", "strom"] as const;
export type VersorgerRolle = (typeof VERSORGER_ROLLEN)[number];

export const ROLLE_TEXT: Record<VersorgerRolle, string> = {
  bauamt: "Genehmigungsbehörde (Bauamt)",
  wasser: "Wasserversorger",
  abwasser: "Abwasser",
  strom: "Stromnetzbetreiber",
};

export const DEFAULT_MODEL = "claude-sonnet-5-5";
/** Höchstens so viele Suchen an den KI-Dienst je Person und Tag (Treffer aus dem Zwischenspeicher zählen nicht) */
export const MAX_ABRUFE_PRO_TAG = 20;
/** Zuständigkeiten ändern sich selten: Treffer gelten 180 Tage */
export const CACHE_TAGE = 180;
/** Websuchen je Anfrage (vier Rollen, je ein bis zwei Suchen) */
export const MAX_SUCHEN = 8;
export const TIMEOUT_MS = 120_000;
/** Preise in USD: Tokens je Million, Websuche je Suche (10 USD je 1000) */
export const PREISE: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
export const PREIS_SUCHE_USD = 0.01;

export type Sicherheit = "hoch" | "mittel" | "niedrig";

export interface Vorschlag {
  name: string;
  anschrift: string | null;
  tel: string | null;
  email: string | null;
  /** Seite, auf der die Angabe steht (von der KI besucht) */
  quelle: string | null;
  sicherheit: Sicherheit;
  /** Kurze Begründung, z. B. „Landratsamt, da Gemeinde ohne eigene Baurechtsbehörde“ */
  hinweis: string | null;
}

export interface Anfrage {
  plz: string;
  ort: string;
  ortsteil: string | null;
  bundesland: string | null;
}

export interface Antwort {
  ok: true;
  vorschlaege: Partial<Record<VersorgerRolle, Vorschlag>>;
  /** Aus dem Zwischenspeicher (keine neue Suche) */
  gespeichert: boolean;
  abgerufenAm: string;
}

export interface Fehler {
  ok: false;
  code: "forbidden" | "disabled" | "limit" | "invalid" | "nicht_lesbar" | "error";
  message: string;
}

const clean = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t.length <= max ? t : null;
};

/** Aufruf prüfen: PLZ fünfstellig, Ort Pflicht, alles kurz. */
export function parseAnfrage(body: unknown): { ok: true; anfrage: Anfrage } | Fehler {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const plz = clean(b.plz, 5);
  const ort = clean(b.ort, 80);
  if (!plz || !/^\d{5}$/.test(plz)) return { ok: false, code: "invalid", message: "Für die Suche fehlt die fünfstellige PLZ des Bauorts." };
  if (!ort) return { ok: false, code: "invalid", message: "Für die Suche fehlt der Ort des Bauorts." };
  return { ok: true, anfrage: { plz, ort, ortsteil: clean(b.ortsteil, 80), bundesland: clean(b.bundesland, 40) } };
}

/** Schlüssel im Zwischenspeicher: PLZ, Ort und Ortsteil, klein und ohne Satzzeichen. */
export function cacheSchluessel(a: Anfrage): string {
  const n = (s: string | null) => (s ?? "").toLocaleLowerCase("de").replace(/ß/g, "ss").replace(/[^a-z0-9äöü]+/g, "");
  return [a.plz, n(a.ort), n(a.ortsteil)].join("|");
}

export const cacheGrenze = (now: Date): string => new Date(now.getTime() - CACHE_TAGE * 86_400_000).toISOString();
export const tagesbeginn = (now: Date): string => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

export function kostenEur(model: string, input: number, output: number, suchen: number, usdEur = 1): number {
  const p = PREISE[model] ?? { input: 10, output: 50 };
  const usd = (input * p.input + output * p.output) / 1_000_000 + suchen * PREIS_SUCHE_USD;
  return Math.round(usd * usdEur * 10_000) / 10_000;
}

export const SYSTEM = `Du recherchierst für ein Architekturbüro Zuständigkeiten zu einem Bauort in Deutschland. Nutze die Websuche und
verlasse dich nur auf offizielle Seiten (Gemeinde, Stadt, Landratsamt, Versorger, Netzbetreiber). Erfinde nie Telefonnummern,
E-Mail-Adressen oder Anschriften: Was du auf keiner Seite gefunden hast, ist null. Antworte am Ende ausschließlich mit einem
JSON-Objekt, ohne Text davor oder danach.`;

/** Anweisung an die KI: nur Ortsangaben, keine Personen. */
export function frage(a: Anfrage): string {
  const ort = [`PLZ ${a.plz}`, a.ort, a.ortsteil ? `Ortsteil ${a.ortsteil}` : null, a.bundesland].filter(Boolean).join(", ");
  return `Bauort: ${ort}.

Finde für einen Neubau (Einfamilienhaus) an diesem Bauort:
- "bauamt": die Behörde, bei der der Bauantrag genehmigt wird (untere Baurechtsbehörde / Bauaufsicht). In Baden-Württemberg ist
  das die Stadt oder Gemeinde, wenn sie eine eigene Baurechtsbehörde hat (oft Große Kreisstadt oder Verwaltungsgemeinschaft),
  sonst das Baurechtsamt des Landratsamts. In Bayern das Landratsamt bzw. die kreisfreie Stadt oder Große Kreisstadt. Name mit
  Amt, z. B. "Stadt Ulm, Hauptabteilung Bauordnung" oder "Landratsamt Alb-Donau-Kreis, Baurechtsamt".
- "wasser": wer das Trinkwasser liefert (Gemeinde, Stadtwerke, Zweckverband).
- "abwasser": wer für Abwasser und Kanalanschluss zuständig ist (meist Tiefbauamt der Stadt bzw. Gemeinde, sonst ein
  Abwasserzweckverband), z. B. "Stadt Ulm, Tiefbauamt".
- "strom": der Stromverteilnetzbetreiber (Netzbetreiber, nicht der Stromlieferant), z. B. "Netze BW GmbH", "SWU Netze GmbH",
  "Westnetz GmbH", "Bayernwerk Netz GmbH".

Je Eintrag: name, anschrift (Straße Hausnummer, PLZ Ort der zuständigen Stelle), tel, email (allgemeine Adresse der Stelle,
keine Personen), quelle (URL der Seite, auf der die Angaben stehen), sicherheit ("hoch", wenn eine offizielle Seite die
Zuständigkeit für genau diesen Ort nennt; "mittel", wenn abgeleitet, z. B. Gemeinde ohne eigene Angabe; "niedrig" sonst),
hinweis (ein kurzer Satz zur Begründung oder null). Nicht gefunden: der ganze Eintrag ist null.

Antwortformat (nur dieses JSON):
{"bauamt": {...} | null, "wasser": {...} | null, "abwasser": {...} | null, "strom": {...} | null}`;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;
const MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function vorschlagLesen(v: unknown): Vorschlag | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = clean(o.name, 160);
  if (!name) return null;
  const quelle = clean(o.quelle, 500);
  const email = clean(o.email, 120);
  const tel = clean(o.tel, 40);
  const s = o.sicherheit;
  return {
    name,
    anschrift: clean(o.anschrift, 200),
    // Telefonnummern nur mit Ziffern, E-Mail und Quelle nur in gültiger Form; sonst lieber leer
    tel: tel && /\d{4,}/.test(tel.replace(/\D/g, "")) ? tel : null,
    email: email && MAIL_RE.test(email) ? email : null,
    quelle: quelle && URL_RE.test(quelle) ? quelle : null,
    sicherheit: s === "hoch" || s === "mittel" || s === "niedrig" ? s : "niedrig",
    hinweis: clean(o.hinweis, 300),
  };
}

/** Das JSON aus der Schlussantwort lesen (auch mit Codeblock oder Text drumherum). null: nicht lesbar. */
export function antwortLesen(text: string): Partial<Record<VersorgerRolle, Vorschlag>> | null {
  const start = text.indexOf("{");
  const ende = text.lastIndexOf("}");
  if (start < 0 || ende <= start) return null;
  let roh: unknown;
  try {
    roh = JSON.parse(text.slice(start, ende + 1));
  } catch {
    return null;
  }
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const out: Partial<Record<VersorgerRolle, Vorschlag>> = {};
  for (const r of VERSORGER_ROLLEN) {
    const v = vorschlagLesen((roh as Record<string, unknown>)[r]);
    if (v) out[r] = v;
  }
  return out;
}
