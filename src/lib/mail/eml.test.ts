import { describe, expect, it } from "vitest";
import { anfrageTextOf, attachmentName, berlinDay, htmlToText, isEmlFile, MAX_MAIL_TEXT, matchSender, MailReadError, readEml, SIGNATURE_IMAGE_BYTES, sortAttachments } from "./eml";
import { buildEml, DEMO_ANFRAGE_TEXT, demoAnfrageEml } from "./fixtures";
import type { Company, Salesperson } from "../types";

const eml = (s: string, name = "mail.eml") => new File([s], name, { type: "message/rfc822" });

describe("readEml", () => {
  it("liest Absender, Datum, Betreff, Text und teilt die Anhänge auf", async () => {
    const mail = await readEml(demoAnfrageEml());
    expect(mail.fromName).toBe("Jonas Reiter");
    expect(mail.fromEmail).toBe("j.reiter@bien-zenker.example");
    expect(mail.subject).toBe("Neue Anfrage Hoffmann, Blaustein");
    expect(mail.date).toBe("2026-11-05T08:12:00.000Z");
    expect(mail.text).toBe(DEMO_ANFRAGE_TEXT);
    expect(mail.readable.map((f) => [f.name, f.type])).toEqual([["Vermesservertrag_Hoffmann_Beispiel.pdf", "application/pdf"]]);
    expect(mail.other.map((f) => f.name)).toEqual(["Bemusterung_Hoffmann.xlsx"]);
    expect(mail.skipped.map((s) => s.name)).toEqual(["Grundriss_Wunsch.dwg", "logo.png"]);
    expect(mail.skipped[0].reason).toMatch(/Fileserver/);
  });

  it("Anhänge behalten ihren Inhalt", async () => {
    const mail = await readEml(demoAnfrageEml());
    const pdf = new Uint8Array(await mail.readable[0].arrayBuffer());
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
  });

  it("nimmt den HTML-Teil, wenn kein Text da ist", async () => {
    const raw = ["From: a@b.example", "Subject: Test", "Content-Type: text/html; charset=utf-8", "", "<p>Hallo&nbsp;M&uuml;ller,</p><p>Termin<br>Dienstag</p>"].join("\r\n");
    const mail = await readEml(eml(raw));
    expect(mail.text).toBe("Hallo Müller,\nTermin\nDienstag");
    expect(mail.readable).toEqual([]);
  });

  it("liest weitergeleitete Mails mit ihren Anhängen", async () => {
    const inner = buildEml({ from: "Petra Lang <p.lang@firma.example>", subject: "Original", date: "Mon, 02 Nov 2026 08:00:00 +0100", text: "Innere Nachricht", parts: [{ name: "Plan.pdf", type: "application/pdf", content: new TextEncoder().encode("%PDF-1.4 x") }] });
    const raw = [
      "From: Jonas Reiter <j.reiter@firma.example>",
      "Subject: WG: Original",
      'Content-Type: multipart/mixed; boundary="x"',
      "",
      "--x",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Siehe unten.",
      "--x",
      "Content-Type: message/rfc822",
      "",
      inner,
      "--x--",
    ].join("\r\n");
    const mail = await readEml(eml(raw));
    expect(mail.fromEmail).toBe("j.reiter@firma.example");
    expect(mail.text).toContain("Siehe unten.");
    expect(mail.text).toContain("Innere Nachricht");
    expect(mail.readable.map((f) => f.name)).toEqual(["Plan.pdf"]);
  });

  it("meldet leere und kaputte Dateien verständlich", async () => {
    await expect(readEml(eml(""))).rejects.toBeInstanceOf(MailReadError);
    await expect(readEml(eml("kein Mailinhalt ohne Kopfzeilen"))).rejects.toThrow(/keine Mail|nicht als Mail/);
  });
});

describe("sortAttachments", () => {
  const att = (filename: string | null, mimeType: string, size: number, extra: object = {}) => ({ filename, mimeType, disposition: "attachment", content: new Uint8Array(size).fill(1).buffer, ...extra });

  it("auslesbar, nur ablegen, übersprungen", () => {
    const r = sortAttachments([
      att("Werkvertrag.pdf", "application/pdf", 100),
      att("Foto.jpeg", "application/octet-stream", 50_000),
      att("Liste.xlsx", "application/octet-stream", 100),
      att("setup.exe", "application/octet-stream", 100),
      att("Grundriss.pln", "application/octet-stream", 100),
      att(null, "image/png", 500),
      att("Logo.png", "image/png", 500, { disposition: "inline", contentId: "<a>" }),
      att("Foto vom Handy.jpg", "image/jpeg", SIGNATURE_IMAGE_BYTES + 1, { disposition: "inline", contentId: "<b>" }),
      att("leer.pdf", "application/pdf", 0),
    ] as never);
    expect(r.readable.map((f) => f.name)).toEqual(["Werkvertrag.pdf", "Foto.jpeg", "Foto vom Handy.jpg"]);
    expect(r.readable[1].type).toBe("image/jpeg");
    expect(r.other.map((f) => f.name)).toEqual(["Liste.xlsx"]);
    expect(r.skipped.map((s) => s.name)).toEqual(["setup.exe", "Grundriss.pln", "Anhang 6.png", "Logo.png", "leer.pdf"]);
  });

  it("dieselbe Datei nur einmal", () => {
    const r = sortAttachments([att("a.pdf", "application/pdf", 10), att("A.pdf", "application/pdf", 10)] as never);
    expect(r.readable).toHaveLength(1);
  });

  it("großes PDF (über 30 MB) wird nur abgelegt, nicht ausgelesen", () => {
    const r = sortAttachments([att("Scan.pdf", "application/pdf", 31 * 1024 * 1024)] as never);
    expect(r.readable).toEqual([]);
    expect(r.other.map((f) => f.name)).toEqual(["Scan.pdf"]);
  });
});

describe("attachmentName", () => {
  it("entfernt Pfade und Steuerzeichen, ohne Namen mit Endung aus dem Typ", () => {
    expect(attachmentName({ filename: "C:\\Temp\\..\\Plan.pdf", mimeType: "application/pdf" }, 0)).toBe("Plan.pdf");
    expect(attachmentName({ filename: "a\u0000b..pdf", mimeType: "application/pdf" }, 0)).toBe("ab.pdf");
    expect(attachmentName({ filename: null, mimeType: "application/pdf" }, 2)).toBe("Anhang 3.pdf");
    expect(attachmentName({ filename: "", mimeType: "x/y" }, 0)).toBe("Anhang 1.bin");
  });
});

describe("isEmlFile", () => {
  it("an Endung oder Typ", () => {
    expect(isEmlFile({ name: "Anfrage.EML", type: "" })).toBe(true);
    expect(isEmlFile({ name: "Anfrage", type: "message/rfc822" })).toBe(true);
    expect(isEmlFile({ name: "Anfrage.pdf", type: "application/pdf" })).toBe(false);
  });
});

describe("htmlToText", () => {
  it("ohne Skripte und Stile, mit Listen und Zahl-Entitäten", () => {
    expect(htmlToText("<style>p{}</style><ul><li>Eins</li><li>Zwei&#8364;</li></ul><script>x()</script>")).toBe("• Eins\n• Zwei€");
  });
});

describe("anfrageTextOf", () => {
  const base = { subject: "Anfrage", fromName: "Jonas Reiter", fromEmail: "j@x.example", date: "2026-11-05T23:30:00.000Z", text: "Hallo" };
  it("Kopf mit Absender, Datum (deutsche Zeit) und Betreff", () => {
    expect(anfrageTextOf(base)).toBe("Von: Jonas Reiter <j@x.example>\nDatum: 06.11.2026\nBetreff: Anfrage\n\nHallo");
  });
  it("ohne fehlende Angaben", () => {
    expect(anfrageTextOf({ ...base, fromName: null, date: null, subject: null })).toBe("Von: j@x.example\n\nHallo");
  });
  it("kürzt sehr lange Nachrichten", () => {
    const t = anfrageTextOf({ ...base, text: "x".repeat(MAX_MAIL_TEXT + 10) });
    expect(t).toContain("[gekürzt");
    expect(t.length).toBeLessThan(MAX_MAIL_TEXT + 200);
  });
  it("berlinDay", () => expect(berlinDay("2026-07-01T22:30:00Z")).toBe("2026-07-02"));
});

describe("matchSender", () => {
  const companies: Company[] = [
    { id: "c1", name: "Firma A", numberPrefix: null },
    { id: "c2", name: "Firma B", numberPrefix: null },
  ];
  const salespeople: Salesperson[] = [
    { id: "s1", companyId: "c1", name: "Reiter", email: "J.Reiter@firma-a.example" },
    { id: "s2", companyId: "c1", name: "Lang", email: "p.lang@firma-a.example" },
    { id: "s3", companyId: "c2", name: "Kunze", email: "r.kunze@gmail.example" },
    { id: "s4", companyId: "c1", name: "Privat", email: "x@gmail.example" },
  ];
  it("genaue Adresse: Firma und Verkäufer", () => expect(matchSender("j.reiter@firma-a.example", salespeople, companies)).toEqual({ companyId: "c1", salespersonId: "s1" }));
  it("nur Domain einer Firma: Firma ohne Verkäufer", () => expect(matchSender("neu@firma-a.example", salespeople, companies)).toEqual({ companyId: "c1", salespersonId: null }));
  it("Domain mehrerer Firmen: nichts", () => expect(matchSender("neu@gmail.example", salespeople, companies)).toBeNull());
  it("unbekannt oder leer: nichts", () => {
    expect(matchSender("a@b.example", salespeople, companies)).toBeNull();
    expect(matchSender(null, salespeople, companies)).toBeNull();
  });
});
