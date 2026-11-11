// Felder aus dem Text einer Anfrage-Mail (Bauherr, Baugrundstück). Hausbaufirma und Verkäufer kommen aus dem Absender
// (eml.ts, matchSender), nicht von hier.
//   * Edge (VITE_PROJECT_EXTRACTOR=edge): Betreff und gekürzter Text gehen an die Edge Function extract-project
//     (Modus Mail). Gekürzt heißt: ohne Signatur, Rechtshinweise und Links, höchstens MAIL_EXCERPT_CHARS Zeichen
//     (nur, was zur Zuordnung nötig ist, CLAUDE.md). Zählt wie ein Dokument gegen das Tageslimit.
//   * Sonst (Demo, mock): einfache Erkennung im Browser (Flurstück, Straße mit Ort, "Familie …").

import { extractorKind, type ExtractorKind } from "../extract";
import { emptyFields, ExtractUnavailable, normalizeFields, type DraftFieldKey, type ExtractRequest, type ExtractResponse, type ProjectDraft } from "../extract/types";
import { fold, type ParsedMail } from "./eml";

/** Felder aus einer Mail; muss zu MAIL_FIELDS der Edge Function passen (Test). */
export const MAIL_DRAFT_FIELDS: readonly DraftFieldKey[] = ["bauherrLabel", "bauherrName", "phone", "email", "address", "bauherr2Name", "buildingAddress", "location", "flur", "flurstueck", "gemarkung"];

/** Höchstens so viele Zeichen gehen an die Auslesung (Grenze der Edge Function: MAX_MAIL_CHARS). */
export const MAIL_EXCERPT_CHARS = 6000;

const FORWARD = /^(?:-{2,}\s*)?(?:ursprüngliche nachricht|original message|weitergeleitete nachricht|forwarded message)\b/i;
const CLOSING = /^(?:mit\s+)?(?:(?:freundlichen|besten|vielen|lieben|herzlichen|viele|beste|liebe|schöne|sonnige)\s+)?(?:grüßen|grüße|grüssen|grüsse|gruß|gruss)\b|^(?:lg|mfg|vg|bg|best regards|kind regards|regards)\b/i;
const DISCLAIMER = /diese e-?mail enthält|this e-?mail|hinweise zum datenschutz|datenschutzhinweis|amtsgericht|registergericht|geschäftsführer|ust\.?-?id|handelsregister|^sitz der (?:firma|gesellschaft)/i;
const URL_RE = /<?https?:\/\/[^\s>]+>?/g;

/**
 * Text für die Auslesung: je Abschnitt (die Mail und ggf. weitergeleitete Mails) bis zur Grußformel, zur Unterschrift
 * mit dem Namen des Absenders oder zu Rechtshinweisen; Links entfernt; gekürzt.
 */
export function mailExcerpt(mail: Pick<ParsedMail, "text" | "fromName">): string {
  const nameTokens = new Set(fold(mail.fromName ?? "").split(/[^a-z0-9]+/).filter((t) => t.length >= 2));
  const isSignatureName = (line: string) => {
    const t = fold(line).split(/[^a-z0-9]+/).filter(Boolean);
    return nameTokens.size >= 2 && t.length >= 2 && t.length <= 4 && t.every((x) => nameTokens.has(x));
  };
  const out: string[] = [];
  let cut = false;
  let content = 0;
  for (const raw of mail.text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(URL_RE, "").trimEnd();
    const trimmed = line.trim();
    if (FORWARD.test(trimmed)) {
      // weitergeleitete Mail: neuer Abschnitt, wieder lesen
      cut = false;
      content = 0;
      out.push("", trimmed);
      continue;
    }
    if (cut) continue;
    if (content > 0 && (trimmed === "--" || CLOSING.test(trimmed) || isSignatureName(trimmed) || DISCLAIMER.test(trimmed))) {
      cut = true;
      continue;
    }
    // Zeilen, die nur aus Link-Resten bestehen (z. B. Symbole aus der Signatur), weglassen
    if (!trimmed && raw.trim()) continue;
    if (trimmed) content++;
    out.push(line);
  }
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > MAIL_EXCERPT_CHARS ? text.slice(0, MAIL_EXCERPT_CHARS) : text;
}

function restrict(felder: ProjectDraft["felder"]): ProjectDraft["felder"] {
  const out = emptyFields();
  for (const k of MAIL_DRAFT_FIELDS) if (felder[k]?.wert) out[k] = { ...felder[k], quelle: felder[k].quelle ? { ...felder[k].quelle!, seite: null } : null };
  return out;
}

const NAME = "[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?";
const STREET = "(?:(?:Am|An der|Im|Auf der|In der|Zum|Zur)\\s)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]*(?:straße|strasse|str\\.|weg|gasse|platz|allee|ring|steige|halde)\\s+\\d+\\s?[a-z]?";

/** Erkennung im Browser (Demo): bewusst einfach, Sicherheit höchstens "mittel". */
export function mockMailFields(subject: string | null, text: string): ProjectDraft["felder"] {
  const felder = emptyFields();
  const all = `${subject ?? ""}\n${text}`;
  const set = (k: DraftFieldKey, wert: string, quelle: string) => (felder[k] = { wert: wert.trim(), quelle: { text: quelle.trim().slice(0, 90), seite: null }, sicherheit: "mittel" });
  const flur = all.match(/(?:Flurst(?:ück|\.)?(?:s?nummer)?|Flurnummer|Flur-?Nr\.?)\s*(?::|ist\s+(?:die\s+)?|Nr\.?)?\s*(\d+(?:\/\d+)?)/i);
  if (flur) set("flurstueck", flur[1], flur[0]);
  const addr = all.match(new RegExp(`(${STREET})(?:,\\s*|\\s+in\\s+)(?:(\\d{5})\\s+)?(${NAME}(?:\\s(?:an der|am|ob der|im)\\s${NAME})?)`));
  if (addr) {
    set("buildingAddress", `${addr[1]}, ${addr[2] ? `${addr[2]} ` : ""}${addr[3]}`, addr[0]);
    set("location", addr[3], addr[0]);
  }
  const bauherr = all.match(new RegExp(`(?:Familie|Bauherr(?:en|in)?:?|Kunden?:?)\\s+(?:Herr\\s+|Frau\\s+)?(${NAME}(?:\\s${NAME})?)`));
  if (bauherr) {
    const teile = bauherr[1].split(" ");
    set("bauherrLabel", teile[teile.length - 1], bauherr[0]);
    if (teile.length > 1) set("bauherrName", bauherr[1], bauherr[0]);
  }
  return felder;
}

/** Felder aus der Mail lesen. Wirft ExtractUnavailable (z. B. Tageslimit, nicht freigeschaltet) mit verständlicher Meldung. */
export async function extractProjectFromMail(
  input: { file: File; mail: ParsedMail },
  env: { demo: boolean; call?: (r: ExtractRequest) => Promise<ExtractResponse> },
  kind: ExtractorKind = extractorKind(),
): Promise<ProjectDraft> {
  const text = mailExcerpt(input.mail);
  if (!text) throw new ExtractUnavailable("Die Mail hat keinen Text zum Auslesen.", "error");
  const datei = { name: input.file.name, size: input.file.size, type: input.file.type || "message/rfc822" };
  const edge = kind === "edge" && env.call && !env.demo;
  let felder: ProjectDraft["felder"];
  let hinweise: string[] = [];
  if (edge) {
    let response: ExtractResponse;
    try {
      response = await env.call!({ mail: { subject: input.mail.subject, text } });
    } catch (e) {
      throw new ExtractUnavailable(e instanceof Error ? e.message : "Die Auslesung ist gerade nicht erreichbar.", "error");
    }
    if (!response.ok) throw new ExtractUnavailable(response.message, response.code);
    felder = restrict(normalizeFields(response.felder, false));
    hinweise = response.hinweise.slice(0, 3).map((h) => String(h).slice(0, 200));
  } else {
    felder = restrict(mockMailFields(input.mail.subject, text));
  }
  return { datei, textquelle: "mail", extractor: edge ? "edge" : "mock", gescannt: false, felder, hinweise };
}
