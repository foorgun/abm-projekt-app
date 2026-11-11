import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { Button, Card, CardBody, CardHead, Input, Pill, Select } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { AUSWAHL, gemeindeAusVerwaltung, THEMA_LABEL, THEMEN, uebernahme, zeilenAus, type Ergebnis, type StandortAntwort, type StandortFehler, type Thema, type Zeile } from "../../lib/planungsprotokoll/standort";
import { ankreuzWerte } from "../../lib/planungsprotokoll/zuordnung";
import { useData } from "../../lib/store";
import type { Dataset, Project, ProtokollVorlage } from "../../lib/types";

const datum = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : "");

/**
 * Standortangaben im Reiter Planungsprotokoll: Vorschläge zur Bauadresse holen, prüfen, mit einer Bestätigung übernehmen.
 * Ist noch nichts übernommen, startet die Ermittlung beim Öffnen von selbst (Antworten aus dem Cache zählen nicht zum Tageslimit).
 * Vorschläge liegen nur hier im Zustand; ins PDF kommt nur, was übernommen und damit gespeichert ist.
 */
export function StandortAngaben({ project, data, vorlage }: { project: Project; data: Dataset; vorlage: ProtokollVorlage | null }) {
  const { repo, mutate } = useData();
  const toast = useToast();
  const gespeichert = useMemo(() => data.standortAngaben.find((x) => x.projectId === project.id), [data.standortAngaben, project.id]);
  const [busy, setBusy] = useState<"analyse" | "speichern" | null>(null);
  const [antwort, setAntwort] = useState<StandortAntwort | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [fehler, setFehler] = useState<StandortFehler | null>(null);
  /** Gemeindeverwaltung mit übernehmen (Seite 1). Vorgewählt nur, wenn im Projekt noch keine Gemeinde steht. */
  const [mitGemeinde, setMitGemeinde] = useState(false);
  const gemeindeBisher = data.parties.find((p) => p.projectId === project.id && p.role === "gemeinde");
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);

  async function ermitteln() {
    setBusy("analyse");
    setFehler(null);
    setSpeicherFehler(null);
    setAntwort(null);
    try {
      const res = await repo.standortAnalyse(project.id);
      if (!res.ok) return setFehler(res);
      setAntwort(res);
      setZeilen(zeilenAus(res.ergebnisse));
      setMitGemeinde(!!res.verwaltung && !gemeindeBisher);
    } catch (e) {
      setFehler({ ok: false, code: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function speichern(angaben: Record<string, NonNullable<typeof gespeichert>["angaben"][string]> | null, meldung: string, gemeinde?: ReturnType<typeof gemeindeAusVerwaltung>) {
    setBusy("speichern");
    setSpeicherFehler(null);
    const res = await mutate(async (r) => {
      if (angaben) await r.saveStandortAngaben(project.id, angaben);
      if (gemeinde) await r.updateProject(project.id, { parties: { gemeinde } });
    });
    setBusy(null);
    if (!res.ok) return setSpeicherFehler(res.error);
    setAntwort(null);
    toast(meldung, "ok");
  }

  // Einmal je Projekt und Aufruf des Reiters, nur solange nichts übernommen ist
  const automatisch = useRef<string | null>(null);
  const nichtsUebernommen = !gespeichert || Object.keys(gespeichert.angaben).length === 0;
  useEffect(() => {
    if (automatisch.current === project.id || !nichtsUebernommen) return;
    automatisch.current = project.id;
    void ermitteln();
    // Bewusst nur project.id: nur beim Öffnen, nicht nach jedem Speichern oder Entfernen
  }, [project.id]);

  const setZeile = (thema: Thema, patch: Partial<Zeile>) => setZeilen((z) => z.map((x) => (x.thema === thema ? { ...x, ...patch } : x)));
  const anzahlWerte = antwort ? zeilen.filter((z) => z.gewaehlt && z.wert.trim() && antwort.ergebnisse.find((e) => e.thema === z.thema)?.status === "ermittelt").length : 0;
  const verwaltung = antwort?.verwaltung ?? null;
  const gemeindeMit = !!verwaltung && mitGemeinde;
  const anzahl = anzahlWerte + (gemeindeMit ? 1 : 0);
  const angaben = gespeichert?.angaben ?? {};
  const uebernommen = THEMEN.filter((t) => angaben[t]);
  const { kreuze, offen } = vorlage ? ankreuzWerte(vorlage, angaben) : { kreuze: [], offen: [] };

  return (
    <Card>
      <CardHead title="Standortangaben" sub="Aus der Bauadresse ermittelt, beim Öffnen automatisch, solange nichts übernommen ist. Ins PDF kommt nur, was du übernimmst." icon={<MapPin size={16} />} />
      <CardBody>
        <div className="pp-standort">
          <div className="pp-actions">
            <Button variant="primary" icon={<MapPin size={15} />} disabled={!!busy} onClick={() => void ermitteln()}>
              {busy === "analyse" ? "Wird ermittelt …" : antwort ? "Erneut ermitteln" : "Standortangaben ermitteln"}
            </Button>
          </div>

          {fehler && (
            <div className="form-error" role="alert">
              {fehler.fehlt?.length ? (
                <ul className="pp-vorschlag-fehlt">
                  {fehler.fehlt.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p>{fehler.message}</p>
              )}
              {(fehler.code === "fehlende_angaben" || fehler.code === "adresse_nicht_gefunden" || fehler.code === "bundesland_passt_nicht") && <Link to={`/projekte/${project.id}`}>Zur Übersicht</Link>}
            </div>
          )}

          {antwort && (
            <>
              <p className="field-hint" role="status">
                Standort: <strong>{antwort.adresse}</strong> ({antwort.bundesland}
                {antwort.gemeinde ? `, Gemeinde ${antwort.gemeinde}` : ""}). {antwort.genauigkeit === "haus" ? "Auf das Haus genau." : antwort.genauigkeit === "strasse" ? "Nur auf die Straße genau: Kartenwerte sind deshalb nicht angehakt." : "Nur auf den Ort genau: Kartenwerte sind nicht abgefragt."}
              </p>
              <ul className="pp-standort-liste">
                {antwort.ergebnisse.map((e) => (
                  <ErgebnisZeile key={e.thema} e={e} z={zeilen.find((x) => x.thema === e.thema)} onChange={(p) => setZeile(e.thema, p)} />
                ))}
                {verwaltung && (
                  <li className="pp-standort-zeile">
                    <label className="pp-standort-titel" htmlFor="pp-standort-gemeinde">
                      <input id="pp-standort-gemeinde" type="checkbox" checked={mitGemeinde} onChange={(ev) => setMitGemeinde(ev.target.checked)} />
                      <strong>Gemeinde (Seite 1)</strong>
                    </label>
                    <span className="pp-standort-wert">{[verwaltung.name, verwaltung.anschrift, verwaltung.email].filter(Boolean).join(" · ")}</span>
                    <span className="field-hint">
                      {verwaltung.quelle}. Telefon steht dort nicht, bitte bei Bedarf unten bei „Gemeinde“ ergänzen.
                      {gemeindeBisher ? ` Im Projekt steht schon „${gemeindeBisher.name}“; angehakt wird es ersetzt.` : ""}
                    </span>
                  </li>
                )}
              </ul>
              <div className="pp-actions">
                <Button
                  variant="primary"
                  disabled={!!busy || !anzahl}
                  onClick={() =>
                    void speichern(
                      anzahlWerte ? uebernahme(antwort.ergebnisse, zeilen, angaben) : null,
                      `${anzahl} ${anzahl === 1 ? "Wert" : "Werte"} übernommen`,
                      gemeindeMit && verwaltung ? gemeindeAusVerwaltung(verwaltung, gemeindeBisher) : undefined,
                    )
                  }
                >
                  {busy === "speichern" ? "Speichert …" : `Alle übernehmen (${anzahl})`}
                </Button>
                <Button variant="ghost" disabled={!!busy} onClick={() => setAntwort(null)}>
                  Verwerfen
                </Button>
              </div>
              <p className="field-hint">Amtliche Übersichtsdaten ohne Gewähr, bitte prüfen. Adresssuche: © OpenStreetMap-Mitwirkende (ODbL), Photon. Gemeinden: Statistisches Bundesamt (Destatis), Anschriften der Verwaltungen: Statistische Ämter des Bundes und der Länder. Daten aus dem Umweltinformationssystem der LUBW, des Bayerischen Landesamts für Umwelt (www.lfu.bayern.de) und des HLNUG.</p>
            </>
          )}
          {speicherFehler && (
            <p className="form-error" role="alert">
              {speicherFehler}
            </p>
          )}

          {uebernommen.length > 0 && (
            <div className="pp-standort-stand">
              <h4>Übernommen{gespeichert ? ` am ${datum(gespeichert.geaendertAm)}` : ""}</h4>
              <ul className="pp-standort-werte">
                {uebernommen.map((t) => (
                  <li key={t}>
                    <span className="muted">{THEMA_LABEL[t]}:</span> <strong>{angaben[t].anzeige}</strong>{" "}
                    <span className="muted">
                      {[angaben[t].geaendert ? "von Hand geändert" : null, angaben[t].quelle, datum(angaben[t].abgerufenAm)].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              {vorlage && (
                <p className="field-hint">
                  Im nächsten PDF werden {kreuze.length} {kreuze.length === 1 ? "Feld" : "Felder"} angekreuzt. Lärm, Hochwasser und Höhe haben in den Vorlagen kein passendes Feld und bleiben hier als Information.
                  {offen.length > 0 && ` Von Hand im PDF zu vermerken: ${offen.join(", ")}.`}
                </p>
              )}
              <div className="pp-actions">
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void speichern({}, "Übernommene Standortangaben entfernt")}>
                  Übernommene Werte entfernen
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function ErgebnisZeile({ e, z, onChange }: { e: Ergebnis; z: Zeile | undefined; onChange: (p: Partial<Zeile>) => void }) {
  const label = THEMA_LABEL[e.thema];
  if (e.status !== "ermittelt") {
    return (
      <li className="pp-standort-zeile pp-standort-zeile-leer">
        <span className="pp-standort-titel">
          <strong>{label}</strong>
          <Pill tone={e.status === "fehler" ? "danger" : "neutral"} dot={false}>
            {e.status === "fehler" ? "Fehler" : "Nicht ermittelbar"}
          </Pill>
        </span>
        <span className="field-hint">
          {e.grund}{" "}
          {e.viewer && (
            <a href={e.viewer} target="_blank" rel="noreferrer">
              Viewer öffnen <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </span>
      </li>
    );
  }
  const auswahl = AUSWAHL[e.thema];
  const id = `pp-standort-${e.thema}`;
  return (
    <li className="pp-standort-zeile">
      <label className="pp-standort-titel" htmlFor={id}>
        <input id={id} type="checkbox" checked={!!z?.gewaehlt} onChange={(ev) => onChange({ gewaehlt: ev.target.checked })} />
        <strong>{label}</strong>
      </label>
      <span className="pp-standort-wert">
        {auswahl ? (
          <Select aria-label={`Wert für ${label}`} value={z?.wert ?? ""} onChange={(ev) => onChange({ wert: ev.target.value })} options={auswahl.map((a) => ({ value: a.wert, label: a.wert === e.wert && e.anzeige ? e.anzeige : a.text }))} />
        ) : (
          <Input aria-label={`Wert für ${label}`} value={z?.wert ?? ""} onChange={(ev) => onChange({ wert: ev.target.value })} autoComplete="off" />
        )}
      </span>
      <span className="field-hint">
        {[e.quelle, datum(e.abgerufenAm)].filter(Boolean).join(" · ")}
        {e.hinweis ? ` ${e.hinweis}` : ""}
      </span>
    </li>
  );
}
