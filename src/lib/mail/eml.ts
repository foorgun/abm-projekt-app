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

/**
 * Hausbaufirma und Verkäufer aus dem Absender: genaue Adresse eines Verkäufers, sonst die Firma, wenn alle Verkäufer
 * mit derselben Mail-Domain zu genau einer Firma gehören.
 */
export function matchSender(email: string | null, salespeople: Salesperson[], companies: Company[]): { companyId: string; salespersonId: string | null } | null {
  if (!email) return null;
  const addr = email.toLowerCase();
  const exact = salespeople.find((s) => s.email?.toLowerCase() === addr);
  if (exact && companies.some((c) => c.id === exact.companyId)) return { companyId: exact.companyId, salespersonId: exact.id };
  const domain = addr.split("@")[1];
  if (!domain) return null;
  const ids = new Set(salespeople.filter((s) => s.email?.toLowerCase().split("@")[1] === domain).map((s) => s.companyId));
  if (ids.size !== 1) return null;
  const [companyId] = ids;
  return companies.some((c) => c.id === companyId) ? { companyId, salespersonId: null } : null;
}
