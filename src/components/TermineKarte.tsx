import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { demoTermineQuelle } from "../demo/termine";
import { arbeitswoche, istVergangen, naechsterHeute, tagAnzeige, tagKopf, TERMIN_TYP_LABEL, termineJeTag, wocheWechseln, wochenBereich, type Termin, type TermineQuelle, type TerminTyp } from "../lib/termine";
import { Pill, Skeleton } from "./ui";

const TYPEN: TerminTyp[] = ["baustelle", "besprechung", "behoerde", "intern"];

/** Uhrzeit als HH:MM (Ortszeit), jede Minute neu: für das Abdunkeln vergangener Termine heute. */
function useJetzt(): string {
  const lesen = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [jetzt, setJetzt] = useState(lesen);
  useEffect(() => {
    const timer = window.setInterval(() => setJetzt(lesen()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return jetzt;
}

/**
 * Dashboard-Karte "Termine diese Woche": Montag bis Freitag als Spalten mit Termin-Kacheln, schmal als Liste.
 * Kein Stundenraster, kein Wochenende. Die Quelle ist austauschbar (TermineQuelle); heute liefert sie erfundene
 * Demo-Termine, später Outlook. Ein Klick auf eine Kachel öffnet nichts (Demo).
 */
export function TermineKarte({ heute, quelle = demoTermineQuelle, jetzt: jetztFest }: { heute: string; quelle?: TermineQuelle; /** nur für Tests und Screenshots: feste Uhrzeit HH:MM */ jetzt?: string }) {
  const [offset, setOffset] = useState(0);
  const [termine, setTermine] = useState<Termin[] | null>(null);
  const [fehler, setFehler] = useState(false);
  /** Tage, deren "+N weitere" aufgeklappt ist */
  const [offen, setOffen] = useState<ReadonlySet<string>>(new Set());
  const uhr = useJetzt();
  const jetzt = jetztFest ?? uhr;

  useEffect(() => {
    let alive = true;
    setFehler(false);
    quelle
      .getTermineDieseWoche(heute, offset)
      .then((t) => alive && setTermine(t))
      .catch(() => alive && setFehler(true));
    return () => {
      alive = false;
    };
  }, [quelle, heute, offset]);

  const woche = arbeitswoche(heute, offset);
  const tage = termine ? termineJeTag(termine, heute, undefined, offset) : [];
  const naechster = termine ? naechsterHeute(termine, heute, jetzt) : null;
  const wechseln = (schritt: Parameters<typeof wocheWechseln>[1]) => setOffset((o) => wocheWechseln(o, schritt));

  return (
    <section className="card termin-karte" aria-labelledby="termine-titel">
      <header className="termin-kopf">
        <div className="termin-kopf-links">
          <h2 className="card-title" id="termine-titel">
            <CalendarDays size={16} aria-hidden />
            Termine diese Woche
            {quelle.hinweis && (
              <Pill tone="outline" dot={false}>
                {quelle.hinweis}
              </Pill>
            )}
          </h2>
        </div>
        <div className="termin-kopf-rechts">
          <span className="termin-bereich" aria-live="polite">
            {wochenBereich(woche)}
          </span>
          <div className="termin-nav" role="group" aria-label="Woche wechseln">
            <button type="button" aria-label="Vorherige Woche" title="Vorherige Woche" onClick={() => wechseln("zurueck")}>
              <ChevronLeft size={15} aria-hidden />
            </button>
            <button type="button" onClick={() => wechseln("heute")} aria-pressed={offset === 0}>
              Heute
            </button>
            <button type="button" aria-label="Nächste Woche" title="Nächste Woche" onClick={() => wechseln("vor")}>
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
        </div>
        <ul className="termin-legende" aria-label="Arten von Terminen">
          {TYPEN.map((t) => (
            <li key={t}>
              <span className="termin-probe" data-typ={t} aria-hidden /> {TERMIN_TYP_LABEL[t]}
            </li>
          ))}
        </ul>
      </header>
      <div className="card-body">
        {fehler ? (
          <p className="muted">Die Termine konnten nicht geladen werden.</p>
        ) : !termine ? (
          <Skeleton h={160} />
        ) : (
          <ol className="termin-woche">
            {tage.map((tag) => {
              const kopf = tagKopf(tag.datum);
              const aufgeklappt = offen.has(tag.datum);
              const anzeige = tagAnzeige(tag, aufgeklappt);
              return (
                <li key={tag.datum} className="termin-tag" data-heute={tag.heute || undefined} aria-current={tag.heute ? "date" : undefined}>
                  <h3 className="termin-tag-kopf">
                    <span className="termin-wt">{kopf.kuerzel}</span>
                    <span className="termin-zahl">{kopf.zahl}</span>
                    {tag.heute && <span className="sr-only">, heute</span>}
                  </h3>
                  {tag.gesamt === 0 ? (
                    <p className="termin-leer">Keine Termine</p>
                  ) : (
                    <ul className="termin-liste" id={`termine-${tag.datum}`}>
                      {anzeige.termine.map((t) => (
                        <li
                          key={t.id}
                          className="termin"
                          data-typ={t.typ}
                          data-vergangen={istVergangen(t, heute, jetzt) || undefined}
                          data-naechster={naechster?.id === t.id || undefined}
                          tabIndex={0}
                          title={`${t.von}${t.bis ? `–${t.bis}` : ""} ${t.titel}${t.ort ? `, ${t.ort}` : ""} (${TERMIN_TYP_LABEL[t.typ]})`}
                        >
                          <span className="termin-titel">
                            <span className="sr-only">{TERMIN_TYP_LABEL[t.typ]}: </span>
                            {t.titel}
                          </span>
                          <span className="termin-zeit">
                            {t.von}
                            {t.bis ? `–${t.bis}` : ""}
                            {naechster?.id === t.id && <span className="sr-only"> (als Nächstes)</span>}
                            {istVergangen(t, heute, jetzt) && <span className="sr-only"> (vorbei)</span>}
                          </span>
                          {t.ort && <span className="termin-ort">{t.ort}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(anzeige.weitere > 0 || (aufgeklappt && tag.weitere > 0)) && (
                    <button
                      type="button"
                      className="termin-weitere"
                      aria-expanded={aufgeklappt}
                      aria-controls={`termine-${tag.datum}`}
                      onClick={() => setOffen((alt) => new Set(alt.has(tag.datum) ? [...alt].filter((d) => d !== tag.datum) : [...alt, tag.datum]))}
                    >
                      {aufgeklappt ? "Weniger" : `+${anzeige.weitere} weitere`}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
