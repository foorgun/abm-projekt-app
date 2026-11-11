import { useMemo, useRef, useState } from "react";
import { FileSearch, Upload } from "lucide-react";
import { useToast } from "../../components/Toast";
import { AiSpinner, Button, Card, CardBody, CardHead, Checkbox, Field, Pill, Select } from "../../components/ui";
import { cleanMeta } from "../../lib/extract/applyDraft";
import { CONTRACT_ACCEPT, checkContractFile } from "../../lib/extract/contractFile";
import { CONTRACT_FOLDER } from "../../lib/extract/filing";
import { extractProjectFromDocument } from "../../lib/extract";
import { patchAusVergleich, vergleichZeilen, vorauswahl, type VergleichKey, type VergleichZeile } from "../../lib/extract/nachtraeglich";
import { restrictToType, SICHERHEIT_LABEL, VERTRAGSART_LABEL, VERTRAGSARTEN, type ProjectDraft, type Vertragsart } from "../../lib/extract/types";
import { useSession } from "../../lib/session";
import { useData } from "../../lib/store";
import type { BauherrContact, Dataset, Project } from "../../lib/types";

interface Gelesen {
  file: File;
  draft: ProjectDraft;
  /** erkannte Art; die gewählte steht in `art` */
  erkannt: Vertragsart;
}

/**
 * "Vertrag nachträglich auslesen" (nur Admin und Mitarbeiter): ein später eingegangener Vertrag (z. B. Vermesservertrag)
 * wird mit derselben Auslesung wie beim Anlegen gelesen und Feld für Feld mit dem Projekt verglichen. Leere Felder sind
 * vorgewählt, abweichende nicht. "Übernehmen" schreibt nur die gewählten Felder und legt die Datei im Ordner ihrer Art ab.
 */
export function VertragNachtraeglich({ project, data, contact }: { project: Project; data: Dataset; contact: BauherrContact | null }) {
  const { repo, mutate } = useData();
  const { user } = useSession();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"lesen" | "speichern" | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gelesen, setGelesen] = useState<Gelesen | null>(null);
  const [art, setArt] = useState<Vertragsart>("sonstiges");
  const [wahl, setWahl] = useState<Set<VergleichKey>>(new Set());
  const [ablegen, setAblegen] = useState(true);

  const ctx = useMemo(() => ({ project, contact, parties: data.parties.filter((p) => p.projectId === project.id) }), [project, contact, data.parties]);
  const draft = useMemo(() => (gelesen ? { ...gelesen.draft, felder: art === gelesen.erkannt ? gelesen.draft.felder : restrictToType(gelesen.draft.felder, art) } : null), [gelesen, art]);
  const zeilen = useMemo(() => (draft ? vergleichZeilen(draft, ctx) : []), [draft, ctx]);

  if (user.role === "freiberufler") return null;

  const ordner = CONTRACT_FOLDER[art];
  const schonDa = gelesen ? data.documents.some((d) => d.projectId === project.id && d.folderPath === ordner && d.name === gelesen.file.name) : false;
  const offen = zeilen.filter((z) => z.status !== "gleich");
  const gleich = zeilen.filter((z) => z.status === "gleich");
  const anzahl = offen.filter((z) => wahl.has(z.key)).length;

  async function lesen(file: File | undefined) {
    if (!file) return;
    setFehler(null);
    setGelesen(null);
    const check = checkContractFile(file);
    if (!check.ok) return setFehler(check.reason);
    setBusy("lesen");
    try {
      const d = await extractProjectFromDocument(file, { demo: repo.mode === "demo", call: repo.extractProject ? (r) => repo.extractProject!(r) : undefined });
      const erkannt = (d.felder.vertragsart.wert as Vertragsart | null) ?? "sonstiges";
      setGelesen({ file, draft: d, erkannt });
      setArt(erkannt);
      setWahl(vorauswahl(vergleichZeilen(d, ctx)));
      setAblegen(!data.documents.some((x) => x.projectId === project.id && x.folderPath === CONTRACT_FOLDER[erkannt] && x.name === file.name));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  function artWechseln(next: Vertragsart) {
    if (!gelesen) return;
    setArt(next);
    const felder = next === gelesen.erkannt ? gelesen.draft.felder : restrictToType(gelesen.draft.felder, next);
    setWahl(vorauswahl(vergleichZeilen({ ...gelesen.draft, felder }, ctx)));
  }

  function umschalten(key: VergleichKey, an: boolean) {
    setWahl((s) => {
      const n = new Set(s);
      if (an) n.add(key);
      else n.delete(key);
      return n;
    });
  }

  async function uebernehmen() {
    if (!gelesen || !draft) return;
    setBusy("speichern");
    setFehler(null);
    const patch = patchAusVergleich(zeilen, wahl, draft, ctx);
    const notizen: string[] = [];
    if (patch) {
      const res = await mutate((r) => r.updateProject(project.id, patch));
      if (!res.ok) {
        setBusy(null);
        return setFehler(res.error);
      }
      notizen.push(`${anzahl} ${anzahl === 1 ? "Wert" : "Werte"} übernommen.`);
    }
    if (ablegen) {
      const f = gelesen.file;
      const meta = cleanMeta({ vertragsdatum: draft.felder.vertragsdatum.wert ?? undefined, vertragspreis: draft.felder.vertragspreis.wert ?? undefined, angebotsnummer: draft.felder.angebotsnummer.wert ?? undefined, haustyp: draft.felder.haustyp.wert ?? undefined });
      const res = await mutate((r) => r.fileContract({ projectId: project.id, docType: art, meta, file: { name: f.name, size: f.size, type: f.type }, blob: f }));
      if (!res.ok) {
        setBusy(null);
        if (patch) toast("Werte übernommen", "ok", notizen.join(" "));
        setGelesen(null);
        return setFehler(`Die Datei wurde nicht abgelegt: ${res.error} Bitte unter Dokumente in „${ordner}“ hochladen.`);
      }
      notizen.push(`${f.name} liegt als ${VERTRAGSART_LABEL[art]} in „${ordner}“.`);
    }
    setBusy(null);
    setGelesen(null);
    toast(patch ? "Vertrag übernommen" : "Vertrag abgelegt", "ok", notizen.join(" ") || undefined);
  }

  return (
    <Card>
      <CardHead
        title="Vertrag nachträglich auslesen"
        sub="Vermesservertrag, Werkvertrag oder Baugrundauftrag kam später? Auslesen, mit dem Projekt vergleichen, gewählte Werte übernehmen."
        icon={<FileSearch size={16} />}
      />
      <CardBody>
        <div className="vn">
          <div className="pp-actions">
            <Button variant={gelesen ? "outline" : "primary"} icon={<Upload size={15} />} disabled={!!busy} onClick={() => input.current?.click()}>
              {gelesen ? "Anderen Vertrag wählen" : "Vertrag auswählen"}
            </Button>
            <input ref={input} type="file" accept={CONTRACT_ACCEPT} hidden aria-label="Vertrag auswählen" onChange={(e) => void lesen(e.target.files?.[0])} />
          </div>

          {busy === "lesen" && <AiSpinner size="sm" label="Vertrag wird ausgelesen …" />}
          {fehler && (
            <p className="form-error" role="alert">
              {fehler}
            </p>
          )}

          {gelesen && draft && (
            <>
              <div className="vn-kopf">
                <Field label="Dokumentart" htmlFor="vn-art" hint={`Bestimmt den Ordner: „${ordner}“.`}>
                  <Select id="vn-art" value={art} onChange={(e) => artWechseln(e.target.value as Vertragsart)} options={VERTRAGSARTEN.map((a) => ({ value: a, label: VERTRAGSART_LABEL[a] }))} />
                </Field>
                <p className="field-hint">
                  <strong>{gelesen.file.name}</strong>
                  {art !== gelesen.erkannt ? ` · erkannt als ${VERTRAGSART_LABEL[gelesen.erkannt]}` : ""}
                </p>
              </div>
              {draft.hinweise.length > 0 && (
                <ul className="contract-notes">
                  {draft.hinweise.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}

              {offen.length > 0 ? (
                <div className="vn-tabelle" role="table" aria-label="Vergleich Projekt und Vertrag">
                  <div className="vn-zeile vn-zeile-kopf" role="row">
                    <span role="columnheader">Feld</span>
                    <span role="columnheader">Im Projekt</span>
                    <span role="columnheader">Aus dem Vertrag</span>
                  </div>
                  {offen.map((z) => (
                    <VergleichsZeile key={z.key} z={z} an={wahl.has(z.key)} onChange={(an) => umschalten(z.key, an)} />
                  ))}
                </div>
              ) : (
                <p className="field-hint" role="status">
                  Der Vertrag enthält keine Angaben, die im Projekt fehlen oder abweichen.
                </p>
              )}
              {gleich.length > 0 && (
                <p className="field-hint vn-gleich" role="status">
                  Schon gleich im Projekt: {gleich.map((z) => z.label).join(", ")}.
                </p>
              )}
              {offen.some((z) => z.key === "vermesser") && (
                <p className="field-hint">Im Planungsprotokoll steht beim Vermesser der Standard aus den Bürodaten; der ausgelesene Vermesser wird trotzdem im Projekt gespeichert.</p>
              )}

              <Checkbox
                label={schonDa ? `Datei in „${ordner}“ ablegen (eine Datei mit diesem Namen liegt dort schon)` : `Datei in „${ordner}“ ablegen`}
                checked={ablegen}
                onChange={(e) => setAblegen(e.target.checked)}
              />
              <div className="pp-actions">
                <Button variant="primary" disabled={!!busy || (!anzahl && !ablegen)} onClick={() => void uebernehmen()}>
                  {busy === "speichern" ? "Speichert …" : anzahl ? `Übernehmen (${anzahl})` : "Nur Datei ablegen"}
                </Button>
                <Button variant="ghost" disabled={!!busy} onClick={() => setGelesen(null)}>
                  Verwerfen
                </Button>
              </div>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function VergleichsZeile({ z, an, onChange }: { z: VergleichZeile; an: boolean; onChange: (an: boolean) => void }) {
  const id = `vn-${z.key}`;
  return (
    <div className="vn-zeile" role="row" data-status={z.status}>
      <span role="cell" className="vn-feld">
        <input id={id} type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{z.label}</label>
        {z.status === "abweichend" ? (
          <Pill tone="warn" dot={false}>
            weicht ab
          </Pill>
        ) : (
          <Pill tone="info" dot={false}>
            {z.aktuell ? "ergänzt" : "leer"}
          </Pill>
        )}
      </span>
      <span role="cell" className={z.aktuell ? "vn-alt" : "vn-alt muted"}>
        {z.aktuell ?? "–"}
      </span>
      <span role="cell" className="vn-neu">
        <span>
          <strong>{z.neu}</strong>
          {z.zusatz && <span className="muted"> · {z.zusatz}</span>}
        </span>
        <span className="field-hint">
          {[z.feld.quelle?.text ? `„${z.feld.quelle.text}“` : null, z.feld.quelle?.seite ? `S. ${z.feld.quelle.seite}` : null, `Sicherheit ${SICHERHEIT_LABEL[z.feld.sicherheit]}`].filter(Boolean).join(" · ")}
        </span>
      </span>
    </div>
  );
}
