// Mehrere Dateien beim Anlegen eines Projekts: prüfen, speichern, einzeln auslesen. Ohne Oberfläche (getestet).
//   1. Prüfen (Typ, Größe bis 30 MB). Abgelehnte Dateien werden weder gespeichert noch ausgelesen.
//   2. Speichern, der Reihe nach (die erste Datei legt den Entwurf an, die weiteren hängen sich an).
//   3. Auslesen, je Datei ein Aufruf (jede Datei zählt einzeln gegen das Tageslimit), höchstens zwei gleichzeitig.
//   Scheitert die Auslesung (Limit, nicht lesbar, Dienst nicht erreichbar), bleibt die Datei gespeichert und trägt den Grund.

import { applyDraft } from "./applyDraft";
import { checkContractFile } from "./contractFile";
import { ExtractUnavailable, type ProjectDraft, type Vertragsart } from "./types";
import type { DraftFilePatch, NewProject } from "../repo";
import type { ContractMeta } from "../types";

export type JobPhase = "abgelehnt" | "wartet" | "speichert" | "liest" | "fertig" | "fehler";

/** Fortschritt in Prozent je Schritt (Speichern und Auslesen melden keine Bytes, nur den Schritt). */
export const PHASE_PROGRESS: Record<JobPhase, number> = { abgelehnt: 100, wartet: 0, speichert: 25, liest: 60, fertig: 100, fehler: 100 };

export interface JobState {
  key: string;
  name: string;
  size: number;
  type: string;
  phase: JobPhase;
  /** Grund bei "abgelehnt" und "fehler" */
  error: string | null;
  /** Fehlerart der Auslesung (z. B. "limit"), wenn bekannt */
  errorCode: string | null;
  /** Zeile im Entwurf, sobald gespeichert */
  fileId: string | null;
  art: Vertragsart;
  draft: ProjectDraft | null;
  meta: ContractMeta;
}

export interface ReadDeps {
  save(file: File): Promise<{ fileId: string }>;
  extract(file: File, opts: { draftFileId: string; art?: Vertragsart }): Promise<ProjectDraft>;
  /** Ergebnis bzw. Fehler an der Datei im Entwurf festhalten */
  record(fileId: string, patch: DraftFilePatch): Promise<unknown>;
  onUpdate?(state: JobState): void;
  /** Gleichzeitige Auslesungen (Standard 2) */
  concurrency?: number;
}

/** Metadaten des Dokuments aus seinem Entwurf (Vertragsdatum, Preis, Angebotsnummer, Haustyp). */
export function metaOf(draft: ProjectDraft): ContractMeta {
  return applyDraft(draft, {} as NewProject, { companies: [] }).meta;
}

export function initialJob(file: File, key: string): JobState {
  const check = checkContractFile(file);
  return {
    key,
    name: file.name,
    size: file.size,
    type: file.type,
    phase: check.ok ? "wartet" : "abgelehnt",
    error: check.ok ? null : check.reason,
    errorCode: null,
    fileId: null,
    art: "sonstiges",
    draft: null,
    meta: {},
  };
}

/**
 * Liest die Dateien. `jobs` stammen aus initialJob (gleiche Reihenfolge wie `files`); fertige Zustände kommen über
 * onUpdate und als Rückgabe. Abgelehnte Dateien bleiben unverändert.
 */
export async function readDocuments(files: File[], jobs: JobState[], deps: ReadDeps): Promise<JobState[]> {
  const states = jobs.map((j) => ({ ...j }));
  const update = (i: number, patch: Partial<JobState>) => {
    states[i] = { ...states[i], ...patch };
    deps.onUpdate?.(states[i]);
  };

  // 2. Speichern, der Reihe nach
  for (let i = 0; i < files.length; i++) {
    if (states[i].phase !== "wartet") continue;
    update(i, { phase: "speichert" });
    try {
      const { fileId } = await deps.save(files[i]);
      update(i, { fileId });
    } catch (e) {
      update(i, { phase: "fehler", error: `Nicht gespeichert: ${e instanceof Error ? e.message : "unbekannter Fehler"}` });
    }
  }

  // 3. Auslesen, je Datei ein Aufruf
  const queue = states.map((_, i) => i).filter((i) => states[i].phase === "speichert" && states[i].fileId);
  const worker = async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
      const fileId = states[i].fileId!;
      update(i, { phase: "liest" });
      try {
        const draft = await deps.extract(files[i], { draftFileId: fileId });
        const art = (draft.felder.vertragsart.wert as Vertragsart | null) ?? "sonstiges";
        const meta = metaOf(draft);
        update(i, { phase: "fertig", draft, art, meta });
        await deps.record(fileId, { status: "ausgelesen", error: null, draft, docType: art, meta }).catch(() => undefined);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Die Datei ließ sich nicht auslesen.";
        update(i, { phase: "fehler", error: message, errorCode: e instanceof ExtractUnavailable ? e.code : null });
        await deps.record(fileId, { status: "fehler", error: message }).catch(() => undefined);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? 2) }, worker));
  return states;
}
