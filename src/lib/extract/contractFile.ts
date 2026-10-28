// Welche Dateien als Vertrag angenommen werden: PDF, DOCX oder Bild, höchstens 30 MB je Datei.

import { extension } from "../files";

/** 30 MB je Datei. Dieselbe Grenze prüft die Datenbank (project_draft_files, Migration 0019). */
export const MAX_CONTRACT_BYTES = 30 * 1024 * 1024;

const TYPES: Record<string, { kind: "pdf" | "docx" | "bild"; mime: string[] }> = {
  pdf: { kind: "pdf", mime: ["application/pdf"] },
  docx: { kind: "docx", mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  jpg: { kind: "bild", mime: ["image/jpeg"] },
  jpeg: { kind: "bild", mime: ["image/jpeg"] },
  png: { kind: "bild", mime: ["image/png"] },
};

/** Für das Attribut `accept` der Dateiauswahl. */
export const CONTRACT_ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png";

export type ContractCheck = { ok: true; kind: "pdf" | "docx" | "bild" } | { ok: false; reason: string };

/**
 * Prüft Name, Endung, gemeldeten Typ und Größe. Endung und Typ müssen zusammenpassen
 * (ein leerer Typ ist erlaubt: manche Systeme melden für DOCX keinen).
 */
export function checkContractFile(file: { name: string; size: number; type: string }): ContractCheck {
  if (!file.name.trim() || /[\\/]/.test(file.name) || file.name.includes("..")) return { ok: false, reason: "Ungültiger Dateiname." };
  const t = TYPES[extension(file.name)];
  if (!t) return { ok: false, reason: "Nur PDF, DOCX oder Bild (JPG, PNG)." };
  if (file.type && !t.mime.includes(file.type)) return { ok: false, reason: "Dateityp und Endung passen nicht zusammen." };
  if (file.size <= 0) return { ok: false, reason: "Die Datei ist leer." };
  if (file.size > MAX_CONTRACT_BYTES) return { ok: false, reason: `Die Datei ist größer als 30 MB (${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB).` };
  return { ok: true, kind: t.kind };
}
