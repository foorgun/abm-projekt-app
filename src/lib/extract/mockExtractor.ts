// Mock-Extractor für den Demo-Modus: liest Text-PDFs und DOCX im Browser, ohne externe Aufrufe.
// Scans und Fotos kann er nicht lesen. Im Demo-Modus liefert er dafür die erfundenen Beispielwerte aus fixtures.ts
// (damit sich der Ablauf zeigen lässt), sonst nur, was im Dateinamen steht. Der echte Extractor ist die
// Edge Function extract-project (docs/vertrag-extraktion.md).

import { checkContractFile } from "./contractFile";
import { SCAN_WERKVERTRAG_FELDER } from "./fixtures";
import { docxText, pdfPages } from "./readText";
import { emptyFields, normalizeFields, type DraftFieldKey, type ProjectDraft, type ProjectExtractor, type Sicherheit, type Vertragsart } from "./types";

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
  if (/werkvertrag|hausvertrag|bauvertrag/i.test(text)) return "werkvertrag";
  return null;
}

/** "Hoffmann, Jonas" oder "Familie Anna und Jonas Hoffmann" → Nachname und Anzeigename. */
export function splitName(raw: string): { label: string; name: string } {
  const clean = raw.replace(/^(?:(?:Herr|Herrn|Frau|Familie|Eheleute)\s+)+/, "").trim();
  const comma = clean.match(/^([^,]+),\s*(.+)$/);
  if (comma) return { label: comma[1].trim(), name: `${comma[2].trim()} ${comma[1].trim()}` };
  const words = clean.split(/\s+/);
  return { label: words[words.length - 1], name: clean };
}

/** Wörter im Dateinamen, die kein Name sind. */
const FILE_WORDS = /^(werkvertrag|vertrag|vermessungsvertrag|vermessungsauftrag|vermessung|bauvertrag|hausvertrag|scan|kopie|final|unterschrieben|signed|entwurf|vorlage|beispiel|neu|pdf|docx|img|foto|bild|dokument|familie|herr|frau|und|abm)$/i;

/**
 * Felder aus dem Text (eine Zeichenkette je Seite) und dem Dateinamen.
 * Sicherheit: "hoch" bei eindeutig beschrifteter Stelle (z. B. "Telefon: …"), "mittel" bei Mustern ohne klare
 * Beschriftung, "niedrig" bei allem, was nur aus dem Dateinamen geraten ist. Leere Formularfelder ("Bauherr: ____")
 * ergeben keinen Wert.
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

  // --- Bauherren: "Bauherr: Familie Anna und Jonas Hoffmann", "1. Bauherr (Name, Vorname): Hoffmann, Jonas" ---------
  const person = `((?:(?:Herr|Herrn|Frau|Familie|Eheleute|und|u\\.) +)*${NAME}(?:, *${NAME}| +(?:und +)?${NAME}){0,3})`;
  const label = (n: string) => `(?:${n}\\.? *Bauherr(?:in)?|Bauherr(?:in)? *${n})(?: *\\([^)\\n]*\\))? *:? *`;
  const first = find(pages, new RegExp(label("1") + person)) ?? find(pages, new RegExp(`(?:Bauherr(?:en|in|schaft)?|Auftraggeber(?:in)?) *:? *${person}`));
  if (first) {
    const n = splitName(first.wert);
    put("bauherrLabel", first, "hoch", n.label);
    put("bauherrName", first, "hoch", n.name);
  }
  const second = find(pages, new RegExp(label("2") + person));
  if (second) put("bauherr2Name", second, "hoch", splitName(second.wert).name);
  const marked = find(pages, /(?:☒|\[x\]) *(Eheleute|Bauherrengemeinschaft)/i);
  put("rechtsform", marked, "hoch");

  // --- Kontakt -----------------------------------------------------------------------------------------
  put("phone", find(pages, /(?:Tel(?:efon)?\.?|Mobil|Handy) *:? *(\+?\d[\d /()-]{5,}\d)/i), "hoch");
  put("email", find(pages, /(?:E-?Mail) *:? *([^\s@]+@[^\s@]+\.[a-z]{2,})/i), "hoch");
  put("email", find(pages, /([^\s@:;,]+@[^\s@]+\.[a-z]{2,})/i), "mittel");
  // Straße Hausnummer, PLZ Ort (nur innerhalb einer Zeile)
  const street = "[A-ZÄÖÜ][\\wäöüß.-]*(?: [A-ZÄÖÜ]?[\\wäöüß.-]+)* \\d+ ?[a-z]? *, *\\d{5} +[A-ZÄÖÜ][\\wäöüß-]+(?: [\\wäöüß-]+)?";
  put("address", find(pages, new RegExp(`(?:wohnhaft(?: +in)?|Anschrift|Adresse) *:? *(${street})`)), "hoch");

  // --- Baugrundstück (im Werkvertrag steht keines; normalizeFields verwirft es dort wieder) --------------
  const bau = find(pages, new RegExp(`(?:Bauadresse|Baugrundst(?:ü|ue)ck|Bauort|Baustelle) *:? *(${street})`));
  put("buildingAddress", bau, "hoch");
  if (bau) put("location", bau, "hoch", bau.wert.match(/\d{5} +(.+)$/)?.[1] ?? null);
  put("flurstueck", find(pages, /Flurst(?:ü|ue)ck(?:s-?Nr\.?|snummer)? *:? *(\d+(?:\/\d+)?)/), "hoch");
  put("gemarkung", find(pages, /Gemarkung *:? *([A-ZÄÖÜ][\wäöüß-]+(?: [A-ZÄÖÜ][\wäöüß-]+)?)/), "hoch");

  // --- Beteiligte ----------------------------------------------------------------------------------------
  put("company", find(pages, /(?:Hausbaufirma|Haushersteller|Hausbauunternehmen|Auftragnehmer(?:in)?) *:? *([A-ZÄÖÜ][^\n,;_]{2,60})/), "hoch");
  put("vermesser", find(pages, /(?:Vermesser|Vermessungsstelle) *: *([A-ZÄÖÜ][^\n,;_·]{2,60})/), "hoch");
  put("vermesser", find(pages, /((?:Ingenieurb(?:ü|ue)ro|Vermessungsb(?:ü|ue)ro) +[A-ZÄÖÜ][^\n,;_·]{1,40}?)(?= *[·,;\n]|$)/m), "mittel");

  // --- Vertrag (Metadaten) -------------------------------------------------------------------------------
  const whole = pages.join("\n");
  const art = vertragsartOf(whole.slice(0, 600)) ?? vertragsartOf(whole);
  const artHit = art ? find(pages, /((?:Werk|Haus|Bau|Vermessungs|Vermesser)(?:vertrag|auftrag|leistung))/i) : null;
  put("vertragsart", artHit, "hoch", art);
  const datum = find(pages, /(?:Vertragsdatum|Datum|, *den) *:? *(\d{1,2}\.\d{1,2}\.\d{4})/);
  put("vertragsdatum", datum, datum && /Vertragsdatum/.test(datum.zeile) ? "hoch" : "mittel", datum ? isoDate(datum.wert) : null);
  const preis = find(pages, /(?:Vertragspreis|Festpreis|Gesamtpreis|Pauschalpreis|Auftragssumme|Honorar)[^\n\d_]{0,40}(\d{1,3}(?:\.\d{3})*(?:,\d{2})?) *(?:€|EUR|Euro)/);
  put("vertragspreis", preis, "hoch", preis ? `${preis.wert} €` : null);
  put("angebotsnummer", find(pages, /Angebot(?:s)?(?:-| )?(?:Nr\.?|nummer) *:? *([A-Z0-9][\w/-]{2,20})/), "hoch");
  put("haustyp", find(pages, /Haustyp *:? *([A-ZÄÖÜ0-9][^\n,;_]{1,40})/), "hoch");
  put("foerderung", find(pages, /((?:☒|\[x\]) *KfW[^\n]{0,40})/i), "hoch", "ja");

  // --- Dateiname als Notlösung -------------------------------------------------------------------------
  const base = datei.name.replace(/\.[a-z0-9]+$/i, "");
  const fromFile = (key: DraftFieldKey, wert: string | null | undefined) => {
    if (!wert || felder[key].wert) return;
    felder[key] = { wert, quelle: { text: `Dateiname: ${datei.name}`, seite: null }, sicherheit: "niedrig" };
  };
  fromFile("vertragsart", vertragsartOf(base));
  fromFile("bauherrLabel", base.split(/[\s_.,()-]+/).find((w) => new RegExp(`^${NAME}$`).test(w) && !FILE_WORDS.test(w)));

  // Leere Vorlage: viele Beschriftungen mit Strichen statt Eintragungen
  const blanks = (whole.match(/: *_{4,}/g) ?? []).length;
  if (blanks >= 3) hinweise.push("Das sieht nach einer leeren Vorlage aus: die Formularfelder sind nicht ausgefüllt. Bitte die Angaben von Hand eintragen.");
  if (textquelle === "dateiname") hinweise.push("In dieser Datei wurde kein lesbarer Text gefunden. Vorschläge stammen nur aus dem Dateinamen.");
  return { datei, textquelle, extractor: "mock", gescannt: false, felder: normalizeFields(felder, false), hinweise };
}

/**
 * Liest die Datei im Browser und erzeugt den Entwurf. Keine Daten verlassen den Browser.
 * `demo`: bei Scans ohne lesbaren Text die erfundenen Beispielwerte liefern (nur im Demo-Modus, nie mit echten Daten).
 */
export function createMockExtractor(opts: { demo: boolean }): ProjectExtractor {
  return {
    name: "mock",
    async extract(file: File): Promise<ProjectDraft> {
      const datei = { name: file.name, size: file.size, type: file.type };
      const check = checkContractFile(datei);
      if (!check.ok) throw new Error(check.reason);
      let pages: string[] = [];
      try {
        if (check.kind === "pdf") pages = await pdfPages(await file.arrayBuffer());
        else if (check.kind === "docx") pages = [await docxText(await file.arrayBuffer())].filter(Boolean);
      } catch {
        pages = []; // nicht lesbar: weiter wie bei einem Scan
      }
      if (pages.length) return draftFromText(datei, pages, check.kind === "pdf" ? "pdf" : "docx");

      // Kein Text: Scan oder Foto
      if (opts.demo && check.kind !== "docx") {
        return {
          datei,
          textquelle: "bild",
          extractor: "mock",
          gescannt: true,
          felder: normalizeFields(SCAN_WERKVERTRAG_FELDER, true),
          hinweise: ["Demo: Der Testbetrieb kann Scans nicht lesen. Die Vorschläge sind erfundene Beispielwerte und stammen nicht aus dieser Datei."],
        };
      }
      const draft = draftFromText(datei, [], "dateiname");
      return { ...draft, gescannt: check.kind !== "docx", felder: normalizeFields(draft.felder, true) };
    },
  };
}

export const mockExtractor = createMockExtractor({ demo: false });
