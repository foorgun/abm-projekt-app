import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { demoTermineQuelle } from "../demo/termine";
import { TERMIN_TYP_LABEL, tagLabel, termineJeTag, type Termin, type TermineQuelle, type TerminTyp } from "../lib/termine";
import { Card, CardHead, Pill, Skeleton } from "./ui";

const TYPEN: TerminTyp[] = ["baustelle", "besprechung", "behoerde", "intern"];

/**
 * Dashboard-Karte "Termine diese Woche": Montag bis Freitag als Spalten, auf dem Handy untereinander.
 * Die Quelle ist austauschbar (TermineQuelle); heute liefert sie erfundene Demo-Termine, später Outlook.
 */
export function TermineKarte({ heute, quelle = demoTermineQuelle }: { heute: string; quelle?: TermineQuelle }) {
  const [termine, setTermine] = useState<Termin[] | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let alive = true;
    setFehler(false);
    quelle
      .getTermineDieseWoche(heute)
      .then((t) => alive && setTermine(t))
      .catch(() => alive && setFehler(true));
    return () => {
      alive = false;
    };
  }, [quelle, heute]);

  const tage = termine ? termineJeTag(termine, heute) : [];

  return (
    <Card>
      <CardHead
        icon={<CalendarDays size={16} />}
        title={
          <>
            Termine diese Woche
            {quelle.hinweis && <Pill tone="outline" dot={false}>{quelle.hinweis}</Pill>}
          </>
        }
        actions={
          <ul className="termin-legende" aria-label="Arten von Terminen">
            {TYPEN.map((t) => (
              <li key={t}>
                <span className="termin-punkt" data-typ={t} aria-hidden /> {TERMIN_TYP_LABEL[t]}
              </li>
            ))}
          </ul>
        }
      />
      <div className="card-body">
        {fehler ? (
          <p className="muted">Die Termine konnten nicht geladen werden.</p>
        ) : !termine ? (
          <Skeleton h={120} />
        ) : (
          <ol className="termin-woche">
            {tage.map((tag) => (
              <li key={tag.datum} className="termin-tag" data-heute={tag.heute || undefined} aria-current={tag.heute ? "date" : undefined}>
                <h3 className="termin-tag-kopf">
                  {tagLabel(tag.datum)}
                  {tag.heute && <span className="termin-heute">heute</span>}
                </h3>
                {tag.gesamt === 0 ? (
                  <p className="termin-leer">keine Termine</p>
                ) : (
                  <ul className="termin-liste">
                    {tag.termine.map((t) => (
                      <li key={t.id} className="termin" title={`${t.von}${t.bis ? `–${t.bis}` : ""} ${t.titel}${t.ort ? `, ${t.ort}` : ""} (${TERMIN_TYP_LABEL[t.typ]})`}>
                        <span className="termin-punkt" data-typ={t.typ} aria-hidden />
                        <span className="termin-zeit">{t.von}</span>
                        <span className="termin-text">
                          <span className="termin-titel">
                            <span className="sr-only">{TERMIN_TYP_LABEL[t.typ]}: </span>
                            {t.titel}
                          </span>
                          {t.ort && <span className="termin-ort">{t.ort}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {tag.weitere > 0 && <p className="termin-weitere">+{tag.weitere} weitere</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
