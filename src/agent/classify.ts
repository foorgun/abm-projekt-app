// Zuordnung einer Mail zu Projekt und Ordner. Reine Funktion: gleiche Eingabe → gleiche Entscheidung.
// Wird im Browser-Demo und (Schritt 9) in der Edge Function "inbox-ingest" genutzt. BUILD.md Abschnitt 7.
//
// Sicherheit: Mailinhalte sind nicht vertrauenswürdig (Prompt-Injection). Das Modell bekommt nur Text,
// hat keine Werkzeuge, und seine Antwort wird strikt gegen erlaubte Projekt-IDs und Ordnerpfade geprüft.
// Ein KI-Vorschlag allein legt nie automatisch ab (Sicherheit gedeckelt unter der Auto-Ablage-Schwelle).

import { checkFile, extension } from "../lib/files";
import { compactText } from "../lib/projectFilters";
import { concretePath } from "../lib/folders";
import type { AgentRule, Project } from "../lib/types";
import type { AiAdvisor, AiRequest, AiSuggestion, AttachmentDecision, ClassifyContext, MailAttachment, MailDecision, MailMessage } from "./types";

/**
 * Sicherheitswerte je Erkennungsweg (0–1). Annahmen für den Prototyp, mit ABM abzustimmen
 * und nach dem Testlauf mit echten Mails (Schritt 9) zu justieren.
 */
export const CONFIDENCE = {
  abmNr: 0.98,
  hausbauNr: 0.97,
  ruleProject: 0.95,
  knownSender: 0.9,
  nameAndPlace: 0.85,
  /** Obergrenze für KI-Vorschläge: immer unter der Standard-Auto-Ablage (0,9) */
  aiMax: 0.8,
  ruleFolder: 0.95,
  keywordStrong: 0.93,
  keywordBody: 0.8,
  keywordTie: 0.6,
  senderFolder: 0.7,
} as const;

/** Signaturbilder: kleine eingebettete Bilder */
export const SIGNATURE_IMAGE_MAX_BYTES = 15 * 1024;
const ARCHIVE_EXT = ["zip", "rar", "7z"];
const MAX_CANDIDATES = 20;
const EXCERPT_CHARS = 500;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "8161-101" → findet auch "8161 101", "8161_101", "8161101", "8161-0101". */
export function abmPattern(abmNr: string): RegExp | null {
  const m = abmNr.match(/^(\d{3,5})[-\s]?(\d{1,6})$/);
  if (!m) return null;
  return new RegExp(`(?<!\\d)${m[1]}[\\s\\-_./]{0,2}0*${Number(m[2])}(?!\\d)`);
}

/** "HB-26118" → findet auch "HB 26118", "hb26118". */
export function hausbauPattern(nr: string): RegExp | null {
  const m = nr.match(/^([A-Za-z]{1,4})[-\s]?(\d{3,8})$/);
  if (!m) return null;
  return new RegExp(`(?<![A-Za-z])${escape(m[1])}[\\s\\-_]{0,2}${m[2]}(?!\\d)`, "i");
}

function wordPattern(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}])${escape(word)}(?![\\p{L}])`, "iu");
}

function senderMatches(rule: AgentRule, email: string): boolean {
  const e = email.trim().toLowerCase();
  const m = rule.match.trim().toLowerCase();
  return m.startsWith("@") ? e.endsWith(m) : e === m;
}

function streetOf(address: string | null | undefined): string | null {
  const m = address?.match(/^([^\d,]+?)\s*\d/);
  return m ? m[1].trim() : null;
}

function isNewsletter(mail: MailMessage): boolean {
  if (mail.listUnsubscribe) return true;
  const text = `${mail.subject} ${mail.body}`.toLowerCase();
  return /newsletter|abmelden|unsubscribe|abbestellen/.test(text) && /^(news|newsletter|no-?reply|marketing|info)@/i.test(mail.fromEmail);
}

function statusOfMail(atts: AttachmentDecision[]): MailDecision["status"] {
  if (atts.some((a) => a.status === "pruefen")) return "pruefen";
  if (atts.some((a) => a.status === "fehler")) return "fehler";
  if (atts.some((a) => a.status === "abgelegt")) return "abgelegt";
  return "ignoriert";
}

// ---------------------------------------------------------------------------
// Projekt bestimmen
// ---------------------------------------------------------------------------

interface ProjectGuess {
  projectId: string | null;
  confidence: number;
  reason: string;
  /** Mehrere gleich gute Treffer */
  ambiguous?: string[];
}

function findProject(mail: MailMessage, ctx: ClassifyContext, fileNames: string[]): ProjectGuess {
  const active = ctx.projects.filter((p) => p.status === "aktiv");
  const head = `${mail.subject}\n${fileNames.join("\n")}`;
  const all = `${head}\n${mail.body}`;

  // 1) ABM-Nr. oder Hausbau-Nr. (Betreff, Dateiname, Text)
  const byNumber = new Map<string, string>();
  for (const p of active) {
    const abm = p.abmNr ? abmPattern(p.abmNr) : null;
    if (abm?.test(all)) {
      byNumber.set(p.id, `ABM-Nr. ${p.abmNr} ${abm.test(mail.subject) ? "im Betreff" : abm.test(fileNames.join(" ")) ? "im Dateinamen" : "im Text"}`);
      continue;
    }
    const hb = p.hausbauNr ? hausbauPattern(p.hausbauNr) : null;
    if (hb?.test(all)) byNumber.set(p.id, `Hausbau-Nr. ${p.hausbauNr} ${hb.test(mail.subject) ? "im Betreff" : "in der Mail"}`);
  }
  if (byNumber.size === 1) {
    const [id, reason] = [...byNumber.entries()][0];
    return { projectId: id, confidence: reason.startsWith("ABM") ? CONFIDENCE.abmNr : CONFIDENCE.hausbauNr, reason };
  }
  if (byNumber.size > 1) return { projectId: null, confidence: 0, reason: `Mehrere Projektnummern in der Mail (${[...byNumber.values()].join("; ")})`, ambiguous: [...byNumber.keys()] };

  // 2) Regel "Absender → Projekt"
  const rule = ctx.rules.find((r) => r.kind === "absender_projekt" && r.projectId && senderMatches(r, mail.fromEmail));
  if (rule && active.some((p) => p.id === rule.projectId)) {
    return { projectId: rule.projectId, confidence: CONFIDENCE.ruleProject, reason: `Regel: Absender ${rule.match} → Projekt` };
  }

  // 3) Bekannter Absender mit genau einem aktiven Projekt (Verkäufer der Hausbaufirma, Bauherr)
  const email = mail.fromEmail.toLowerCase();
  const sales = ctx.salespeople.find((s) => s.email?.toLowerCase() === email);
  const senderProjects = new Set<string>();
  if (sales) for (const p of active) if (p.salespersonId === sales.id) senderProjects.add(p.id);
  for (const b of ctx.bauherren) if (b.email?.toLowerCase() === email && active.some((p) => p.id === b.projectId)) senderProjects.add(b.projectId);
  if (senderProjects.size === 1) {
    const id = [...senderProjects][0];
    return { projectId: id, confidence: CONFIDENCE.knownSender, reason: `Bekannter Absender (${sales ? `Verkäufer ${sales.name}` : "Bauherr"}) mit genau einem aktiven Projekt` };
  }

  // 4) Bauherr-Nachname UND Ort oder Straße im Text
  const namePlace: Project[] = [];
  const nameOnly: Project[] = [];
  for (const p of active) {
    if (!wordPattern(p.bauherrLabel).test(all)) continue;
    const street = streetOf(ctx.bauherren.find((b) => b.projectId === p.id)?.buildingAddress);
    const place = (p.location && wordPattern(p.location).test(all)) || (street && compactText(all).includes(compactText(street)));
    (place ? namePlace : nameOnly).push(p);
  }
  if (namePlace.length === 1) {
    const p = namePlace[0];
    return { projectId: p.id, confidence: CONFIDENCE.nameAndPlace, reason: `Bauherr-Nachname "${p.bauherrLabel}" und Ort/Straße im Text` };
  }
  if (namePlace.length > 1 || nameOnly.length > 1) {
    const list = namePlace.length > 1 ? namePlace : nameOnly;
    return { projectId: null, confidence: 0, reason: `Mehrere Projekte passen ("${list[0].bauherrLabel}": ${list.map((p) => p.location).join(", ")})`, ambiguous: list.map((p) => p.id) };
  }
  if (senderProjects.size > 1) {
    return { projectId: null, confidence: 0, reason: `Absender hat ${senderProjects.size} aktive Projekte`, ambiguous: [...senderProjects] };
  }
  return { projectId: null, confidence: 0, reason: "Keine Projektnummer, kein bekannter Absender, kein Bauherr mit Ort im Text" };
}

// ---------------------------------------------------------------------------
// Ordner bestimmen
// ---------------------------------------------------------------------------

interface FolderGuess {
  template: string | null;
  confidence: number;
  reason: string;
}

function findFolder(mail: MailMessage, att: MailAttachment, ctx: ClassifyContext): FolderGuess {
  // 1) Regel "Absender → Ordner"
  const rule = ctx.rules.find((r) => r.kind === "absender_ordner" && r.folderPath && senderMatches(r, mail.fromEmail));
  if (rule && ctx.folderTemplates.some((t) => t.path === rule.folderPath)) {
    return { template: rule.folderPath, confidence: CONFIDENCE.ruleFolder, reason: `Regel: Absender ${rule.match} → Ordner` };
  }

  // 2) Schlüsselwörter der Vorlage (Betreff/Dateiname zählen doppelt)
  const strong = `${mail.subject} ${att.fileName.replace(/[_\-.]+/g, " ")}`.toLowerCase();
  const weak = mail.body.toLowerCase();
  let best: { path: string; score: number; strongHit: boolean; word: string }[] = [];
  for (const t of ctx.folderTemplates) {
    let score = 0;
    let strongHit = false;
    let word = "";
    for (const k of t.keywords) {
      // Schlüsselwörter auch ohne Umlaute erkennen (Dateinamen: "Wohnflaechenberechnung")
      const variants = [k, k.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")];
      if (variants.some((v) => strong.includes(v))) {
        score += 2 + k.length / 100; // längere, spezifischere Wörter gewinnen bei Gleichstand
        strongHit = true;
        word ||= k;
      } else if (variants.some((v) => weak.includes(v))) {
        score += 1 + k.length / 100;
        word ||= k;
      }
    }
    if (!score) continue;
    if (!best.length || score > best[0].score + 0.001) best = [{ path: t.path, score, strongHit, word }];
    else if (Math.abs(score - best[0].score) <= 0.001) best.push({ path: t.path, score, strongHit, word });
  }
  if (best.length === 1) {
    const b = best[0];
    return { template: b.path, confidence: b.strongHit ? CONFIDENCE.keywordStrong : CONFIDENCE.keywordBody, reason: `Schlüsselwort "${b.word}" ${b.strongHit ? "im Betreff/Dateinamen" : "im Text"}` };
  }
  if (best.length > 1) return { template: best[0].path, confidence: CONFIDENCE.keywordTie, reason: `Mehrere Ordner passen (${best.map((b) => b.word).join(", ")})` };

  // 3) Absenderart (schwach)
  const email = mail.fromEmail.toLowerCase();
  const byPrefix = (prefix: string) => ctx.folderTemplates.find((t) => t.path.startsWith(prefix))?.path ?? null;
  if (/(landratsamt|lra|baurecht|bauamt|stadt|gemeinde)/.test(email)) {
    return { template: byPrefix("02 Schriftverkehr/03 Schriftverkehr mit Amt/01"), confidence: CONFIDENCE.senderFolder, reason: "Absender ist eine Behörde (Schriftverkehr mit Amt)" };
  }
  if (/vermess/.test(email)) {
    return { template: byPrefix("02 Schriftverkehr/04 Schriftverkehr mit Vermesser/01"), confidence: CONFIDENCE.senderFolder, reason: "Absender ist Vermesser (Schriftverkehr mit Vermesser)" };
  }
  if (ctx.salespeople.some((s) => s.email?.toLowerCase() === email)) {
    return { template: byPrefix("02 Schriftverkehr/02 Schriftverkehr mit Hausbaufirma/01"), confidence: CONFIDENCE.senderFolder, reason: "Absender ist Verkäufer der Hausbaufirma" };
  }
  if (ctx.bauherren.some((b) => b.email?.toLowerCase() === email)) {
    return { template: byPrefix("02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft/01"), confidence: CONFIDENCE.senderFolder, reason: "Absender ist Bauherr" };
  }
  return { template: null, confidence: 0, reason: "Kein Ordner erkennbar" };
}

// ---------------------------------------------------------------------------
// KI: Anfrage bauen und Antwort prüfen
// ---------------------------------------------------------------------------

/** Kleine, vorselektierte Kandidatenliste (nie alle Projekte frei raten lassen). */
export function buildAiRequest(mail: MailMessage, ctx: ClassifyContext, preselect: string[] = []): AiRequest {
  const active = ctx.projects.filter((p) => p.status === "aktiv");
  const company = new Map(ctx.companies.map((c) => [c.id, c.name]));
  const domain = mail.fromEmail.split("@")[1]?.toLowerCase() ?? "";
  const salesDomainCompany = ctx.salespeople.find((s) => s.email?.toLowerCase().endsWith(`@${domain}`))?.companyId;
  const score = (p: Project) =>
    (preselect.includes(p.id) ? 100 : 0) +
    (salesDomainCompany && p.companyId === salesDomainCompany ? 10 : 0) +
    (p.location && wordPattern(p.location).test(`${mail.subject} ${mail.body}`) ? 5 : 0);
  const candidates = [...active]
    .sort((a, b) => score(b) - score(a) || (b.intakeMonth ?? "").localeCompare(a.intakeMonth ?? ""))
    .slice(0, MAX_CANDIDATES)
    .map((p) => ({ id: p.id, abmNr: p.abmNr, bauherr: p.bauherrLabel, ort: p.location, firma: p.companyId ? company.get(p.companyId) ?? null : null }));
  return {
    subject: mail.subject.slice(0, 200),
    from: mail.fromEmail,
    fileNames: mail.attachments.map((a) => a.fileName),
    excerpt: mail.body.slice(0, EXCERPT_CHARS),
    candidates,
    allowedFolders: ctx.folderTemplates.map((t) => t.path),
  };
}

export interface ValidatedAi {
  projectId: string | null;
  folderTemplate: string | null;
  confidence: number;
  notes: string[];
}

/** Prüft die Modellantwort strikt: nur Kandidaten-IDs, nur Vorlagenpfade, Sicherheit gedeckelt. */
export function validateAi(s: AiSuggestion | null, req: AiRequest): ValidatedAi {
  const notes: string[] = [];
  if (!s) return { projectId: null, folderTemplate: null, confidence: 0, notes };
  const conf = typeof s.confidence === "number" && Number.isFinite(s.confidence) ? Math.min(Math.max(s.confidence, 0), CONFIDENCE.aiMax) : 0.5;
  let projectId: string | null = null;
  if (s.projectId != null) {
    if (req.candidates.some((c) => c.id === s.projectId)) projectId = s.projectId;
    else notes.push("KI-Projekt verworfen (nicht in der Kandidatenliste)");
  }
  let folderTemplate: string | null = null;
  if (s.folderPath != null) {
    if (req.allowedFolders.includes(s.folderPath)) folderTemplate = s.folderPath;
    else notes.push("KI-Ordner verworfen (nicht in der Vorlage)");
  }
  return { projectId, folderTemplate, confidence: conf, notes };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export function classify(mail: MailMessage, ctx: ClassifyContext, ai?: AiAdvisor): MailDecision {
  const base = { messageId: mail.messageId };

  // Dublette
  if (ctx.knownMessageIds.has(mail.messageId)) {
    return { ...base, skipped: "duplikat", status: "ignoriert", projectId: null, confidence: null, reason: "Bereits verarbeitet (gleiche message_id)", attachments: [] };
  }

  const ignore = (reason: string): MailDecision => ({
    ...base,
    status: "ignoriert",
    projectId: null,
    confidence: null,
    reason,
    attachments: mail.attachments.map((a) => ({ fileName: a.fileName, mime: a.mime, sizeBytes: a.sizeBytes, status: "ignoriert", projectId: null, folderTemplate: null, folderPath: null, confidence: null, reason })),
  });

  // Filter: Ignorier-Liste, Newsletter, keine Anhänge
  const ignored = ctx.rules.find((r) => r.kind === "ignorieren" && senderMatches(r, mail.fromEmail));
  if (ignored) return ignore(`Absender auf Ignorier-Liste (${ignored.match})`);
  if (isNewsletter(mail)) return ignore("Newsletter");
  if (!mail.attachments.length) return ignore("Kein Anhang");

  // Anhänge vorsortieren: Signaturbilder ignorieren, gefährliche Dateien nie ablegen
  const decided: AttachmentDecision[] = [];
  const relevant: MailAttachment[] = [];
  for (const a of mail.attachments) {
    const ext = extension(a.fileName);
    const pre = { fileName: a.fileName, mime: a.mime, sizeBytes: a.sizeBytes, projectId: null, folderTemplate: null, folderPath: null, confidence: null };
    if (a.mime.startsWith("image/") && a.sizeBytes < SIGNATURE_IMAGE_MAX_BYTES) {
      decided.push({ ...pre, status: "ignoriert", reason: "Signaturbild (klein, eingebettet)" });
      continue;
    }
    if (ARCHIVE_EXT.includes(ext) && a.encrypted) {
      decided.push({ ...pre, status: "fehler", reason: "Archiv mit Passwort: wird nicht abgelegt, bitte von Hand prüfen" });
      continue;
    }
    const check = checkFile(a.fileName, a.sizeBytes);
    if (!check.ok) {
      decided.push({ ...pre, status: check.kind === "cad" ? "ignoriert" : "fehler", reason: check.reason });
      continue;
    }
    relevant.push(a);
  }
  if (!relevant.length) {
    const status = decided.some((d) => d.status === "fehler") ? "fehler" : "ignoriert";
    return { ...base, status, projectId: null, confidence: null, reason: decided.map((d) => `${d.fileName}: ${d.reason}`).join(" · "), attachments: decided };
  }

  // Projekt bestimmen (deterministisch zuerst)
  let project = findProject(mail, ctx, relevant.map((a) => a.fileName));
  const notes: string[] = [];

  // KI nur, wenn deterministisch nichts eindeutig ist, und nur aus einer kleinen Kandidatenliste
  let aiResult: ValidatedAi | null = null;
  if (ai && !project.projectId) {
    const req = buildAiRequest(mail, ctx, project.ambiguous ?? []);
    aiResult = validateAi(ai(req), req);
    notes.push(...aiResult.notes);
    if (aiResult.projectId && !project.ambiguous) {
      project = { projectId: aiResult.projectId, confidence: aiResult.confidence, reason: "KI-Vorschlag aus der Kandidatenliste" };
    } else if (aiResult.projectId && project.ambiguous?.includes(aiResult.projectId)) {
      // Bei Mehrdeutigkeit bleibt es ein Vorschlag unterhalb der Vorschlagsschwelle (Mensch entscheidet)
      project = { ...project, projectId: aiResult.projectId, confidence: Math.min(aiResult.confidence, ctx.settings.suggestThreshold - 0.01), reason: `${project.reason}; KI tippt auf eines davon` };
    }
  }

  const attachments: AttachmentDecision[] = [...decided];
  for (const a of relevant) {
    let folder = findFolder(mail, a, ctx);
    // KI-Ordner nur nutzen, wenn Regel/Schlüsselwort nichts Sicheres liefern; Regel überstimmt KI immer
    if (aiResult?.folderTemplate && folder.confidence < CONFIDENCE.keywordBody) {
      folder = { template: aiResult.folderTemplate, confidence: aiResult.confidence, reason: "KI-Vorschlag aus der Ordnervorlage" };
    } else if (!aiResult && ai && folder.confidence < CONFIDENCE.keywordBody && project.projectId) {
      const req = buildAiRequest(mail, ctx, [project.projectId]);
      const v = validateAi(ai(req), req);
      notes.push(...v.notes);
      if (v.folderTemplate) folder = { template: v.folderTemplate, confidence: v.confidence, reason: "KI-Vorschlag aus der Ordnervorlage" };
    }

    const confidence = project.projectId && folder.template ? Math.min(project.confidence, folder.confidence) : 0;
    const folderPath = folder.template ? concretePath(folder.template, mail.receivedAt) : null;
    const reason = [project.reason, folder.reason, ...notes].filter(Boolean).join(" · ");
    const s = ctx.settings;
    let status: AttachmentDecision["status"];
    let withSuggestion = true;
    if (project.projectId && !project.ambiguous && folder.template && confidence >= s.autoFileThreshold) status = "abgelegt";
    else {
      status = "pruefen";
      withSuggestion = confidence >= s.suggestThreshold && !project.ambiguous;
    }
    attachments.push({
      fileName: a.fileName,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      status,
      projectId: withSuggestion ? project.projectId : null,
      folderTemplate: withSuggestion ? folder.template : null,
      folderPath: withSuggestion ? folderPath : null,
      confidence: Math.round(confidence * 100) / 100,
      reason: withSuggestion ? reason : `${reason} · Kein sicherer Vorschlag`,
    });
  }

  const filed = attachments.filter((a) => a.status !== "ignoriert" && a.status !== "fehler");
  const conf = filed.length ? Math.min(...filed.map((a) => a.confidence ?? 0)) : null;
  return {
    ...base,
    status: statusOfMail(attachments),
    projectId: filed.find((a) => a.projectId)?.projectId ?? null,
    confidence: conf,
    reason: filed[0]?.reason ?? attachments[0]?.reason ?? "",
    attachments,
  };
}
