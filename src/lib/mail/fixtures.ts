// Erfundene Anfrage-Mail zum Ausprobieren (Demo-Modus) und für Tests. Keine echten Daten.

import { textPdf, VERMESSERVERTRAG_ZEILEN } from "../extract/fixtures";

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/.{76}/g, "$&\r\n");
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** "=?UTF-8?B?...?=" für Kopfzeilen mit Umlauten */
const word = (s: string) => `=?UTF-8?B?${base64(utf8(s)).replace(/\r\n/g, "")}?=`;

export interface MailPart {
  name: string;
  type: string;
  content: Uint8Array;
  /** Inline-Bild aus der Signatur (mit Content-ID) */
  inline?: boolean;
}

/** Baut eine .eml (multipart/mixed, Text als quoted-printable-freies UTF-8 in Base64, Anhänge in Base64). */
export function buildEml(opts: { from: string; subject: string; date: string; text: string; html?: string; parts?: MailPart[] }): string {
  const b = "----=_abm_demo_boundary";
  const alt = "----=_abm_demo_alt";
  const lines = [
    `From: ${opts.from}`,
    "To: Planung <planung@abm-demo.example>",
    `Subject: ${word(opts.subject)}`,
    `Date: ${opts.date}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${b}"`,
    "",
    `--${b}`,
  ];
  if (opts.html) {
    lines.push(`Content-Type: multipart/alternative; boundary="${alt}"`, "", `--${alt}`);
    lines.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", base64(utf8(opts.text)), `--${alt}`);
    lines.push("Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", base64(utf8(opts.html)), `--${alt}--`);
  } else {
    lines.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", base64(utf8(opts.text)));
  }
  for (const p of opts.parts ?? []) {
    lines.push(`--${b}`, `Content-Type: ${p.type}; name="${word(p.name)}"`, "Content-Transfer-Encoding: base64");
    if (p.inline) lines.push(`Content-Disposition: inline; filename="${p.name}"`, `Content-ID: <${p.name}@demo>`);
    else lines.push(`Content-Disposition: attachment; filename="${word(p.name)}"`);
    lines.push("", base64(p.content));
  }
  lines.push(`--${b}--`, "");
  return lines.join("\r\n");
}

export const DEMO_ANFRAGE_TEXT = [
  "Hallo zusammen,",
  "",
  "anbei eine neue Anfrage für die Familie Hoffmann (Am Hölzle 12, 89134 Blaustein).",
  "Den Vermessungsvertrag und die Bemusterungsliste hänge ich an.",
  "",
  "Terminvorschläge für das Erstgespräch: Di 17.11. um 10 Uhr oder Do 19.11. um 14 Uhr.",
  "",
  "Viele Grüße",
  "Jonas Reiter",
  "ERFUNDENES BEISPIEL - keine echten Daten",
].join("\n");

/** Anfrage-Mail eines Demo-Verkäufers mit Vermesservertrag (PDF), Bemusterungsliste (XLSX), CAD-Datei und Logo. */
export function demoAnfrageEml(): File {
  const eml = buildEml({
    from: "Jonas Reiter <j.reiter@bien-zenker.example>",
    subject: "Neue Anfrage Hoffmann, Blaustein",
    date: "Thu, 05 Nov 2026 09:12:00 +0100",
    text: DEMO_ANFRAGE_TEXT,
    parts: [
      { name: "Vermesservertrag_Hoffmann_Beispiel.pdf", type: "application/pdf", content: textPdf(VERMESSERVERTRAG_ZEILEN) },
      { name: "Bemusterung_Hoffmann.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: utf8("erfundene Bemusterungsliste (Beispiel)") },
      { name: "Grundriss_Wunsch.dwg", type: "application/octet-stream", content: utf8("erfundene CAD-Datei") },
      { name: "logo.png", type: "image/png", content: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), inline: true },
    ],
  });
  return new File([eml], "Neue Anfrage Hoffmann, Blaustein.eml", { type: "message/rfc822" });
}
