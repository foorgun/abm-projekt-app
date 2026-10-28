import { FileText, RotateCcw, X } from "lucide-react";
import { PHASE_PROGRESS, type JobState } from "../lib/extract/batch";
import { FOERDER_FRIST_MONATE, foerderFrist, VERTRAGSART_LABEL, VERTRAGSARTEN, type Vertragsart } from "../lib/extract/types";
import { formatBytes, formatDate } from "../lib/format";
import type { ContractMeta } from "../lib/types";
import { AiSpinner, Button, Field, IconButton, Input, Pill, Select } from "./ui";

/** Ein Dokument im Dialog "Neues Projekt": Zustand der Auslesung plus Inhalt für Vorschau und Ablage. */
export interface DocEntry extends JobState {
  blob: Blob | null;
  /** Entwurf aus der Zeit vor mehreren Dateien (eine Datei direkt am Entwurf) */
  legacy?: boolean;
  /** Art selbst gewählt (sonst Vorschlag der Auslesung) */
  artTouched?: boolean;
}

const ART_OPTIONS = VERTRAGSARTEN.map((k) => ({ value: k, label: VERTRAGSART_LABEL[k] }));

/** Kurzer Stand einer Datei für Liste und Bildschirmleser. */
export function statusText(d: DocEntry): string {
  switch (d.phase) {
    case "abgelehnt":
      return `Abgelehnt: ${d.error}`;
    case "wartet":
      return "Wartet …";
    case "speichert":
      return "Wird gespeichert …";
    case "liest":
      return "KI liest das Dokument …";
    case "fertig":
      return "Ausgelesen";
    case "fehler":
      return `Nicht ausgelesen: ${d.error ?? "unbekannter Grund"}${d.fileId || d.legacy ? " Die Datei ist gespeichert und wird mit dem Projekt abgelegt." : ""}`;
  }
}

/** Welche Seiten gelesen wurden, z. B. "Seiten 1–2 von 9 gelesen". Nie still gekürzt: nicht gelesene Seiten werden genannt. */
export function pagesText(d: DocEntry): string | null {
  const s = d.draft?.seiten;
  if (!s?.gelesen.length) return null;
  const read = [...s.gelesen].sort((a, b) => a - b);
  const range = read.length > 1 && read[read.length - 1] - read[0] === read.length - 1 ? `${read[0]}–${read[read.length - 1]}` : read.join(", ");
  const label = read.length === 1 ? "Seite" : "Seiten";
  if (s.gesamt == null) return `${label} ${range} gelesen`;
  return read.length >= s.gesamt ? `Alle ${s.gesamt === 1 ? "1 Seite" : `${s.gesamt} Seiten`} gelesen` : `${label} ${range} von ${s.gesamt} gelesen, weitere nur auf Wunsch`;
}

const busyPhase = (d: DocEntry) => d.phase === "wartet" || d.phase === "speichert" || d.phase === "liest";

/** Erster Schritt: Liste der Dateien mit Größe, Fortschritt, Art (KI-Vorschlag, änderbar) und Entfernen. */
export function UploadList({ docs, onArt, onRemove, onRetry }: { docs: DocEntry[]; onArt: (d: DocEntry, art: Vertragsart) => void; onRemove: (d: DocEntry) => void; onRetry: (d: DocEntry) => void }) {
  if (!docs.length) return null;
  return (
    <ul className="job-list" aria-label="Dateien">
      {docs.map((d) => (
        <li key={d.key} className="job-item" data-phase={d.phase}>
          <FileText size={18} aria-hidden className="job-icon" />
          <span className="job-name" title={d.name}>
            {d.name}
          </span>
          <span className="job-size muted">{formatBytes(d.size)}</span>
          <span className="job-art">
            {d.phase === "fertig" || d.phase === "fehler" ? (
              <>
                <Select aria-label={`Dokumentart von ${d.name}`} value={d.art} onChange={(e) => onArt(d, e.target.value as Vertragsart)} options={ART_OPTIONS} />
                {d.phase === "fertig" && !d.artTouched && <span className="job-hint muted">Vorschlag der KI</span>}
              </>
            ) : d.phase === "abgelehnt" ? null : (
              <span className="muted">Art wird erkannt …</span>
            )}
          </span>
          <span className="job-actions">
            {d.phase === "fehler" && d.fileId && d.errorCode !== "limit" && (
              <IconButton size="sm" label={`${d.name} erneut auslesen`} onClick={() => onRetry(d)}>
                <RotateCcw size={14} />
              </IconButton>
            )}
            <IconButton size="sm" label={`${d.name} entfernen`} disabled={busyPhase(d)} onClick={() => onRemove(d)}>
              <X size={14} />
            </IconButton>
          </span>
          <div className="job-status">
            <progress className="job-progress" max={100} value={PHASE_PROGRESS[d.phase]} aria-label={`Fortschritt ${d.name}`} data-phase={d.phase} />
            <span className="job-status-text" role={d.phase === "fehler" || d.phase === "abgelehnt" ? "alert" : undefined}>
              {d.phase === "liest" ? <AiSpinner size="sm" label="KI liest das Dokument …" /> : statusText(d)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Prüfmaske: je Dokument Art (bestimmt Ablageordner und Schema), gelesene Seiten, Hinweise und die Angaben, die zum
 * Dokument gehören (Vertragsdatum, Preis …). Ein Klick auf den Namen zeigt es in der Vorschau.
 */
export function DocumentCards({
  docs,
  activeKey,
  readingKey,
  pilot,
  onShow,
  onArt,
  onMeta,
  onReread,
  onEditDocuments,
}: {
  docs: DocEntry[];
  activeKey: string | null;
  readingKey: string | null;
  pilot: boolean;
  onShow: (d: DocEntry) => void;
  onArt: (d: DocEntry, art: Vertragsart) => void;
  onMeta: (d: DocEntry, k: keyof ContractMeta, value: string) => void;
  /** Mit der gewählten Art neu auslesen (zählt als weitere Auslesung) */
  onReread: (d: DocEntry) => void;
  onEditDocuments?: () => void;
}) {
  const shown = docs.filter((d) => d.phase !== "abgelehnt");
  return (
    <fieldset className="form-group draft-docs">
      <legend>Dokumente ({shown.length})</legend>
      <p className="field-hint">
        Jedes Dokument wird mit seiner Art im passenden Ordner abgelegt. Vertragsdatum, Preis und Angebotsnummer gehören zum Dokument, nicht zum Projekt.
        {pilot ? "" : " Der Vertragspreis belegt keine Rechnungsbeträge vor."}
      </p>
      {shown.map((d) => {
        const f = d.draft?.felder;
        const id = `doc-${d.key}`;
        const schemaChanged = d.draft && d.draft.felder.vertragsart.wert !== d.art;
        return (
          <section key={d.key} className="draft-doc" data-active={activeKey === d.key || undefined} aria-labelledby={`${id}-name`}>
            <div className="draft-doc-head">
              <button type="button" className="draft-doc-name" id={`${id}-name`} onClick={() => onShow(d)} title="In der Vorschau zeigen">
                <FileText size={16} aria-hidden /> {d.name}
              </button>
              <span className="muted">{formatBytes(d.size)}</span>
              <Pill tone={d.phase === "fertig" ? "ok" : "warn"}>{d.phase === "fertig" ? "ausgelesen" : "nicht ausgelesen"}</Pill>
            </div>
            {d.phase === "fehler" && <p className="form-note">{statusText(d)}</p>}
            {pagesText(d) && <p className="field-hint">{pagesText(d)}</p>}
            {d.draft?.hinweise.map((h) => (
              <p key={h} className="field-hint">
                {h}
              </p>
            ))}
            <div className="dialog-row">
              <Field label="Art (bestimmt Ordner und gelesene Felder)" htmlFor={`${id}-art`}>
                <Select id={`${id}-art`} value={d.art} onChange={(e) => onArt(d, e.target.value as Vertragsart)} options={ART_OPTIONS} />
                {(schemaChanged || (d.phase === "fehler" && d.fileId && d.errorCode !== "limit")) && (
                  <span className="field-hint">
                    {schemaChanged ? "Die Felder dieser Art wurden noch nicht gelesen. " : ""}
                    <button type="button" className="hint-action" disabled={readingKey !== null} onClick={() => onReread(d)}>
                      {d.phase === "fehler" ? "Erneut auslesen" : `Als ${VERTRAGSART_LABEL[d.art]} neu auslesen`}
                    </button>
                    {readingKey === d.key && <AiSpinner size="sm" label="KI liest …" />}
                  </span>
                )}
              </Field>
              <Field label="Vertragsdatum" htmlFor={`${id}-datum`}>
                <Input id={`${id}-datum`} type="date" value={d.meta.vertragsdatum ?? ""} onChange={(e) => onMeta(d, "vertragsdatum", e.target.value)} />
              </Field>
            </div>
            <div className="dialog-row">
              <Field label={d.art === "werkvertrag" ? "Vertragspreis" : "Preis bzw. Honorar"} htmlFor={`${id}-preis`}>
                <Input id={`${id}-preis`} value={d.meta.vertragspreis ?? ""} onChange={(e) => onMeta(d, "vertragspreis", e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Angebots- bzw. Auftragsnummer" htmlFor={`${id}-angebot`}>
                <Input id={`${id}-angebot`} value={d.meta.angebotsnummer ?? ""} onChange={(e) => onMeta(d, "angebotsnummer", e.target.value)} autoComplete="off" />
              </Field>
            </div>
            {d.art === "werkvertrag" && (
              <Field label="Haustyp" htmlFor={`${id}-haustyp`}>
                <Input id={`${id}-haustyp`} value={d.meta.haustyp ?? ""} onChange={(e) => onMeta(d, "haustyp", e.target.value)} autoComplete="off" />
              </Field>
            )}
            {(f?.rechtsform.wert || f?.foerderung.wert) && (
              <ul className="contract-notes">
                {f.rechtsform.wert && <li>Rechtsform laut Vertrag: {f.rechtsform.wert}</li>}
                {f.foerderung.wert && (
                  <li>
                    KfW/WEF-Förderung angekreuzt. Frist {FOERDER_FRIST_MONATE} Monate ab Vertragsdatum
                    {foerderFrist(d.meta.vertragsdatum) ? `: bis ${formatDate(foerderFrist(d.meta.vertragsdatum)!)}` : " (Vertragsdatum fehlt)"}. Nur als Hinweis{pilot ? "" : ", es entsteht keine Aufgabe"}.
                  </li>
                )}
              </ul>
            )}
          </section>
        );
      })}
      {onEditDocuments && (
        <Button size="sm" onClick={onEditDocuments}>
          Dokumente hinzufügen oder entfernen
        </Button>
      )}
    </fieldset>
  );
}
