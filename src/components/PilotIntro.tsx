import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { FlaskConical, MessageSquare, MousePointerClick, TriangleAlert } from "lucide-react";
import { isPilot } from "../lib/appMode";
import { firstName, useSession } from "../lib/session";
import { Button, Dialog } from "./ui";

/**
 * Hinweis für die ersten Nutzer des Pilotbetriebs. Der Satz zu den Daten gilt, solange die erfundenen Demo-Daten geladen sind:
 * sobald echte Projekte eingetragen werden, hier anpassen (siehe docs/hosting-echtbetrieb.md).
 */
export const PILOT_NOTICE = "Das ist ein Pilot. Die Daten sind erfunden, Prozessschritte und Warnfristen sind Annahmen.";

const KEY = "abm.pilot-einfuehrung.gesehen";

function seen(userId: string): boolean {
  try {
    return localStorage.getItem(`${KEY}.${userId}`) === "1";
  } catch {
    return false; // ohne Speicher (privates Fenster): lieber einmal zu oft zeigen
  }
}
function markSeen(userId: string) {
  try {
    localStorage.setItem(`${KEY}.${userId}`, "1");
  } catch {
    /* gilt dann nur für diese Sitzung */
  }
}

/** Inhalt der Einführung: auch auf der Hilfeseite verwendet. */
export function PilotIntroContent() {
  const staff = useSession().user.role !== "freiberufler";
  // Pilot-Modus: nur Projekte, Dokumente und Planungsprotokoll; Aufgaben, Prüfliste und Agent sind ausgeblendet
  const pilot = isPilot();
  return (
    <div className="intro">
      <p className="intro-lead">
        <TriangleAlert size={16} aria-hidden /> {PILOT_NOTICE}
      </p>
      <ul className="intro-list">
        <li>
          <FlaskConical size={16} aria-hidden />
          <span>
            <strong>Was das heißt:</strong> Alle Projekte, Bauherren{pilot ? " und Dokumente" : ", Rechnungen und Mails"} hier sind Beispiele. Trage noch keine echten Kundendaten ein. Die zwölf Prozessschritte und die
            Fristen der Warnungen (z. B. „Vertrag seit 3 Wochen offen“) sind ein erster Vorschlag und werden mit euch abgestimmt.
          </span>
        </li>
        <li>
          <MousePointerClick size={16} aria-hidden />
          <span>
            <strong>Zum Ausprobieren:</strong>{" "}
            {staff && pilot
              ? "ein Projekt aus einem Dokument anlegen, im Projekt einen Schritt mit Datum setzen, eine Datei in einen Ordner legen, ein Planungsprotokoll erzeugen."
              : staff
                ? "ein Projekt anlegen, im Projekt einen Schritt mit Datum setzen, eine Datei in einen Ordner legen, eine Aufgabe abhaken, in der Prüfliste eine Zuordnung bestätigen."
                : "deine zugewiesenen Projekte ansehen, den Stand im Prozess verfolgen und eine Datei in einen Projektordner legen."}{" "}
            Fehler machen ist ausdrücklich erlaubt, es sind Beispieldaten.
          </span>
        </li>
        <li>
          <TriangleAlert size={16} aria-hidden />
          <span>
            <strong>Was noch nicht geht:</strong> {pilot ? "" : "Der Posteingangs-Agent liest noch keine echten Postfächer. "}Die Beispieldokumente haben keinen Inhalt und lassen sich nicht öffnen; selbst
            hochgeladene Dateien schon.
          </span>
        </li>
        <li>
          <MessageSquare size={16} aria-hidden />
          <span>
            <strong>Rückmeldung:</strong> Was fehlt, was stört, was anders heißt als bei euch im Büro: bitte direkt an Furkan. Genau dafür ist der Pilot da.
          </span>
        </li>
      </ul>
    </div>
  );
}

const IntroContext = createContext<() => void>(() => {});

/** Öffnet die Einführung erneut (Hilfeseite). */
export function useShowPilotIntro() {
  return useContext(IntroContext);
}

/** Zeigt die Einführung im Echtbetrieb beim ersten Login (je Konto und Gerät einmal) und stellt sie für die Hilfeseite bereit. */
export function PilotIntroProvider({ children }: { children: ReactNode }) {
  const { user, demo } = useSession();
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!demo && user.id && !seen(user.id)) setOpen(true);
  }, [demo, user.id]);

  function close() {
    if (user.id) markSeen(user.id);
    setOpen(false);
  }

  return (
    <IntroContext.Provider value={show}>
      {children}
      {open && (
        <Dialog
          title={`Willkommen, ${firstName(user)}`}
          wide
          onClose={close}
          footer={
            <Button variant="primary" onClick={close} autoFocus>
              Verstanden, los geht’s
            </Button>
          }
        >
          <PilotIntroContent />
          <p className="intro-foot">Diese Einführung erscheint nur einmal. Du findest sie jederzeit unter „Hilfe“ unten links.</p>
        </Dialog>
      )}
    </IntroContext.Provider>
  );
}
