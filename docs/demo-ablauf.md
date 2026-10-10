# Demo-Ablauf: ABM Projekt-App (10 Minuten)

Für die Vorführung vor Geschäftsführung und IT. Alle Daten sind erfunden; nichts davon stammt aus der echten Projektliste.

## Vorbereitung (5 Minuten vorher)

- App öffnen (lokal `npm run dev` → http://localhost:5173 oder die veröffentlichte Demo, siehe `docs/demo-veroeffentlichen.md`).
- Benutzermenü unten links → **Demo zurücksetzen**. Danach ist alles im Ausgangszustand, Rolle Admin.
- Browserfenster mindestens 1280 px breit, Zoom 100 %. Zweiten Tab mit dem Dashboard offen lassen.
- Optional: Handy mit derselben Adresse bereithalten (zeigt die mobile Ansicht).

## Ablauf

| Zeit | Seite | Klicken | Sagen |
|---|---|---|---|
| 0:00 | **Dashboard** | nichts | "Das ist die Startseite, die jeder morgens öffnet. Sie beantwortet: Wo steht jedes Projekt, was muss ich heute tun, liegt alles richtig?" |
| 0:45 | Dashboard · **Handlungsbedarf** | auf die oberste Zeile zeigen | "Ganz oben: Genehmigung seit 8 Wochen da, Rechnung über 10.000 € nie verschickt. Genau dieser Fall ist uns passiert. Die App merkt das von selbst." |
| 1:15 | Dashboard | Kachel **Nicht versendet** zeigen (führt zu Rechnungen, Reiter „Nicht versendet“), dann zurück | "Alle Kacheln sind klickbar. Rot heißt: Geld liegt herum." |
| 1:30 | **Projekt Reinhardt** | oberste Warnung anklicken | "Ein Klick, und ich bin im Projekt." |
| 1:45 | Projekt · **Prozess** | Schritte zeigen; beim nächsten Schritt aufs Datum klicken und ein Datum setzen | "Jeder Schritt mit Datum, wie in der Excel, aber man sieht sofort, was fehlt. Das Datum ändert man direkt hier." |
| 2:30 | Projekt · Banner | **Als versendet markieren** | "Rechnung verschickt, Warnung weg." |
| 2:45 | Projekt · **Dokumente** | Ordnerbaum aufklappen (08 Bauantrag); eine PDF vom Desktop auf **03 Wohnflächenberechnung** ziehen | "Das ist unsere Ordnervorlage, 1:1. Datei rein, Zähler geht hoch. CAD-Dateien bleiben auf dem Fileserver." |
| 3:30 | **Projektliste** | Tab Aktiv, Filter Firma, Suche "8161 103" | "Die Excel-Liste, nur filterbar. Suche versteht ABM-Nummern auch mit Leerzeichen." |
| 4:00 | **Pipeline** | eine Karte aus Anbahnung nach Planung ziehen → Dialog bestätigen | "Vier Stufen statt zwölf Spalten. Karte weiterziehen setzt den nächsten Schritt, mit Rückfrage." |
| 4:45 | **Aufgaben** | Filter Heute → Alle offenen; eine Aufgabe "aus Warnung" abhaken | "Aus jeder Warnung entsteht genau eine Aufgabe. Abhaken blendet die Warnung aus." |
| 5:30 | **Agent-Dashboard** | nichts | "Jetzt der Posteingang. Der Agent liest unsere Postfächer, nur lesen, nichts löschen, nichts senden, und sortiert Anhänge in die Projektordner." |
| 6:00 | Agent-Dashboard | **Jetzt prüfen** | "Zwölf neue Mails. Sechs liegen schon im richtigen Ordner, drei braucht er von uns." |
| 6:30 | Agent · Tabelle | Zeile **Baugenehmigung** aufklappen → **Im Projekt ansehen** | "Er sagt immer, warum: ABM-Nummer im Betreff, Wort Baugenehmigung. Datumsordner mit dem Eingangsdatum, wie bei uns üblich." |
| 7:15 | **Prüfliste** | Karte **Höhenaufnahme**: Regel merken = "Absender → dieser Ordner" → **Bestätigen** | "Wo er unsicher ist, entscheiden wir. Und er lernt: Diese Regel gilt ab jetzt." |
| 7:45 | Prüfliste | Karte **Wohnflächenberechnung Vogel** → **Ändern** → "vogel" suchen, Ulm wählen, Ordner suchen "wohnfläche" → **Hier ablegen** | "Zwei Projekte Vogel: Da rät er nicht, er fragt." |
| 8:15 | Prüfliste | auf den **Testfall: Manipulationsversuch** zeigen | "Diese Mail versucht, die KI auszutricksen. Die Antwort der KI wird immer gegen unsere Projekte und Ordner geprüft, deshalb läuft das ins Leere." |
| 8:45 | Agent-Dashboard | **Jetzt prüfen** (zweiter Lauf); Zeile Vermessung Donautal zeigen | "Die nächste Mail vom selben Vermesser landet jetzt automatisch richtig. Das war die Regel von eben." |
| 9:15 | **Postfächer** | Schwellenwerte und "Was der Agent darf" zeigen | "Ab 90 % legt er selbst ab, darunter fragt er. Die Schwelle stellen wir ein." |
| 9:40 | Benutzermenü | Rolle **Freiberufler** | "So sieht ein freier Mitarbeiter die App: nur seine Projekte, keine Rechnungen, keine Kontaktdaten der Bauherren." |
| 10:00 | | Rolle zurück auf Admin | Abschluss: "Das ist der klickbare Prototyp. Nächster Schritt: echte Datenbank in Frankfurt, dann mit IT der Testlauf mit einem Postfach." |

Optional, wenn nach Geld gefragt wird (1 Minute): **Rechnungen** öffnen. Oben steht, was fällig und nicht versendet ist
(rot), rechts die Verteilung nach Alter: Balken "über 30 Tage" anklicken → die Tabelle zeigt nur diese Rechnung(en).
Sagen: "Das Diagramm zeigt, was pro Monat verschickt und bezahlt wurde. Beträge und Auslöser sind hier erfunden,
die echten Regeln legen wir gemeinsam fest."

Gut zu wissen (Design v2):

- Oben rechts gibt es nur noch einen Hauptbutton **+ Neues Projekt** (öffnet direkt das Formular mit allen Feldern).
  Bei Bedarf kurz zeigen: Bauherr leer lassen → Meldung direkt am Feld; Firma wechseln → ABM-Nr. wird vorgeschlagen.
- **Neue Aufgabe** geht über die Aufgabenseite oder schnell per **Strg+K** → "Neue Aufgabe" (Strg+K zeigt Befehle und sucht Projekte).
- Rückmeldungen erscheinen unten rechts als kleine Karte mit Titel und Erklärung.

## Fragen, die kommen könnten

**Geschäftsführung**

- *Was kostet der Betrieb?* Supabase (Datenbank, Anmeldung, Speicher) ab ca. 25 $/Monat, KI-Aufrufe für die Zuordnung wenige Euro im Monat bei unserem Mailaufkommen. Hosting der Oberfläche kostenlos. (Genaue Zahlen nach dem Testlauf.)
- *Ersetzt das die Excel-Liste?* Ja. Die bestehende Liste (139 Projekte) wird einmalig importiert; der Importer bereinigt Stornos, Tippfehler in Daten und doppelte Nummern.
- *Was, wenn der Agent etwas falsch ablegt?* Er legt nur Kopien ab, die Mail bleibt im Postfach. Unsicheres kommt in die Prüfliste. "Falsch zugeordnet" verschiebt die Kopie; das zählt gegen die Trefferquote, die wir im Blick behalten.
- *Stimmen die Warnregeln?* Die Fristen (7/21/42/120 Tage) und die Phasen sind Vorschläge und stehen als Frage in `docs/offene-fragen.md`.
- *Wann können wir damit arbeiten?* Nach Schritt 8 (echte Datenbank, Anmeldung, Import) ist die Projektliste nutzbar; der Agent folgt nach dem Testlauf mit IT.

**IT**

- *Wo liegen die Daten?* Supabase in Frankfurt (EU). Auftragsverarbeitungsverträge mit Supabase, Microsoft und dem KI-Anbieter vor dem Echtbetrieb.
- *Wer sieht was?* Rechte stehen in der Datenbank (Row Level Security), nicht nur in der Oberfläche: Admin, Mitarbeiter, Freiberufler (nur zugewiesene Projekte, keine Rechnungen, keine Bauherren-Kontakte). Dafür gibt es automatische Tests.
- *Welche Rechte braucht der Agent in Microsoft 365?* App-Registrierung nur mit `Mail.Read`, per Application Access Policy auf bestimmte Postfächer beschränkt. Keine Rechte zum Senden, Verschieben oder Löschen. Geheimnisse liegen in Supabase Vault, nicht im Code.
- *Was geht an die KI?* Nur Betreff, Absender, Dateinamen und ein kurzer Textauszug (max. 500 Zeichen), dazu höchstens 20 Projektnummern mit Namen und Ort. Keine vollständigen Mails, keine Kontaktdaten. Das Modell hat keine Werkzeuge; seine Antwort wird gegen erlaubte Projekte und Ordner geprüft.
- *Und gegen Schadsoftware?* Ausführbare Dateien und Archive mit Passwort werden nie abgelegt. Die App öffnet keine Anhänge.
- *Was ist mit unseren CAD-Daten?* Die bleiben auf dem Fileserver. Die App verwaltet nur die Dokumentenebene (PDF, Office, Bilder, Mails).
- *Backup?* Supabase (Pro-Tarif) sichert täglich; zusätzlich ist ein Export geplant. Das Backup des Fileservers ist eine offene Frage an uns.
- *Läuft das ohne Internet / bei Ausfall?* Nein, es ist eine Web-App. Fällt sie aus, liegen die Originalmails weiter im Postfach und die CAD-Daten auf dem Fileserver.

## Wenn etwas schiefgeht

- Irgendetwas sieht seltsam aus → Benutzermenü → **Demo zurücksetzen** (alle Änderungen weg, Ausgangszustand).
- "Jetzt prüfen" bringt nichts mehr → nach drei Läufen sind die Demo-Mails aufgebraucht; zurücksetzen. Eine Mail liegt bewusst im pausierten Postfach "Projektleitung": Postfach einschalten und erneut prüfen.
- Seite neu laden setzt ebenfalls alles zurück (Demo-Daten liegen nur im Arbeitsspeicher des Browsers).
