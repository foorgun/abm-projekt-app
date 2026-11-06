// Anfrage aus einer Mail (.eml): Absender, Datum, Betreff, Nachricht und Anhänge lesen. Ohne Oberfläche (getestet).
//   * Gelesen wird nur im Browser; nichts davon geht an einen Dienst. Die Anhänge laufen danach durch denselben Ablauf
//     wie hineingezogene Dokumente (speichern, einzeln auslesen, in der Prüfmaske bestätigen).
//   * Anhänge werden aufgeteilt: auslesbar (PDF, DOCX, Bild bis 30 MB), nur ablegen (andere erlaubte Dateien, z. B.
//     Excel) und übersprungen (CAD bleibt auf dem Fileserver, ausführbare Dateien, Bilder aus der Signatur).
//   * Weitergeleitete Mails (message/rfc822) liest der Parser mit; ihre Anhänge zählen wie die der äußeren Mail.

import PostalMime, { type Address, type Attachment, type Email } from "postal-mime";
import { checkContractFile } from "../extract/contractFile";
import { checkFile, extension, MAX_UPLOAD_BYTES } from "../files";
import { folderDate } from "../folders";
import type { Company, Salesperson } from "../types";

/** Ordner für die Mail selbst und für Anhänge, die nicht ausgelesen werden (Anfragen kommen vom Verkäufer). */
export const MAIL_FOLDER = "02 Schriftverkehr/02 Schriftverkehr mit Hausbaufirma";

/** Die Mail selbst wird wie jede andere Datei abgelegt: höchstens so groß wie ein Upload. */
export const MAX_EML_BYTES = MAX_UPLOAD_BYTES;

/** Längere Nachrichten werden für das Feld "Nachricht des Verkäufers" gekürzt (die ganze Mail liegt im Projekt). */
export const MAX_MAIL_TEXT = 20_000;

/** Inline-Bilder (bzw. Bilder ohne Dateinamen) unter dieser Größe gelten als Signatur oder Logo. */
export const SIGNATURE_IMAGE_BYTES = 20 * 1024;

export interface SkippedAttachment {
  name: string;
  reason: string;
}

export interface ParsedMail {
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  /** Sendezeit als ISO-Zeitpunkt, null wenn unbekannt */
  date: string | null;
  /** Nachricht als reiner Text (aus HTML umgewandelt, wenn die Mail keinen Text-Teil hat) */
  text: string;
  /** PDF, DOCX, Bild: gehen in die Auslesung und werden je Dokumentart abgelegt */
  readable: File[];
  /** Andere erlaubte Dateien: werden nur abgelegt (MAIL_FOLDER) */
  other: File[];
  skipped: SkippedAttachment[];
}

export function isEmlFile(file: { name: string; type: string }): boolean {
  return extension(file.name) === "eml" || file.type === "message/rfc822";
}

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "message/rfc822": "eml",
  "text/plain": "txt",
};

/** Dateiname ohne Pfadteile und Steuerzeichen; ohne Namen "Anhang 2.pdf" (Endung aus dem Typ). */
export function attachmentName(a: Pick<Attachment, "filename" | "mimeType">, index: number): string {
  const raw = (a.filename ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.{2,}/g, ".")
    .trim();
  if (raw && raw !== ".") return raw.slice(0, 200);
  const ext = MIME_EXT[a.mimeType] ?? "bin";
  return `Anhang ${index + 1}.${ext}`;
}

const byteLength = (c: Attachment["content"]) => (typeof c === "string" ? new TextEncoder().encode(c).length : c.byteLength);

/** Zerlegt die Anhänge in auslesbar, nur ablegen und übersprungen. */
export function sortAttachments(attachments: Attachment[]): Pick<ParsedMail, "readable" | "other" | "skipped"> {
  const readable: File[] = [];
  const other: File[] = [];
  const skipped: SkippedAttachment[] = [];
  const seen = new Set<string>();
  attachments.forEach((a, i) => {
    const name = attachmentName(a, i);
    const size = byteLength(a.content);
    // Bilder, die im Text der Mail stehen (Logo, Signatur), sind keine Unterlagen
    // (Fotos vom Handy kommen oft auch "inline", sind aber groß: nur kleine Inline-Bilder zählen als Signatur)
    const smallInline = size < SIGNATURE_IMAGE_BYTES && (!a.filename || a.disposition === "inline" || Boolean(a.contentId));
    if (a.mimeType.startsWith("image/") && (a.related || smallInline)) {
      skipped.push({ name, reason: "Bild aus der Signatur bzw. dem Mailtext" });
      return;
    }
    if (size <= 0) {
      skipped.push({ name, reason: "Der Anhang ist leer." });
      return;
    }
    // Dieselbe Datei doppelt (z. B. in der Mail und in der weitergeleiteten Mail): einmal reicht
    const key = `${name.toLowerCase()}|${size}`;
    if (seen.has(key)) return;
    seen.add(key);
    const general = checkFile(name, size);
    if (!general.ok) {
      skipped.push({ name, reason: `${general.reason}.` });
      return;
    }
    const type = typeFor(name, a.mimeType);
    const file = new File([a.content as BlobPart], name, { type });
    if (checkContractFile({ name, size, type }).ok) readable.push(file);
    else other.push(file);
  });
  return { readable, other, skipped };
}

/** Typ passend zur Endung (Mailprogramme schicken oft "application/octet-stream"). */
function typeFor(name: string, mimeType: string): string {
  const ext = extension(name);
  const known = Object.entries(MIME_EXT).find(([, e]) => e === ext || (ext === "jpeg" && e === "jpg"));
  if (known) return known[0];
  return mimeType === "application/octet-stream" ? "" : mimeType;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", euro: "€", ndash: "–", mdash: "—" };

/** Einfache Umwandlung HTML → Text (Absätze und Zeilenumbrüche bleiben, Skripte und Stile fallen weg). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mailbox(a: Address | undefined): { name: string | null; email: string | null } {
  if (!a) return { name: null, email: null };
  const m = a.group ? a.group[0] : a;
  return { name: m?.name?.trim() || null, email: m?.address?.trim().toLowerCase() || null };
}

/** Aus dem Ergebnis des Parsers (getrennt, damit es ohne echte Datei testbar ist). */
export function fromEmail(mail: Email): ParsedMail {
  const from = mailbox(mail.from);
  const date = mail.date && !Number.isNaN(Date.parse(mail.date)) ? new Date(mail.date).toISOString() : null;
  const text = (mail.text?.trim() ? mail.text : htmlToText(mail.html ?? "")).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { subject: mail.subject?.trim() || null, fromName: from.name, fromEmail: from.email, date, text, ...sortAttachments(mail.attachments) };
}

export class MailReadError extends Error {}

/** Liest eine .eml-Datei. Wirft MailReadError mit einer verständlichen Meldung. */
export async function readEml(file: File): Promise<ParsedMail> {
  if (file.size <= 0) throw new MailReadError("Die Mail ist leer.");
  if (file.size > MAX_EML_BYTES) throw new MailReadError(`Die Mail ist größer als ${MAX_EML_BYTES / 1024 / 1024} MB.`);
  let mail: Email;
  try {
    mail = await PostalMime.parse(await file.arrayBuffer());
  } catch {
    throw new MailReadError("Die Datei ließ sich nicht als Mail lesen.");
  }
  if (!mail.headers.length) throw new MailReadError("Die Datei ist keine Mail (keine Kopfzeilen gefunden).");
  return fromEmail(mail);
}

/** Text für "Nachricht des Verkäufers": Absender, Datum und Betreff vorneweg, dann die Nachricht. */
export function anfrageTextOf(mail: Pick<ParsedMail, "subject" | "fromName" | "fromEmail" | "date" | "text">): string {
  const von = mail.fromName && mail.fromEmail ? `${mail.fromName} <${mail.fromEmail}>` : (mail.fromName ?? mail.fromEmail);
  const head = [von && `Von: ${von}`, mail.date && `Datum: ${folderDate(berlinDay(mail.date))}`, mail.subject && `Betreff: ${mail.subject}`].filter(Boolean).join("\n");
  const body = mail.text.length > MAX_MAIL_TEXT ? `${mail.text.slice(0, MAX_MAIL_TEXT)} …\n[gekürzt, die ganze Mail liegt im Projekt]` : mail.text;
  return [head, body].filter(Boolean).join("\n\n");
}

/** Tag in Deutschland (YYYY-MM-DD) zu einem ISO-Zeitpunkt. */
export function berlinDay(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(iso));
}

/** Vergleichsform für Namen: klein, Umlaute ausgeschrieben, ohne Akzente ("Grössl" = "groessl"). */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);

/** Freemail-Anbieter: die Domain sagt nichts über die Firma. */
const FREEMAIL = ["gmail", "googlemail", "gmx", "web", "t-online", "outlook", "hotmail", "live", "yahoo", "icloud", "me", "aol", "freenet", "posteo", "mailbox", "arcor", "online", "email", "mail"];

/** Firmenname als Vergleichsform ohne Rechtsform ("Schwabenhaus GmbH & Co. KG" → "schwabenhaus"). */
export function companyKey(name: string): string {
  return fold(name)
    .replace(/\b(gmbh|mbh|ag|kg|ohg|gbr|ug|co|se|e\.?k|haftungsbeschraenkt)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** "Grössl, Sascha" → "Sascha Grössl"; sonst der Name wie angegeben. */
export function displayName(name: string): string {
  const m = name.trim().match(/^([^,]+),\s*([^,]+)$/);
  return (m ? `${m[2]} ${m[1]}` : name).replace(/\s+/g, " ").trim();
}

export interface SenderMatch {
  companyId: string;
  salespersonId: string | null;
  /** Firma erkannt, Verkäufer nicht in den Stammdaten: Name aus dem Absender zum Anlegen */
  newSalesperson: string | null;
}

/**
 * Hausbaufirma und Verkäufer aus dem Absender:
 *   1. genaue Adresse eines Verkäufers;
 *   2. Firma über die Domain: Verkäufer mit derselben Domain gehören zu genau einer Firma, oder der Firmenname steckt in
 *      der Domain ("schwabenhaus.de" → "Schwabenhaus"); nie bei Freemail-Anbietern;
 *   3. Verkäufer der Firma über den Namen (Anzeigename und Adresse, Umlaute egal): alle Namensteile oder eindeutig der
 *      Nachname. Ohne Firma zählt nur ein eindeutiger voller Name (Vor- und Nachname).
 */
export function matchSender(from: { name: string | null; email: string | null }, salespeople: Salesperson[], companies: Company[]): SenderMatch | null {
  const addr = from.email?.toLowerCase() ?? "";
  const known = (id: string) => companies.some((c) => c.id === id);
  const exact = addr ? salespeople.find((s) => s.email?.toLowerCase() === addr && known(s.companyId)) : undefined;
  if (exact) return { companyId: exact.companyId, salespersonId: exact.id, newSalesperson: null };

  const senderTokens = new Set([...tokens(from.name ?? ""), ...tokens(addr.split("@")[0] ?? "")]);
  const full = (s: Salesperson) => {
    const t = tokens(s.name);
    return t.length > 0 && t.every((x) => senderTokens.has(x));
  };
  const lastName = (s: Salesperson) => {
    const t = tokens(s.name);
    return t.length > 0 && senderTokens.has(t[t.length - 1]);
  };

  const domain = addr.split("@")[1] ?? "";
  const label = domain.split(".").slice(-2, -1)[0] ?? "";
  let companyId: string | null = null;
  if (label && !FREEMAIL.includes(label)) {
    const byStaff = new Set(salespeople.filter((s) => s.email?.toLowerCase().split("@")[1] === domain && known(s.companyId)).map((s) => s.companyId));
    if (byStaff.size === 1) [companyId] = byStaff;
    else {
      const key = label.replace(/[^a-z0-9]/g, "");
      const byName = companies.filter((c) => {
        const k = companyKey(c.name);
        return k.length >= 4 && (key === k || (key.length >= 5 && (key.includes(k) || k.includes(key))));
      });
      if (byName.length === 1) companyId = byName[0].id;
    }
  }

  if (!companyId) {
    // ohne Firma: nur ein eindeutiger voller Name zählt (z. B. Verkäufer schreibt von einer privaten Adresse)
    const people = salespeople.filter((s) => tokens(s.name).length >= 2 && full(s) && known(s.companyId));
    return people.length === 1 ? { companyId: people[0].companyId, salespersonId: people[0].id, newSalesperson: null } : null;
  }
  const own = salespeople.filter((s) => s.companyId === companyId);
  const byFull = own.filter(full);
  const byLast = own.filter(lastName);
  const person = byFull.length === 1 ? byFull[0] : byFull.length === 0 && byLast.length === 1 ? byLast[0] : null;
  const neu = !person && !byFull.length && !byLast.length && from.name?.trim() ? displayName(from.name) : null;
  return { companyId, salespersonId: person?.id ?? null, newSalesperson: neu };
}
