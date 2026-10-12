// Mock-Extractor: erzeugt aus Dateiname und Text plausible Projektfelder. Läuft vollständig im Browser,
// ohne externe Aufrufe. Er ersetzt keine echte Texterkennung: gescannte PDFs und Bilder liefern nur,
// was im Dateinamen steht. Der echte Extractor kommt später als Edge Function (docs/vertrag-extraktion.md).

import { checkContractFile } from "./contractFile";
import { docxText, pdfPages } from "./readText";
import { emptyFields, type DraftField, type DraftFieldKey, type ProjectDraft, type ProjectExtractor, type Sicherheit, type Vertragsart } from "./types";

const NAME = "[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?";
const SNIPPET_MAX = 90;

interface Hit {
  wert: string;
  zeile: string;
  seite: number;
}

/** Erster Treffer über alle Seiten; `wert` ist die erste Gruppe, `zeile` die Textzeile des Treffers. */
function find(pages: string[], re: RegExp): Hit | null {
  for (let i = 0; i < pages.length; i++) {
    const m = re.exec(pages[i]);
    if (!m) continue;
    const from = pages[i].lastIndexOf("\n", m.index) + 1;
    const to = pages[i].indexOf("\n", m.index + m[0].length);
    return { wert: (m[1] ?? m[0]).trim(), zeile: pages[i].slice(from, to < 0 ? undefined : to).trim(), seite: i + 1 };
  }
  return null;
}

const shorten = (s: string) => (s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : s);

export function isoDate(german: string): string | null {
  const m = german.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function vertragsartOf(text: string): Vertragsart | null {
  if (/vermessungs(vertrag|auftrag|leistung)|vermesser(vertrag|auftrag)/i.test(text)) return "vermessungsvertrag";
  if (/werkvertrag|architektenvertrag|planungsvertrag|hausvertrag|bauvertrag/i.test(text)) return "werkvertrag";
  return null;
}

/** Wörter im Dateinamen, die kein Name sind. */
const FILE_WORDS = /^(werkvertrag|vertrag|vermessungsvertrag|vermessungsauftrag|vermessung|architektenvertrag|bauvertrag|scan|kopie|final|unterschrieben|signed|entwurf|neu|pdf|docx|img|foto|bild|dokument|familie|herr|frau|und|abm)$/i;

/**
 * Felder aus dem Text (eine Zeichenkette je Seite) und dem Dateinamen.
 * Sicherheit: "hoch" bei eindeutig beschrifteter Stelle (z. B. "Telefon: …"), "mittel" bei Mustern ohne klare
 * Beschriftung, "niedrig" bei allem, was nur aus dem Dateinamen geraten ist.
 */
export function draftFromText(datei: ProjectDraft["datei"], pages: string[], textquelle: ProjectDraft["textquelle"]): ProjectDraft {
  const felder = emptyFields();
  const hinweise: string[] = [];
  const pageKnown = textquelle === "pdf";
  const put = (key: DraftFieldKey, hit: Hit | null, sicherheit: Sicherheit, wert?: string | null) => {
    if (!hit || felder[key].wert) return;
    const value = wert === undefined ? hit.wert : wert;
    if (!value) return;
    felder[key] = { wert: value, quelle: { text: shorten(hit.zeile), seite: pageKnown ? hit.seite : null }, sicherheit };
  };

  // --- Bauherr: "Bauherr: Familie Anna und Jonas Hoffmann" ---------------------------------------------
  const bauherr = find(pages, new RegExp(`(?:Bauherr(?:en|in|schaft)?|Auftraggeber(?:in)?)\\s*:?\\s*((?:(?:Herr|Frau|Familie|Eheleute|Herrn|und|u\\.)\\s+)*${NAME}(?:\\s+(?:und\\s+)?${NAME}){0,3})`));
  if (bauherr) {
    const words = bauherr.wert.split(/\s+/);
    put("bauherrLabel", bauherr, "hoch", words[words.length - 1]);
    put("bauherrName", bauherr, "hoch");
  }

  // --- Kontakt -----------------------------------------------------------------------------------------
  put("phone", find(pages, /(?:Tel(?:efon)?\.?|Mobil|Handy)\s*:?\s*(\+?\d[\d /()-]{5,}\d)/i), "hoch");
  const mail = find(pages, /(?:E-?Mail)\s*:?\s*([^\s@]+@[^\s@]+\.[a-z]{2,})/i);
  put("email", mail, "hoch");
  put("email", find(pages, /([^\s@:;,]+@[^\s@]+\.[a-z]{2,})/i), "mittel");
  // Straße Hausnummer, PLZ Ort (nur innerhalb einer Zeile)
  const street = "[A-ZÄÖÜ][\\wäöüß.-]*(?: [A-ZÄÖÜ]?[\\wäöüß.-]+)* \\d+ ?[a-z]? *, *\\d{5} +[A-ZÄÖÜ][\\wäöüß-]+(?: [\\wäöüß-]+)?";
  put("address", find(pages, new RegExp(`(?:wohnhaft(?:\\s+in)?|Anschrift|Adresse)\\s*:?\\s*(${street})`)), "hoch");

  // --- Baugrundstück -----------------------------------------------------------------------------------
  const bau = find(pages, new RegExp(`(?:Bauadresse|Baugrundst(?:ü|ue)ck|Bauort|Bauvorhaben(?:\\s+in)?|Baustelle)\\s*:?\\s*(${street})`));
  put("buildingAddress", bau, "hoch");
  if (bau) put("location", bau, "hoch", bau.wert.match(/\d{5}\s+(.+)$/)?.[1] ?? null);
  put("location", find(pages, /(?:Bauort|Gemeinde)\s*:?\s*(?:\d{5}\s+)?([A-ZÄÖÜ][\wäöüß-]+(?:\s[A-ZÄÖÜ][\wäöüß-]+)?)/), "mittel");
  const flst = find(pages, /(Flurst(?:ü|ue)ck(?:s-?Nr\.?|snummer)?\s*:?\s*\d+(?:\/\d+)?(?:\s*,?\s*Gemarkung\s+[A-ZÄÖÜ][\wäöüß-]+)?)/);
  put("flurstueck", flst, "hoch", flst?.wert.replace(/Flurst(?:ü|ue)ck(?:s-?Nr\.?|snummer)?\s*:?\s*/, "Flurstück ") ?? null);

  // --- Beteiligte und Nummern --------------------------------------------------------------------------
  put("company", find(pages, /(?:Hausbaufirma|Haushersteller|Hausbauunternehmen|Auftragnehmer Hausbau)\s*:?\s*([^\n,;]{3,60})/), "hoch");
  put("salesperson", find(pages, new RegExp(`(?:Verk(?:ä|ae)ufer|Fachberater|Hausberater)(?:in)?\\s*:?\\s*((?:Herr|Frau)?\\s*${NAME}\\s+${NAME})`)), "hoch");
  put("hausbauNr", find(pages, /(?:Hausbau|Auftrags|Bauvorhaben)s?-?\s?(?:Nr\.?|Nummer)\s*:?\s*([A-Za-z]{1,4}-?\d{3,8})/), "hoch");
  put("abmNr", find(pages, /ABM-?\s?(?:Nr\.?|Nummer)\s*:?\s*(\d{4}-\d{1,4})/), "hoch");
  put("vermesser", find(pages, /(?:Vermesser|Vermessungsb(?:ü|ue)ro|Vermessungsstelle)\s*:\s*([^\n,;]{3,60})/), "hoch");
  put("vermesser", find(pages, /((?:Ingenieurb(?:ü|ue)ro|Vermessungsb(?:ü|ue)ro|Vermessung)\s+[A-ZÄÖÜ][^\n,;]{2,40})/), "mittel");

  // --- Vertrag -----------------------------------------------------------------------------------------
  const whole = pages.join("\n");
  const art = vertragsartOf(whole.slice(0, 600)) ?? vertragsartOf(whole);
  const artHit = art ? find(pages, /((?:Werk|Architekten|Planungs|Haus|Bau|Vermessungs|Vermesser)(?:vertrag|auftrag|leistung))/i) : null;
  put("vertragsart", artHit, "hoch", art);
  const datum = find(pages, /(?:Vertragsdatum|Datum|,\s*den)\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
  put("vertragsdatum", datum, datum && /Vertragsdatum/.test(datum.zeile) ? "hoch" : "mittel", datum ? isoDate(datum.wert) : null);
  const honorar = find(pages, /(?:Honorar|Pauschalhonorar|Pauschalpreis|Verg(?:ü|ue)tung|Gesamtpreis|Auftragssumme)[^\n\d]{0,40}(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:€|EUR|Euro)/);
  put("honorar", honorar, "hoch", honorar ? `${honorar.wert} €` : null);

  // --- Dateiname als Notlösung -------------------------------------------------------------------------
  const base = datei.name.replace(/\.[a-z0-9]+$/i, "");
  const fileHit: Hit = { wert: "", zeile: `Dateiname: ${datei.name}`, seite: 1 };
  const fromFile = (key: DraftFieldKey, wert: string | null | undefined) => {
    if (!wert || felder[key].wert) return;
    felder[key] = { wert, quelle: { text: fileHit.zeile, seite: null }, sicherheit: "niedrig" };
  };
  const words = base.split(/[\s_.,()-]+/).filter(Boolean);
  fromFile("vertragsart", vertragsartOf(base));
  fromFile("abmNr", base.match(/(?<!\d)(\d{4}-\d{1,4})(?!\d)/)?.[1]);
  fromFile("bauherrLabel", words.find((w) => new RegExp(`^${NAME}$`).test(w) && !FILE_WORDS.test(w)));
  if (!felder.vertragsart.wert) felder.vertragsart = { wert: "sonstiges", quelle: null, sicherheit: "niedrig" };

  if (textquelle === "dateiname") hinweise.push("In dieser Datei wurde kein lesbarer Text gefunden. Vorschläge stammen nur aus dem Dateinamen.");
  return { datei, textquelle, felder, hinweise };
}

/** Liest die Datei im Browser und erzeugt den Entwurf. Keine Daten verlassen den Browser. */
export const mockExtractor: ProjectExtractor = {
  name: "mock",
  async extract(file: File): Promise<ProjectDraft> {
    const datei = { name: file.name, size: file.size, type: file.type };
    const check = checkContractFile(datei);
    if (!check.ok) throw new Error(check.reason);
    let pages: string[] = [];
    let textquelle: ProjectDraft["textquelle"] = "dateiname";
    try {
      if (check.kind === "pdf") pages = await pdfPages(await file.arrayBuffer());
      else if (check.kind === "docx") pages = [await docxText(await file.arrayBuffer())].filter(Boolean);
    } catch {
      pages = []; // nicht lesbar: weiter mit dem Dateinamen
    }
    if (pages.length) textquelle = check.kind === "pdf" ? "pdf" : "docx";
    const draft = draftFromText(datei, pages, textquelle);
    if (check.kind === "bild") draft.hinweise = ["Bild: Text wird im Testbetrieb noch nicht erkannt. Vorschläge stammen nur aus dem Dateinamen."];
    return draft;
  },
};

export type { DraftField };
