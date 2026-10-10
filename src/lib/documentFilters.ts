// Filter und Kennzahlen der Seite "Dokumente". Reine Funktionen; das Repo (demoRepo, später supabaseRepo) nutzt dieselben Regeln.

import { fileKind } from "./files";
import { addDays } from "./format";
import { compactText } from "./projectFilters";
import type { ProjectDocument } from "./types";

export type DocKind = "pdf" | "office" | "bild" | "mail";
export type DocPeriod = "alle" | "heute" | "7" | "30" | "90";

export interface DocumentFilter {
  /** Freitext: Dateiname, Projekt (ABM-Nr., Bauherr, Ort), Absender, Mailbetreff */
  q?: string;
  projectId?: string;
  /** Hauptordner als Nummer "01" … "11" */
  mainFolder?: string;
  source?: "agent" | "upload";
  kind?: DocKind;
  period?: DocPeriod;
  limit?: number;
  offset?: number;
}

/** Zeile der Dokumentenliste: Dokument plus Angaben, die für Suche und Anzeige nötig sind. */
export interface DocumentRow {
  doc: ProjectDocument;
  project: { id: string; abmNr: string | null; bauherrLabel: string; location: string | null } | null;
  /** Nur bei Herkunft Agent: die Mail, aus der die Datei stammt */
  mail: { subject: string; fromName: string; fromEmail: string; receivedAt: string; reason: string | null; confidence: number | null } | null;
}

export interface DocumentListResult {
  rows: DocumentRow[];
  /** Treffer insgesamt (vor limit/offset) */
  total: number;
}

export const PERIOD_LABEL: Record<DocPeriod, string> = { alle: "Jederzeit", heute: "Heute", "7": "Letzte 7 Tage", "30": "Letzte 30 Tage", "90": "Letzte 90 Tage" };
export const KIND_LABEL: Record<DocKind, string> = { pdf: "PDF", office: "Office", bild: "Bild", mail: "Mail" };

/** "08 Bauantrag/03 …" → "08" */
export function mainFolderOf(folderPath: string): string {
  return folderPath.slice(0, 2);
}

export function matchesDocumentFilter(row: DocumentRow, f: DocumentFilter, today: string): boolean {
  const d = row.doc;
  if (f.projectId && d.projectId !== f.projectId) return false;
  if (f.mainFolder && mainFolderOf(d.folderPath) !== f.mainFolder) return false;
  if (f.source && d.source !== f.source) return false;
  if (f.kind && fileKind(d.name, d.mime) !== f.kind) return false;
  if (f.period && f.period !== "alle") {
    const from = f.period === "heute" ? today : addDays(today, -(Number(f.period) - 1));
    if (!d.receivedOn || d.receivedOn < from || d.receivedOn > today) return false;
  }
  const words = (f.q ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = compactText(
      [d.name, row.project?.abmNr, row.project?.bauherrLabel, row.project?.location, row.mail?.fromName, row.mail?.fromEmail, row.mail?.subject, d.uploadedBy].filter(Boolean).join("|"),
    );
    if (!words.every((w) => hay.includes(compactText(w)))) return false;
  }
  return true;
}

export function filterDocuments(rows: DocumentRow[], f: DocumentFilter, today: string): DocumentListResult {
  const hits = rows.filter((r) => matchesDocumentFilter(r, f, today)).sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt));
  const offset = f.offset ?? 0;
  return { rows: hits.slice(offset, f.limit ? offset + f.limit : undefined), total: hits.length };
}

/** Montag der laufenden Woche (ISO). */
export function startOfWeek(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sonntag
  return addDays(today, dow === 0 ? -6 : 1 - dow);
}

export function documentStats(docs: ProjectDocument[], today: string) {
  const from = startOfWeek(today);
  const week = docs.filter((d) => d.receivedOn && d.receivedOn >= from && d.receivedOn <= today);
  return { total: docs.length, week: week.length, weekAgent: week.filter((d) => d.source === "agent").length };
}
