// Wohin ein Vertrag im Projekt abgelegt wird. Der Dokumenttyp bestimmt den Zielordner.

import type { DocumentType, FolderTemplate } from "../types";

/**
 * Zielordner je Typ (Pfad aus der Ordnervorlage).
 * "00 Verträge" ist vorläufig: die richtige Stelle klärt ABM noch (docs/offene-fragen.md).
 */
export const CONTRACT_FOLDER: Record<DocumentType, string> = {
  werkvertrag: "00 Verträge",
  vermessungsvertrag: "04 Vermesser",
  sonstiges: "00 Verträge",
};

/** Zielordner, wenn er in der Vorlage existiert; sonst ein klarer Fehler (Migration 0010 fehlt). */
export function contractFolder(docType: DocumentType, templates: FolderTemplate[]): string {
  const path = CONTRACT_FOLDER[docType];
  if (!templates.some((t) => t.path === path)) throw new Error(`Der Ordner „${path}“ fehlt in der Ordnervorlage.`);
  return path;
}
