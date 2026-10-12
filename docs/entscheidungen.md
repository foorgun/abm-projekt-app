# Entscheidungen

Wo `BUILD.md` offen oder widersprüchlich ist, steht hier die gewählte (einfachste vernünftige) Lösung.
Neueste Einträge unten.

## Schritt 0 – Setup

- **Fehlende Module aus `reuse/`:** `alerts.ts` importiert `./steps` und `./types`, die nicht mitgeliefert wurden.
  Beide sind in `src/lib/` neu geschrieben, passend zu den Tests in `alerts.test.ts`.
- **Schrittliste:** Die fünf Excel-Schritte stehen als `CORE_STEPS` in `src/lib/steps.ts` (gleich wie Migration 0001),
  weil die Warnregeln sie per Key referenzieren. Alle Anzeigen (Stepper, Pipeline, Fortschritt) lesen die Liste aus
  `step_definitions` über das Repo, nicht aus dem Code.
- **Logo:** `docs/abm-logo.png` wurde auf den Schriftzug zugeschnitten (`src/assets/abm-logo.png`). Der schwarze
  Hintergrund wird in der Seitenleiste per `mix-blend-mode: screen` unsichtbar, eine zweite Logodatei ist nicht nötig.
- **Screenshots:** `scripts/screenshots.mjs` nutzt `playwright-core` mit dem installierten Google Chrome
  (kein Browser-Download, kein CDN). Ausgabe in `screenshots/` (nicht im Repo).
- **`tools/test-db.sh`:** sucht Postgres zusätzlich unter `/usr/local/opt/postgresql*/bin` (Homebrew auf Intel-Macs).
- **CI:** `.github/workflows/ci.yml` mit drei Jobs (Web, Importer, Datenbank). Ohne GitHub-Remote noch nicht gelaufen.
- **`reuse/`** bleibt bis Schritt 8 liegen (siehe PROMPT.md), die Arbeitskopien liegen in `supabase/`, `tools/`, `src/lib/`.

## Schritt 1 – Design-System und Shell

- **Diagrammfarbe:** `--chart-1` ist `#25a294`, eine Stufe dunkler als `--accent` (`#2bb3a3`). Der Akzent lag knapp außerhalb
  des Helligkeitsbands für Diagrammflächen auf `--surface`. Zweite Serie (gestapelt, nur Agent-Diagramm) `--chart-2` `#8b7cf6`,
  geprüft auf Farbfehlsichtigkeit (ΔE 16) und Kontrast ≥ 3:1. Statusfarben (ok/warn/danger/info) werden nie als Serienfarbe genutzt.
- **Keine Verläufe:** Skeleton pulsiert über Deckkraft statt mit Schimmer-Verlauf, Select-Pfeil ist ein Icon.
- **Zusätzliche Tokens:** `--surface-3`, `--border-strong`, `--text-2`, `--faint`, `--focus`, `--overlay`, Radien, Abstände, Schriftgrößen.
  Hex-Werte stehen nur in `tokens.css`.
- **Tabs:** zwei Varianten derselben Komponente, `line` (Seitenbereiche) und `segmented` (Filter wie Heute/Woche).
- **Einklappen:** ab 1024 px klappt « die Seitenleiste auf Icons ein (gespeichert in `localStorage`, nur Komfort).
  Darunter ist sie ein Drawer über das Menü-Icon, Escape oder Klick daneben schließt ihn.
- **Benutzer im Demo-Modus:** "Mehmet Cetin", Standardrolle Admin (Vorgabe ABM, ersetzt das frühere "Jana Roth").
  Rolle über das Benutzermenü umschaltbar (Admin/Mitarbeiter/Freiberufler), damit die Freiberufler-Sicht vorführbar ist.
  Echter Schutz bleibt RLS (Schritt 8). Begrüßung nimmt den Vornamen aus dem Benutzer.
- **Kein Dark-Mode-Schalter** wie im Referenzbild: Dark ist fest, Light ist nur vorbereitet.
- **Diagramme:** eigene SVG-Komponenten (Säulen, gestapelt, horizontal, Linie), keine Diagrammbibliothek.
  Jede hat Tooltip und eine aufklappbare Tabellenansicht für Barrierefreiheit.
- **Dashboard in Schritt 1** zeigt den Ladezustand (Skeleton) in der Zielstruktur. Die vollständige Komposition mit Beispielwerten
  steht unter `#/styleguide`.

## Design-Korrekturen nach Rückmeldung zu Schritt 1

- Gruppentitel und KPI-Nebenzeilen heller (`--muted` bzw. `--text-2`, 12 px). `--faint` auf `#7a8394` angehoben (≥ 4,5:1 auf allen Flächen).
- Aktiver Menüpunkt: Teal-Balken links plus `--accent-soft` als Hintergrund.
- KPI-Kacheln: gleiche Höhe (Raster `auto 1fr auto`), Beschriftung einzeilig, kurze Labels ("Offene Rechnungen", "Zur Prüfung"), Wert 32 px (neues Token `--fs-32`; mobil 28 px).
- Säulendiagramm: Säulen max. 16 px, gedämpft in `--chart-1-muted` (`#33706b`, 3:1 gegen `--surface`), nur die hervorgehobene Periode
  (aktueller Monat) in `--chart-1` und mit fetter Achsenbeschriftung. Gitterlinien `--chart-grid` deutlicher, Achsenwerte 12 px in `--muted`.
- Karten: `--surface` `#161b23` (vorher `#14181f`), Rand `--border` `#29303c` (vorher `#242a35`). Diagrammfarben auf der neuen Fläche erneut geprüft.
- Begrüßung: bis 11 Uhr "Guten Morgen", 11 bis 17 Uhr "Guten Tag", ab 17 Uhr "Guten Abend" (Test in `src/lib/greeting.test.ts`).

## Schritt 2 – Datenschicht

- **Ordnervorlage aus einer Quelle:** `docs/ordnerstruktur.md` wird geparst (`src/lib/folders.ts`, 127 Ordner).
  Die App nutzt den Parser direkt, Migration 0002 enthält dieselben Zeilen, erzeugt mit `npm run gen:folders`.
  Ein Test schlägt fehl, wenn beides auseinanderläuft. Schlüsselwörter je Ordner stehen in `src/data/folderHints.ts`.
- **Pfade:** Trenner `/`, Datumsplatzhalter (alle Schreibweisen, auch "… am" ohne Datum) normalisiert zu `{datum}`.
  Beim Ablegen wird `{datum}` durch `TT.MM.JJJJ` ersetzt. `<Firma>`, `<Betreff>`, `<Nr>` bleiben als Text (nur von Hand befüllt).
- **"Phase"** = letzter erledigter Schritt in Reihenfolge, ohne Schritt "Eingang" (`src/lib/projects.ts`).
- **Reihenfolge der vorgeschlagenen Phasen** (sort_order, Excel-Schritte unverändert 10–50): Vermesser beauftragt 32,
  Entwurf freigegeben 34, Vorabzug versendet 36, Baufreigabe 60, Bauanlaufgespräch 70, Hausanschlüsse beantragt 80,
  Hausaufstellung 90. Admins können die Liste ändern (neue Policy `steps_def_admin`).
- **Zusätzliche Tabellen/Spalten**, die BUILD.md nicht ausdrücklich nennt, aber die Seiten brauchen:
  `projects.hausbau_nr` (Zuordnung von Mails), `project_parties` (Beteiligte laut Liste.docx; Firmen, daher für zugewiesene
  Freiberufler lesbar), `activities` (unveränderliches Protokoll), `agent_settings` (eine Zeile mit den Schwellen, nur Admin ändert),
  `agent_feedback` (Lernbeispiele), `inbox_attachments.corrected` (für die Trefferquote), `documents.mime`.
- **Aufgaben-Zuweisung** zeigt auf `team_members`, nicht auf Benutzerkonten (so funktionieren auch Personen ohne Login).
- **Schutz in der Datenbank:** `secret_ref` darf keine Passwörter enthalten, `body_excerpt` max. 2000 Zeichen,
  `message_id` eindeutig, Regeln nur auf Vorlagenordner, Ordnerpfade ohne `..`, Aufgaben-`source_key` eindeutig.
- **Demo-Daten** (`src/data/demoData.ts`): 44 erfundene Projekte, deterministisch per Seed und **relativ zu heute** erzeugt,
  damit Warnungen an jedem Tag gleich aussehen (der 10.000-€-Fall ist immer 42 Tage überfällig). Firmennamen
  (Bien-Zenker, Living Haus, Schwabenhaus) wie in `reuse/supabase/seed.sql`. Alle Mailadressen auf `example`-Domains.
- **demoRepo bildet RLS nach:** Freiberufler sehen im Demo-Modus nur Projekte von Planer "S. Kohler", keine Rechnungen,
  keine Bauherren-Kontakte, keine Aufgaben, keinen Agenten. Änderungen ohne Berechtigung werfen `PermissionError`.
  Navigationseinträge Rechnungen, Aufgaben und Agent sind für Freiberufler ausgeblendet.
- **Demo-Daten leben im Speicher:** Neuladen der Seite setzt alles zurück (bewusst, für Vorführungen).
- **supabaseRepo** ist bis Schritt 8 ein Platzhalter, der mit klarer Meldung fehlschlägt, statt still Demo-Daten zu zeigen.
- **Lokales Postgres:** Homebrew konnte `postgresql@16` auf diesem Mac nicht installieren (Intel-Homebrew unter Rosetta auf
  Apple Silicon, Command Line Tools zu alt; Update bräuchte `sudo`). Die Datenbanktests liefen stattdessen gegen
  Postgres 16.14 aus dem npm-Paket `@embedded-postgres/darwin-arm64` mit einem kleinen psql-Ersatz, beides nur temporär
  außerhalb des Repos. In der CI läuft das echte `psql`. `tools/test-db.sh` ist unverändert nutzbar (`PG_BIN=…`).

## Schritt 3 – Dashboard

- **Reihenfolge:** KPI-Kacheln, dann "Handlungsbedarf" in voller Breite (wichtigste Karte, daher vor den Diagrammen),
  dann die zwei Diagramme, dann "Letzte Aktivitäten". Handlungsbedarf zeigt 6 Warnungen, der Rest per "Alle anzeigen".
- **Direktaktion:** Rechnungswarnungen haben "Als versendet markieren" (setzt Versanddatum heute). Alle Zeilen führen zum Projekt.
- **Kein Trend-Badge bei "Aktive Projekte":** Ein Monatsvergleich am Monatsanfang ist irreführend (z. B. −12 am 9. Oktober).
  Stattdessen Fußzeile "x neu im Oktober, y im Vormonat".
- **"Neue Projekte pro Monat"** zählt nach Eingangsmonat inklusive Storno (es war ein Eingang). Aktueller Monat hervorgehoben.
- **"Projekte nach Phase"** nur aktive Projekte, Phasen ohne Projekt entfallen.
- **Freiberufler** sehen nur "Aktive Projekte" und "Warnungen" als Kacheln, keine Aktivitäten (RLS: nur Mitarbeiter).
- **Glocke:** aufklappbar mit den fünf dringendsten Warnungen und Link zum Dashboard.
- **Rückmeldungen** nach Aktionen als kurzer Hinweis unten (Toast, per aria-live vorgelesen); Fehler wie "Keine Berechtigung" ebenso.
- **Demo-Daten:** Zufallsprojekte werden jetzt vorwärts erzeugt (Eingang gleichmäßig über 12 Monate, Schritte bis heute),
  dadurch realistische Monatsverteilung und keine ungeplanten Warnungen. Die gesetzten Fälle bleiben unverändert.

## Rückmeldung zu Schritt 3

- Demo-Namen "Beispiel", "Muster", "Probst", "Storno-Beispiel" ersetzt durch Reinhardt (der 10.000-€-Fall), Engelhardt, Scholz, Fuchs
  (in `demoData.ts` und `supabase/seed.sql`).
- KPI-Kacheln: Der Link deckt per `::after` die ganze Kachel ab, der Info-Button liegt darüber. So steckt kein Button in einem Link
  (gültiges HTML, sauber per Tastatur).
- Sidebar-Badges haben Titel und Screenreader-Text ("heute fällig und überfällig", "offene Prüfungen").
- Seitenleiste im echten Browserfenster geprüft (1280×860, 1440×1000, 1280×600): bleibt beim Scrollen bei top 0, volle Fensterhöhe.
- Werte über den Säulen in "Neue Projekte pro Monat" (`showValues`).

## Schritt 4 – Projekte und Pipeline

- **Tabs sind Routen** (`/projekte`, `/projekte/aktiv`, `/projekte/abgeschlossen`), Wechsel ohne Neuladen. **Filter stehen in der URL**
  (`?q=…&firma=…&architekt=…&phase=…&sort=…&gruppe=monat&storno=1`) und bleiben beim Tabwechsel erhalten; Links sind teilbar.
- **Spalten zusammengelegt**, damit die Tabelle bei 1280 px ohne seitliches Scrollen passt: "Bauherr · Ort" (Ort als zweite Zeile),
  eigene Status-Spalte entfällt. Aktive Projekte zeigen ihre Phase, abgeschlossene und stornierte ihren Status an derselben Stelle.
  "Architekt" heißt im Kopf "Arch." (mit Titel). Inhaltsbereich hat 24 statt 32 px Seitenrand.
- **"Nächste Aufgabe"**: früheste offene Aufgabe des Projekts, überfällige in Rot. Ohne Aufgabe steht der nächste offene Schritt (grau).
- **Suche** (Liste, Pipeline, Kopfzeile): UND-Verknüpfung der Wörter, Umlaute vereinheitlicht, Nummern ohne Leerzeichen/Bindestriche
  verglichen ("8161 101" findet "8161-101"). Kopfzeile: bis 6 Treffer mit Pfeiltasten, Enter öffnet die gefilterte Liste.
- **Stornierte** nur im Tab "Alle" per Häkchen einblendbar.
- **Gruppierung nach Eingangsmonat** sortiert die Gruppen neueste zuerst, innerhalb bleibt die gewählte Sortierung.
- **Pipeline:** Spalten = "Eingang" + jeder Schritt aus `step_definitions`, nur aktive Projekte. Verschieben nur in die direkt nächste
  Spalte (sonst erklärender Hinweis), mit Bestätigungsdialog und Datum (Standard heute, nicht in der Zukunft).
  Zusätzlich je Karte ein Button "→ nächste Phase" für Tastatur und Touch (Drag-and-Drop funktioniert auf Touch-Geräten nicht).
  Freiberufler können nicht verschieben.
- **Neues Projekt:** ein Dialog für Kopfzeile und leere Zustände. ABM-Nr. wird aus Firmenpräfix + höchster Nummer + 1 vorgeschlagen.
  Nach dem Anlegen öffnet sich das Projekt.
- **Warn-Icon** in Tabellen und Karten mit nativem Titel statt eigener Blase (Tabellen scrollen in einem Container, der Blasen abschneiden würde).

## Schritt 5 – Projektdetail

- **Aufbau:** Brotkrumen, Kopf (Bauherr, Status, ABM-Nr., Hausbau-Nr., Ort, Firma, Architekt; Aktionen "Aufgabe anlegen" und "Status"),
  Prozess-Stepper, Warnbanner des Projekts, Tabs Übersicht · Dokumente · Aufgaben · Rechnungen · Aktivität. Der Tab steht in der URL
  (`?tab=dokumente`), damit Links direkt auf einen Bereich zeigen können.
- **Stepper:** alle Schritte aus `step_definitions`, bei 1280 px ohne Scrollen (Beschriftung mit deutscher Silbentrennung), auf Mobil
  vertikal. Datum per Klick bearbeiten, leeres Datum setzt den Schritt zurück. "Fehlt" = offen, obwohl ein späterer Schritt erledigt ist
  (gestrichelt, orange, plus Hinweis im Kartenkopf). Schnellaktion "<nächster Schritt> heute erledigt".
- **Übersicht:** "Projektbeteiligte" mit den Feldern aus Liste.docx; Bauadresse und Kontakt Bauherr nur für Mitarbeiter (sonst Schloss-Hinweis).
- **Ordnerbaum** (`src/lib/folderTree.ts`): Vorlage plus konkrete Datumsordner aus den Dokumenten. Datumsordner der Vorlage erscheinen als
  Sammelknoten "… erhalten am …" mit den echten Datumsordnern darunter (neuestes oben); Vorlagen-Unterordner wiederholen sich unter jedem
  Datumsordner. Zähler zeigt Dateien inkl. Unterordner (Titel zeigt "x hier, y mit Unterordnern"). Leere Ordner gedimmt, optional ausblendbar.
- **Upload:** Drag-and-Drop auf jeden Ordner im Baum, in die Ablagefläche rechts oder per Button; mehrere Dateien auf einmal.
  Ablage auf einem Datums-Sammelknoten fragt nach dem Datum (Standard heute) und legt den Datumsordner an.
  Abgelehnt mit Meldung: CAD (.dwg, .pln, …), ausführbare Dateien, > 50 MB, Pfade außerhalb der Vorlage, Pfad ohne Datum.
  Die Regel liegt in `src/lib/files.ts` und gilt später auch für den Agenten.
- **Herkunft** je Datei als Pill "Agent" bzw. "Upload". Vorschau/Download folgen mit Supabase Storage (Schritt 8); im Demo-Modus
  werden nur Metadaten gespeichert.
- **Status ändern** (Aktiv/Abgeschlossen/Storno) über das Menü "Status", protokolliert in Aktivitäten (neue Repo-Methode `setProjectStatus`).
- **Rechnungen-Tab** mit Summen (gesamt, offen, bezahlt) und "Als versendet markieren"; eine geplante Rechnung, deren Auslöser erreicht ist,
  heißt "Jetzt fällig".
- **Freiberufler** sehen nur Übersicht und Dokumente, keine Aktionen, Stepper nur lesend, dürfen aber hochladen.
  Nicht freigegebene Projekte erscheinen als "nicht gefunden" (verrät nicht, dass es sie gibt).

## Rückmeldung zu Schritt 5

- **Stufen (Migration 0003):** `step_definitions.stage` fasst die 12 Schritte zu 4 Stufen zusammen:
  Anbahnung (Plangespräch, Vertrag versendet, Vertrag zurück) · Planung (Vermesser, Entwurf, Vorabzug) ·
  Genehmigung (Übergabe Baugesuch, Genehmigung, Baufreigabe) · Baubegleitung (Bauanlaufgespräch, Anschlüsse, Hausaufstellung).
  **Stufe eines Projekts = Stufe des Schritts, der nach der aktuellen Phase ansteht** (dort wird gearbeitet); ein Projekt mit
  "Vertrag zurück" steht also in "Planung". Ohne Schritt: erste Stufe, alles erledigt: letzte Stufe.
- **Verschieben in die nächste Stufe** setzt deren ersten offenen Schritt. Liegen davor noch offene Schritte, nennt der Dialog sie
  ("erscheinen danach als fehlt") und bietet an, sie mit demselben Datum zu erledigen (standardmäßig aus).
- **Kurze Schrittnamen (0003):** Vertrag versendet, Vertrag zurück, Genehmigung, Anschlüsse beantragt. Keys bleiben gleich.
  Die Warnung heißt passend "Vertrag noch nicht zurück".
- **Stepper ohne Silbentrennung:** Schritte sind mindestens so breit wie ihr längstes Wort, Restplatz gleich verteilt; Datum kurz
  (TT.MM.JJ, volles Datum im Tooltip). Passt bei 1280 px genau. Zwischen 1024 und 1280 px scrollt der Stepper seitlich,
  statt Wörter zu trennen. Mobil weiter vertikal mit vollem Datum.
- **Ordnerbaum ohne Platzhalter-Ebene:** Datumsordner hängen direkt am Elternordner. Der Elternordner hat ein "Datumsfach";
  Ablage dort fragt: neuer Datumsordner (Standard, mit Datum) oder direkt in den Ordner. Volle Namen per Tooltip.
- **Projektliste:** "Nächste Aufgabe" breiter, Titel bis zu zwei Zeilen, vollständig im Tooltip. Letzte Spalte heißt "Warnung".
  Platz dafür: Bauvoranfragen zeigen "BVA" (Tooltip), Spalte "Fortschritt" heißt "Schritte".
- **Demo-Aufgaben passen zur Phase** (`TASK_TEMPLATES` mit Bedingung je Aufgabe, per Test geprüft): z. B. Behördenrückfrage nur
  zwischen Übergabe Baugesuch und Genehmigung, Bauanlaufgespräch erst nach Baufreigabe.

## Schritt 6 – Aufgaben

- **Aufgaben aus Warnungen** (`src/lib/taskSync.ts`): genau eine Aufgabe je Warnung, `source_key` = Warnungs-ID + Dringlichkeit.
  Titel je Art ("Rechnung versenden: …", "Vertrag bei der Bauherrschaft nachfassen", "Beim Amt den Stand der Genehmigung erfragen"),
  fällig heute (dringend), in 3 Tagen (Hinweis) bzw. 7 Tagen (Info), zugewiesen an den Architekten des Projekts.
- **"Erledigen blendet die Warnung aus, solange die Ursache fehlt"** ist so umgesetzt: Eine erledigte Warnungsaufgabe blendet die Warnung
  in Handlungsbedarf, Glocke, Bannern und Warn-Icons aus. Verschärft sich die Warnung (Hinweis → Dringend), erscheint sie wieder mit
  neuer Aufgabe. Ist die Ursache behoben (z. B. Rechnung versendet), wird die offene Aufgabe automatisch erledigt.
  **Ausnahme Geld:** Die Summe "Offene Rechnungen" auf Dashboard und Rechnungsseite zählt weiter alle nicht versendeten Rechnungen,
  damit Abhaken kein offenes Geld unsichtbar macht.
- **Wo der Abgleich läuft:** im Demo-Modus nach jedem Laden im Store (nur Mitarbeiter). Im Supabase-Modus soll dieselbe Logik
  serverseitig laufen (Datenbankfunktion oder Cron, Schritt 8), damit Aufgaben auch ohne geöffnete App entstehen.
- **Filter:** Heute · Diese Woche (heute bis Sonntag) · Überfällig · Alle offenen (gruppiert: Überfällig, Heute, Diese Woche, Später,
  Ohne Termin) · Erledigt; dazu Person (auch "Niemand zugewiesen") und Projekt. Alles in der URL.
- **In der Zeile:** abhaken, Fälligkeit ändern (Klick aufs Datum), Person zuweisen. Neue Aufgabe über Kopfzeile ("Neue Aufgabe" im
  Dropdown), die Seite oder den Projekt-Tab.
- **Demo-Aufgabe "Vertrag nachfassen"** entfernt, sie entsteht jetzt automatisch aus der Warnung (sonst doppelt).
- **Rechnungen-Seite** (BUILD.md Abschnitt 5, bisher Platzhalter) mitgebaut: Summen oben (jetzt fällig, geplant, versendet, bezahlt),
  Tabs Nicht versendet · Versendet · Bezahlt · Alle, "Als versendet markieren". Jetzt fällige zuerst.

## Schritt 7 – Posteingangs-Agent (Demo)

- **`src/agent/classify.ts`** ist eine reine Funktion (Mail + Kontext → Entscheidung je Anhang), gedacht für Browser-Demo und Edge Function.
  Reihenfolge wie BUILD.md: Dublette → Filter → Projekt → Ordner → Sicherheit = min(Projekt, Ordner) → Schwellen.
- **Sicherheitswerte je Erkennungsweg** (Konstanten `CONFIDENCE`, Annahmen, nach dem Echttest in Schritt 9 zu justieren):
  ABM-Nr. 98 %, Hausbau-Nr. 97 %, Regel Absender → Projekt 95 %, bekannter Absender mit genau einem Projekt 90 %,
  Nachname + Ort/Straße 85 % (also standardmäßig Prüfliste mit Vorschlag), Regel Absender → Ordner 95 %,
  Schlüsselwort im Betreff/Dateinamen 93 %, nur im Text 80 %, mehrere Ordner gleich gut 60 %, Ordner nur nach Absenderart 70 %.
- **KI:** nur wenn deterministisch kein Projekt eindeutig ist (bzw. für den Ordner, wenn Regel/Schlüsselwort unsicher sind).
  Anfrage enthält Betreff, Absender, Dateinamen, max. 500 Zeichen Textauszug, max. 20 vorselektierte Projekte (ohne Kontaktdaten) und
  die erlaubten Ordnerpfade. Antwort wird strikt geprüft (nur Kandidaten-IDs, nur Vorlagenpfade, sonst verworfen und begründet).
  **KI-Sicherheit ist auf 80 % gedeckelt, ein KI-Vorschlag allein legt also nie automatisch ab.** Regeln überstimmen die KI.
  Im Demo-Modus ersetzt `demoAi` das Modell; es "fällt" absichtlich auf eine Prompt-Injection herein, die Prüfung verwirft das.
- **Filter:** Ignorier-Liste (Adresse oder @domain), Newsletter (List-Unsubscribe-Kopf oder typische Absender + "abmelden"),
  Mails ohne Anhang → ignoriert. Bilder < 15 KB gelten als Signaturbild. Ausführbare Dateien und Archive mit Passwort → "Fehler"
  (nie abgelegt, in der Prüfliste unter "Nicht abgelegt", nur "Als erledigt markieren"). CAD-Dateien → ignoriert (bleiben auf dem Fileserver).
- **Mails ohne Anhang** werden im Prototyp ignoriert. Textmails mit Projektbezug (z. B. Rückfragen vom Amt) könnten später als Aufgabe
  in die Prüfliste kommen; offene Frage an ABM.
- **Datumsordner** werden mit dem Maildatum benannt (nicht mit dem Ablagedatum).
- **Demo-Postfächer** (`src/agent/demoMailSource.ts`): 25 erfundene Mails in 3 Lieferungen, je "Jetzt prüfen" eine Lieferung,
  passend zur Phase der Projekte. Enthalten: Behördenpost, Vermesser, Strom, Newsletter, Bauherr mit zwei Projekten ("Vogel"),
  ausführbare Datei, CAD, Dublette, Prompt-Injection, Signaturbilder und eine Mail im pausierten Postfach "Projektleitung",
  die erst nach dem Fortsetzen gelesen wird. Lieferung 2 enthält eine Folgemail des Vermessers, an der man sieht, dass
  "Regel merken" wirkt (mit Regel: abgelegt, ohne: Prüfliste).
- **Prüfliste:** Bestätigen · Ändern (Projektsuche + Ordnerbaum aus der Vorlage, Datumsordner mit Maildatum vorbelegt) · Ignorieren,
  "Regel merken" (Absender → Projekt, → Ordner, immer ignorieren), "Als Aufgabe" (Quelle Agent). Jede Entscheidung → `agent_feedback`.
- **Trefferquote (7 Tage)** = automatisch abgelegte Anhänge ohne spätere Korrektur / alle automatisch abgelegten. "Falsch zugeordnet"
  im Agent-Dashboard schickt einen abgelegten Anhang zurück in die Prüfliste; die Korrektur **verschiebt die vorhandene Kopie**
  (keine zweite Kopie). Von Hand bestätigte Zuordnungen zählen nicht als automatisch.
- **Neue Postfächer** starten pausiert; Zugangsdaten werden nie in der App eingegeben (Supabase Vault, Schritt 9).
  Schwellen ändern nur Admins (wie RLS in 0002).
- **Store-Abgleich der Warnungsaufgaben** legt Aufgaben jetzt parallel an (vorher nacheinander, erster Start dauerte ~1 s länger).
- **Screenshot-Skript** wartet, bis keine Lade-Platzhalter mehr sichtbar sind, statt einer festen Zeit.

## Vor der Vorführung

- **Toast** unten rechts (Mobil: unten über die volle Breite), verdeckt keine Inhalte mehr.
- **Manipulationsversuch** erkennbar daran, dass die Prüfung einen KI-Vorschlag verworfen hat (`isRejectedAi`). Solche Karten stehen
  am Ende der Prüfliste. Hinweis im Demo-Modus "Testfall: Manipulationsversuch (wurde abgefangen)", im Echtbetrieb neutral
  "KI-Vorschlag verworfen: Mail mit Vorsicht prüfen". Karten ohne Vorschlag zeigen keine Prozentzahl.
- **Tooltips in Tabellen** (`CellTip`): per Portal am Fenster positioniert (wird vom scrollenden Tabellencontainer nicht abgeschnitten),
  erscheint sofort bei Hover und Tastaturfokus. Der native Browser-Titel kam erst nach ca. 1 s und nie per Tastatur.
- **Demo-Historie:** jeder Werktag der letzten 7 Tage 3 bis 8 Anhänge (rund 80 % automatisch), Wochenende leer; offene Prüfungen
  liegen auf dem letzten Werktag. Per Test für Freitag, Samstag, Montag und Mittwoch geprüft. Live-Läufe ("Jetzt prüfen") kommen obendrauf.
- **Fälligkeit** als "heute", "morgen", sonst "TT.MM."; Termine außerhalb des laufenden Jahres als "TT.MM.JJ" (sonst nicht eindeutig).
  Überfällig: rot, plus "überfällig" für Screenreader und im Tooltip.
- **Demo zurücksetzen** im Benutzermenü, nur im Demo-Modus (`Repo.resetDemo` ist optional, `supabaseRepo` hat es nicht), mit Rückfrage.
  Setzt Daten, Agent-Postfächer und Rolle (Admin) zurück. Unten links steht im Demo-Modus "Demo-Daten".

## Design v2, Etappe A

Stilbeschreibung in `docs/design-v2.md` (die Vorbilder liegen nicht im Repo).

- **Tokens:** neutral und fast schwarz (`#0a0a0b`, Flächen `#111113`/`#141416`/`#1c1c1f`, Rand `#262629`, Text `#f4f4f5`, gedämpft `#8e8e96`).
  Leiser Text `#7e7e86` statt eines dunkleren Grautons, damit er überall 4,5:1 erreicht. Radien 14/10/8 px, keine Schatten.
- **Keine Teal-Flächen:** `--accent-soft` ist jetzt neutral, `--accent-text` hell. Teal bleibt für Diagramme, den Balken am aktiven
  Menüpunkt, Tab-Unterstrich, Prozessschritte/Fortschritt und den Fokusring. Links sind hell. Häkchen und Schieberegler hell wie der Schalter.
- **Button-Familie:** `primary` (hell), `secondary`, `outline` (Standard), `ghost`, `destructive`, Größen sm/md/lg, `iconRight` für den Pfeil.
  Die alten Varianten `default`/`danger` gibt es nicht mehr. **Destructive ist `#cf3f3f`**, dunkler als das Status-Rot: weiße Schrift auf dem
  helleren Koralle der Vorlage erreicht nur 3:1. "Falsch zugeordnet" ist `outline`, weil nichts gelöscht wird.
- **Kennzahl-Kacheln:** Icon-Kachel neutral, Statusfarbe nur am Icon. Status-Pill "Aktiv" neutral mit Teal-Punkt. Badge "Aufgaben" hell.
- **Toast:** Titel + optionale Beschreibung (`toast(titel, ton, beschreibung)`), unten rechts.
- **Einstellungskarten** (`SettingRow`): Postfächer als einzelne Karten; Schwellenwerte, Regeln und Ignorier-Liste als Karten, deren
  Button den Editor aufklappt. Postfach-Liste im Agent-Dashboard im selben Stil.
- **Kopfzeile:** Glocke als Ghost-Icon-Button mit kleinem Zähler, ein primärer Button "+ Neues Projekt". Der geteilte Button entfällt.
  "Neue Aufgabe" und "Neues Projekt" stehen als Befehle in der Strg+K-Suche (ohne Eingabe sofort sichtbar).
- **Formular "Neues Projekt"** war unvollständig und ist neu: Art, Bauherr, Hausbaufirma, Verkäufer (nach Firma gefiltert), ABM-Nr. (optional,
  Vorschlag = nächste freie Nummer der Firma), Hausbau-Nr., Bauort, Eingangsmonat (Standard aktueller Monat, nicht in der Zukunft), Architekt,
  Planer, Häkchen "Projektordner aus der Vorlage anlegen". Regeln in `src/lib/projectForm.ts` (auch im Repo geprüft): Bauherr Pflicht ohne Ziffern,
  Bauort Pflicht, Firma Pflicht bei Neubau, ABM-Nr. im Format `8161-123` und nicht doppelt (Storno ausgenommen), Hausbau-Nr. im Format `HB-26118`.
  Fehlermeldungen stehen am Feld, der Fokus springt ins erste fehlerhafte Feld.
- **"Projektordner anlegen":** Der Ordnerbaum kommt in der App immer aus der Vorlage. Das Häkchen steuert, ob die Ordner im Speicher
  angelegt werden (Schritt 8); im Demo-Modus wird es nur als Aktivität protokolliert.
- **AreaChart** (`src/components/charts/AreaChart.tsx`): monotone Interpolation nach Fritsch-Carlson (per Test: kein Überschwingen, nie unter 0),
  Verlauf Teal → transparent, Leuchten per `drop-shadow`, Punkte mit Ring, zweite Serie hell/neutral, Tooltip, Tabellenansicht,
  Animation nur bei `prefers-reduced-motion: no-preference`. `TrendPill` zeigt die Veränderung gegenüber der Vorperiode, neutral ohne
  Wertung über Farbe. Der Verlauf unter der Linie ist die eine bewusste Ausnahme von "keine Verläufe" aus BUILD.md.
  Zählwerte (Dashboard) bleiben Säulen. Bisher nur im Styleguide zu sehen, Einsatz in Etappe B (Rechnungen).
- **Aktivitäten:** automatisch aus Warnungen erzeugte Aufgaben werden nicht mehr als Aktivität protokolliert (sie verdrängten echte Ereignisse).
- **Stepper:** 2 px Innenabstand je Schritt; geprüft an allen 46 Demo-Projekten bei 1280 px (vorher nur an einem gemessen, das war zu wenig).

## Design v2, Etappe B – Rechnungen mit Charts

- **Begriff "nicht versendet"** = fällig und noch nicht versendet (es gibt dazu eine Warnung). Geplante Rechnungen, deren Auslöser noch
  nicht erreicht ist, zählen nicht mit und stehen nur im Reiter "Alle". Reiter: Alle (Standard) · Nicht versendet · Versendet · Bezahlt.
- **Kennzahlen** (`src/lib/invoiceStats.ts`): Nicht versendet (Summe + Anzahl, rot) · Versendet und offen · Bezahlt in den letzten 30 Tagen ·
  Durchschnitt Tage von Fälligkeit bis Versand über 12 Monate. **Vor der Fälligkeit versendete Rechnungen zählen als 0 Tage**, nicht negativ.
- **Rechnungsvolumen pro Monat** (`InvoiceVolumeCard`): AreaChart, versendet (Teal) nach Versandmonat, bezahlt (hell) nach Zahlungsmonat.
  **Trend-Pill vergleicht den letzten vollständigen Monat mit dem davor** (z. B. "September ggü. August"), weil der laufende Monat
  unvollständig ist und fast immer einen Einbruch zeigen würde. Die Karte steht auch auf dem Dashboard, als zusätzliche Karte in voller
  Breite unter den zwei Diagrammen (nur Mitarbeiter); keine bestehende Kachel wurde ersetzt.
- **Farben der zwei Serien:** Teal + helles Neutralgrau. Geprüft: unterscheidbar bei Farbfehlsichtigkeit und normalem Sehen, Kontrast zur
  Fläche ≥ 3:1. Die Prüfung meldet für das Grau "liest sich grau": gewollt (Vorgabe "hell/neutral"), dazu Legende und Tooltip.
- **Nicht versendet nach Alter:** Säulen mit Summe in Euro für 0–7, 8–30 und über 30 Tage seit Fälligkeit (Anzahl im Tooltip und in der
  Tabellenansicht). Klick oder Enter auf eine Säule wechselt zum Reiter "Nicht versendet" und filtert; erneuter Klick oder das ✕ am
  Filter-Chip hebt den Filter auf. `BarChart` hat dafür `onSelect`/`selected` (Säulen sind per Tastatur erreichbar).
- **Tabelle:** nicht versendete zuerst (älteste oben), Status-Pill "42 Tage fällig" (rot ab 8 Tagen, darunter orange),
  25 Zeilen, weitere per "Weitere anzeigen" (neue Option `pageSize` der Tabelle).
- **Demo-Daten:** 14 ältere, abgeschlossene Projekte (Eingang vor 13 bis 24 Monaten) ergänzt, damit die 12-Monats-Verläufe nicht bei null
  beginnen; insgesamt 150 erfundene Rechnungen. **Annahmen:** fällig 7 Tage nach dem auslösenden Schritt, Versand −4 bis +9 Tage um die
  Fälligkeit, Zahlung 8 bis 28 Tage nach Versand; Beträge 1.800 bis 12.000 €. Zwei weitere fällige, nicht versendete Rechnungen
  (5 und 18 Tage) für die Altersverteilung; der 10.000-€-Fall bleibt die oberste Warnung. Der Seitenkopf sagt, dass Beträge und Auslöser Annahmen sind.
- **Demo-Uhrzeiten:** alle erfundenen Einträge von heute liegen vor 8 Uhr (per Test), damit nichts "in der Zukunft" erscheint.

### Korrekturen zu Etappe B

- **Sprachregel:** "offen" heißt bei Rechnungen nur noch "versendet, aber nicht bezahlt". Fällige, nicht versendete Rechnungen heißen
  "nicht versendet". Die Dashboard-Kachel heißt deshalb "Nicht versendet" (vorher "Offene Rechnungen", so auch in älteren Einträgen oben),
  Untertitel "5 fällige Rechnungen", Klick führt auf `/rechnungen?reiter=nicht-versendet`. Im Projekt-Tab stehen die Summen als
  "Noch nicht versendet" und "Versendet, offen".
- **Reiter und Altersfilter der Rechnungsseite stehen in der URL** (`?reiter=…&alter=…`), damit Kacheln und Links direkt dorthin führen.
- **Laufender Monat im AreaChart** (`partialLast`): letzter Abschnitt gestrichelt, Punkt hohl, Beschriftung gedämpft/kursiv, die gefüllte
  Fläche endet beim letzten vollständigen Monat; Tooltip und Tabelle nennen "laufender Monat, unvollständig". Die Tangenten der Linie werden
  über alle Punkte berechnet und erst danach geteilt, damit die Form gleich bleibt. Die Linie war schon monoton (Fritsch-Carlson, per Test).
- **Unter 640 px** zeigt die Rechnungsseite eine Kartenliste statt der Tabelle (Projekt, Betrag, Rechnung, Status, Datum, Aktion), 15 je Schritt.
- **Reiterleisten** (alle, `Tabs`): scrollen waagerecht und blenden am Rand aus, solange dort noch Reiter folgen; der gewählte Reiter rückt ins Bild.
- **Fälligkeitsdatum:** fällige Rechnungen ohne eingetragenes Datum (fällig durch den erreichten Schritt) zeigen das Datum, seit dem sie fällig sind.
  Button "Als versendet" mit Tooltip "Als versendet markieren" und vollständigem Aria-Label (auch im Projekt-Tab).

## Design v2, Etappe C – Seite Dokumente

- **Neue Repo-Methode `listDocuments(filter)`**: liefert Zeilen (Datei, Projekt-Kurzangaben, Mailangaben), Gesamtzahl und Kennzahlen.
  Filtern und Blättern passieren im Repo, nicht in der Oberfläche; die reine Logik liegt in `src/lib/documentFilters.ts` (getestet) und wird
  vom `demoRepo` benutzt. Im `supabaseRepo` ist die Methode wie alle anderen noch ein Platzhalter (Schritt 8).
- **Filter stehen in der URL** (`?q=…&projekt=…&ordner=08&quelle=agent&typ=pdf&zeitraum=7`), damit sich eine Ansicht verlinken lässt und
  „Zurück“ funktioniert. Alle Filter sind kombinierbar. Die Suche findet Dateiname, Projekt (ABM-Nr., Bauherr, Ort) und Absender der Mail.
- **Kennzahlen:** „Diese Woche abgelegt“ zählt seit Montag (nicht die letzten 7 Tage), „Davon vom Agenten“ bezieht sich auf diese Woche.
  Die Kennzahlen gelten für alle sichtbaren Dateien und ändern sich nicht mit den Filtern. „Zur Prüfung“ führt in die Prüfliste.
- **Hauptordner als Chips 01–11** aus der Ordnervorlage, einer wählbar, erneuter Klick hebt die Auswahl auf.
- **Seitenpanel (`Drawer`)** statt eigener Detailseite: Metadaten, bei Agent-Dateien Betreff, Absender, Sicherheit und Begründung.
  „Im Ordner anzeigen“ öffnet das Projekt mit vorgewähltem Ordner (`/projekte/:id?tab=dokumente&ordner=<pfad>`).
  Ältere Demo-Dateien des Agenten haben keine gespeicherte Mail; das Panel sagt das dann.
- **Kein Download und keine Vorschau im Demo-Modus:** die Demo speichert nur Angaben zur Datei, keine Inhalte. Das Panel erklärt das.
- **Hochladen:** Dialog mit Projekt, Zielordner (derselbe `FolderPicker` wie in der Prüfliste), bei Datumsordnern ein Datum, mehrere Dateien.
  CAD- und Programmdateien werden in der Liste durchgestrichen und nicht abgelegt (gleiche Prüfung wie im Projekt, `files.ts`).
- **Freiberufler:** Menüpunkt sichtbar, aber nur Dateien zugewiesener Projekte, keine Kachel „Zur Prüfung“ und keine Mailangaben
  (Posteingang ist Mitarbeitern vorbehalten). Das `demoRepo` bildet das wie die RLS-Regeln nach. Für Schritt 8 heißt das:
  keine neue Tabelle nötig, die bestehenden Policies auf `documents` und den Posteingangstabellen müssen genau das leisten (RLS-Test ergänzen).
- **Unter 640 px** Kartenliste statt Tabelle, 40 je Schritt („Weitere anzeigen“).
- Zeitraum ohne Einschränkung heißt „Jederzeit“ (nicht „Alle“), damit er sich vom Quelle-Schalter „Alle“ unterscheidet.

## Schritt 8 – Supabase, Punkte 1 bis 3 (Datenanbindung, Rechte, Anmeldung)

- **Anmeldung mit E-Mail und Passwort**, nicht Magic Link. Gründe: kein Mailversand nötig (der eingebaute Versand im Free-Tarif
  ist stark begrenzt), keine Weiterleitungsadressen, kein Konflikt mit dem HashRouter. Kein "Passwort vergessen" in der App;
  Konten und Passwörter verwaltet der Admin (Dashboard, später Skript). Keine Registrierung in der Oberfläche.
- **Anzeigename bei der Rolle** (`user_roles.full_name`, Migration 0005) statt einer eigenen Profiltabelle: ein Datensatz je Benutzer.
  Ein Konto ohne Rolle sieht nichts; die App zeigt "Konto noch nicht freigeschaltet".
- **GRANTs (Migration 0004):** `anon` bekommt nichts. `authenticated` bekommt je Tabelle nur die Aktionen, die die App ausführt,
  teils spaltengenau (Rechnungen: nur Status und Daten, nie Beträge; Postfächer: ohne `secret_ref`). Löschen ist nur bei
  `project_steps` (Datum zurücksetzen) und `agent_rules` erlaubt. `service_role` (Skripte, später Agent) bekommt alles.
  Folge: **Rollen vergeben und Stammdaten pflegen geht noch nicht über die App**, auch nicht als Admin. Das kommt mit der
  Einstellungsseite als eigene Migration. Zwei frühere Tests ("Admin darf Rolle vergeben", "Admin darf Ordnervorlage ergänzen")
  prüfen deshalb jetzt das Gegenteil.
- **Der lokale Test-Ersatz für Supabase vergibt keine Rechte mehr von selbst** (`supabase/tests/stub.sql`), wie das echte Projekt mit
  "Automatically expose new tables" AUS. Erst dadurch prüfen die Tests die GRANTs wirklich mit.
- **Prüfliste als Datenbankfunktion** (`resolve_review`, `report_wrong_filing`, Migration 0005): Dokument, Anhang, Mail, Lernbeispiel,
  Regel und Protokoll ändern sich in einer Transaktion. Die Funktionen laufen mit den Rechten des Benutzers (kein Umgehen von RLS).
- **Einfache Änderungen schreibt das Repo direkt** (Schritt setzen, Aufgabe, Rechnung versendet), der Protokolleintrag folgt als zweiter
  Aufruf. Schlägt nur der Protokolleintrag fehl, bleibt die Änderung gültig (Warnung in der Konsole).
- **Laden:** das Repo holt beim Start alle sichtbaren Tabellen (seitenweise zu 1000 Zeilen), Aktivitäten und Agent-Läufe nur die
  neuesten 500. `listDocuments` filtert im Repo mit denselben Regeln wie die Demo. Für die Pilotgröße (rund 140 Projekte) reicht das;
  bei deutlich mehr Dokumenten gehört das Filtern in die Datenbank.
- **Zeitstempel** wandelt das Repo in Ortszeit ohne Zone um, damit die Oberfläche dieselbe Form bekommt wie im Demo-Modus.
- **Dateien:** Upload in den privaten Speicher unter `<Projekt-ID>/<zufällig>/<Dateiname ohne Sonderzeichen>`; echter Name und Ordner
  stehen in `documents`. Öffnen über einen Link, der 60 Sekunden gilt (neue Repo-Methode `documentUrl`, nur Echtbetrieb).
  `UploadInput` trägt dafür jetzt auch den Inhalt (`blob`).
- **Agent bleibt Demo:** im Echtbetrieb ist "Jetzt prüfen" gesperrt und erklärt. Prüfliste, Regeln, Postfächer und Schwellen arbeiten
  schon mit der Datenbank.
- **Demo-Build ohne Supabase:** der Supabase-Teil wird nachgeladen und steht hinter einer festen Bedingung. Ein Build ohne
  `VITE_SUPABASE_*` enthält weder den Client noch eine Adresse (geprüft mit `grep supabase.co`). `npm run dev:demo` startet den
  Demo-Modus neben dem Echtbetrieb.
- **Demo-Kennzeichen `is_demo`** (Migration 0006) schon jetzt angelegt, damit die Migrationen in einem Zug angewendet werden können.
  Die App kann es nicht setzen (Trigger), nur das spätere Seed-Skript.
- **Abweichung vom Demo-Modus:** Freiberufler werden über `project_members` zugewiesen (Benutzerkonto), nicht über den Planer am Projekt.

## Schritt 8 – Blocker "Neues Projekt" (leere Auswahllisten)

- **Pflicht ist nur der Bauherr.** ABM-Nr., Hausbaufirma, Bauort und Eingangsmonat sind freiwillig. Eingetragene Werte werden weiter
  geprüft (Format der ABM-Nr. und Hausbau-Nr., Dublette der ABM-Nr.). Bei einer Bauvoranfrage wird die ABM-Nr. weiter auf "Bauvoranfrage" gesetzt.
- **Fehlende Angaben erzeugen eine Aufgabe** "Fehlende Angaben nachfragen: …" (eine je Projekt, fällig in 7 Tagen, zugewiesen an den
  Architekten, falls gewählt). Diese Regel gab es bisher nicht, auch nicht in der Demo; sie ist jetzt in beiden Repos gleich
  (`followupForMissingInfo`, Konstante `FOLLOWUP_DUE_DAYS`, Annahme). Die Aufgabe ist als "manuell" gespeichert und nicht als "warnung",
  weil der Abgleich mit den Warnungen sie sonst sofort wieder schließen würde. Sie schließt sich nicht von selbst, wenn die Angaben
  nachgetragen sind (Projekte lassen sich in der App noch nicht bearbeiten).
- **ABM-Nr. wird nicht mehr vorbelegt**, sondern als Vorschlag zum Anklicken angeboten ("Nächste freie Nummer … übernehmen"), weil sie
  beim Anlegen oft noch nicht bekannt ist. Es ist auch keine Hausbaufirma mehr vorgewählt.
- **"+ Neu anlegen" in der Auswahlliste** bei Hausbaufirma, Verkäufer, Architekt und Vermesser: aus der Liste wird ein Textfeld,
  Enter legt an und wählt den neuen Eintrag, Escape geht zurück zur Liste (schließt nicht den Dialog). Nur der Name; doppelte Namen
  werden abgelehnt (Groß-/Kleinschreibung egal). Der Planer hat die Option bewusst nicht (nicht verlangt).
- **Vermesser ist ein Projektbeteiligter**, keine eigene Stammliste: Die Auswahl zeigt die Vermesser aller bisherigen Projekte, ein neuer
  Name wird erst mit dem Projekt gespeichert (`project_parties`).
- **Rechte (Migration 0007):** Admin und Mitarbeiter dürfen Hausbaufirmen, Verkäufer und Teammitglieder *anlegen*, spaltengenau nur mit
  Namen (kein Nummernkreis, kein Benutzerkonto, kein `is_demo`). Ändern und Löschen bleibt gesperrt. Freiberufler dürfen nichts davon.
- **Die drei Hausbaufirmen** haben die IDs, die der Excel-Import für diese Namen erzeugt, damit der Import später dieselben Zeilen trifft.
  Der Nummernkreis bleibt leer (siehe offene Fragen): ohne ihn gibt es für die Firma keinen Nummernvorschlag.
- **Projekt anlegen ist eine Datenbankfunktion** (`create_project`): Projekt, Vermesser, Aufgabe und Protokoll in einer Transaktion.
- **Nebenbei behoben:** Freiberufler sahen den Knopf "+ Neues Projekt" und die Befehle unter Strg+K, obwohl sie nichts anlegen dürfen.

## Schritt 8 – Fehlende Angaben, Projektdaten bearbeiten, Kontakt Bauherr

- **Regel "Fehlende Angaben nachfragen" neu:** geprüft werden Kontakt des Bauherrn (Telefon *oder* E-Mail), Bauadresse, Hausbaufirma,
  Verkäufer, Vermesser. ABM-Nr. und Eingangsmonat gehören nicht mehr dazu, der Bauort auch nicht (er stand nicht in der neuen Liste).
  Bei einer Bauvoranfrage entfallen Hausbaufirma und Verkäufer. Eine Aufgabe je Projekt (Schlüssel `angaben:<Projekt>`), alle
  fehlenden Felder in einer Zeile.
- **Die Aufgabe gleicht sich bei jedem Speichern ab** (`sync_followup_task`, im Demo-Modus dieselbe Logik):
  fehlt nichts mehr → erledigt; fehlt noch etwas → Titel wird gekürzt; gab es noch keine Aufgabe → sie entsteht.
  Eine erledigte Aufgabe bleibt erledigt und wird nicht neu angelegt, auch wenn später wieder etwas ausgetragen wird.
  Folge für ältere Projekte (z. B. vor dieser Änderung angelegt): Sie bekommen die Aufgabe beim ersten Bearbeiten, nicht rückwirkend
  von selbst. So entstehen nach dem Excel-Import nicht auf einen Schlag über hundert Aufgaben.
- **Projektdaten bearbeiten:** Die drei Kacheln der Übersicht (Projektbeteiligte, Projektdaten, Kontakt Bauherr) haben für Admin und
  Mitarbeiter "Bearbeiten"; die Kachel wird zum Formular mit Speichern/Abbrechen. Status und Art lassen sich dort nicht ändern
  (Status hat sein eigenes Menü). Neue Repo-Methode `updateProject`, im Echtbetrieb als Datenbankfunktion `update_project`
  (Projekt, Bauherr, Beteiligte, Aufgabe, Protokoll in einer Transaktion). Was sich ändert, berechnet `planProjectUpdate` für beide Repos.
- **Protokoll ohne Werte:** Der Eintrag nennt nur die geänderten Felder ("Projektdaten geändert: Telefon, Bauadresse"), nicht die Inhalte.
  Kontaktdaten der Bauherren sollen nicht im Aktivitätenprotokoll stehen.
- **Kachel "Kontakt Bauherr":** Die Rollenabfrage war richtig; der Sperrhinweis erschien auch für Admins, sobald zu einem Projekt noch
  kein Bauherr gespeichert war. Jetzt: Sperrhinweis nur für Freiberufler, sonst die Daten oder "Noch keine Kontaktdaten eingetragen".
- **Kontaktfelder beim Anlegen:** Telefon, E-Mail, Anschrift des Bauherrn und Bauadresse im Dialog "Neues Projekt". Ohne jede Angabe wird
  kein leerer Bauherr angelegt. Die E-Mail wird auf ihr Format geprüft, das Telefon nicht.
- **Wechsel der Hausbaufirma trägt den Verkäufer aus**, wenn er zur alten Firma gehört (mit Hinweis im Formular).
- **Rechte (Migration 0008):** `bauherren` anlegen und ändern (nur die fünf Kontaktspalten), Beteiligte ändern und austragen; jeweils nur
  Admin und Mitarbeiter über die bestehenden Zeilenregeln. Freiberufler sehen weiterhin keine Zeile aus `bauherren`.
- **Nebenbei behoben:** Ein Neubau ohne ABM-Nr. hieß in Überschrift und Listen "(Bauvoranfrage)". Jetzt steht nur der Name.

## Schritt 8 – Skripte für Konten, Rollenprüfung, Sicherung, Demo-Daten

- **Zwei lokale Dateien, beide nicht eingecheckt:** `.env.server` (Secret key) und `konten.local.json` (E-Mail-Adressen, Rollen,
  Passwörter neu angelegter Konten). Vorlage: `konten.beispiel.json`. Kein Skript zeigt Passwörter oder Schlüssel an.
- **Demo-Daten in der echten Datenbank** sind derselbe erfundene Bestand wie im Demo-Modus (`buildSeedTables`), mit festen UUIDs
  (beginnen mit `de30`) und `is_demo = true` auf allen Wurzeldatensätzen. Sie hängen sich an die echten Hausbaufirmen, statt Dubletten
  anzulegen; Demo-Verkäufer bekommen dafür ein eigenes Kennzeichen (Migration 0009). Demo-Architekten haben kein Kürzel, damit
  "BE" und "MC" den echten vorbehalten bleiben. Demo-Dokumente haben keine Datei im Speicher ("Datei öffnen" meldet das).
- **Laden über die API ist keine Transaktion.** Schlägt ein Teil fehl, entfernt das Skript alles bereits Geladene wieder.
  Alternativ gibt es dieselben Zeilen als SQL in einer Transaktion (`--sql`); nur diese Fassung ist lokal geprüft.
- **`check:roles` braucht keinen Secret key:** Bezugswerte ("alle Projekte") kommen aus einem angemeldeten Admin-Konto.
  Schreibversuche sind so gebaut, dass sie nichts ändern, auch wenn eine Regel versagt: Werte werden auf sich selbst gesetzt, oder der
  Versuch enthält einen ungültigen Wert, den die Datenbank erst nach der Berechtigungsprüfung ablehnt. "Gesperrt" zählt nur, wenn
  die Ablehnung wirklich an der Berechtigung liegt.
- **`check:repo` braucht den Secret key** nur zum Vorbereiten (Testmail, Testrechnung: schreibt sonst nur der Agent) und zum Aufräumen
  (die App kann nichts löschen). Die geprüften Aufrufe selbst laufen als angemeldeter Benutzer über das `supabaseRepo`.
  Testdaten heißen "Zzsmoke…" bzw. "ZZ-Smoketest …"; am Ende wird nachgezählt, ob etwas übrig ist.
- **Sicherung ohne Dateien:** `export:backup` schreibt Tabellen, Kontenliste und Dateiliste. Die Dateien im Speicher und eine
  Wiederherstellung aus der Sicherung fehlen noch (offene Punkte).

## Hosting für den Pilotbetrieb

- **Cloudflare Pages + Access, ohne eigene Domain** (`docs/hosting-echtbetrieb.md`). Access mit Einmalcode und einzelnen freigegebenen
  Adressen; die Anmeldung der App bleibt zusätzlich. Vorschau-Builds bekommen keine Supabase-Variablen und laufen im Demo-Modus.
- **Styleguide nur in der Entwicklung:** Die Seite wird nur im Dev-Server geladen und ist im Produktions-Build nicht enthalten.
  Unbekannte Adressen zeigen "Diese Seite gibt es nicht".
- **Suchmaschinen:** `noindex` in `index.html`, `public/robots.txt` (alles gesperrt) und `X-Robots-Tag` in `public/_headers`.
- **Sicherheits-Kopfzeilen** in `public/_headers`, darunter eine Content-Security-Policy: Skripte, Schriften und Bilder nur von der
  eigenen Adresse, Verbindungen nur zur eigenen Adresse und zu `*.supabase.co`. Inline-Styles bleiben erlaubt (Diagramme).
- **`npm run check:build`** prüft den Build vor dem Veröffentlichen auf Geheimnisse, interne Seiten und die Sperre für Suchmaschinen.
- **Texte im Echtbetrieb ohne interne Verweise** ("BUILD.md", "Schritt 9", "Prototyp"). Die Fußzeile zeigt "v0.1 – Pilot".
  Bewusst geblieben: Die Postfächer der Beispieldaten heißen "… (Demo)" und haben die Art "Demo". Das sind Daten, kein Hinweis der
  Oberfläche; sie verschwinden mit den Demo-Daten.
- **Einführung beim ersten Login** (`PilotIntro`), einmal je Konto und Gerät (im Browser gemerkt, nicht in der Datenbank), jederzeit
  unter "Hilfe" nachzulesen. Die Hilfeseite ersetzt den bisherigen Platzhalter.
- **Dialoge:** Kopf und Fuß bleiben stehen, nur der Inhalt scrollt. Vorher scrollte der ganze Dialog, auf dem Handy rutschte der Titel weg.

## Neues Projekt aus einem Vertrag (Migration 0010)

- **Entwurf getrennt vom Datenmodell:** Der Extractor liefert je Feld `{wert, quelle, sicherheit}` (`src/lib/extract/types.ts`).
  Erst die Prüfmaske macht daraus ein Projekt, und ein Mensch bestätigt. Nichts wird ohne Bestätigung angelegt, auch keine
  Stammdaten (eine unbekannte Hausbaufirma wird nur gemeldet).
- **Metadaten am Dokument, nicht am Projekt:** Vertragsdatum, Vertragspreis, Angebotsnummer und Haustyp stehen in
  `documents.meta`. Der Vertragspreis belegt keine Rechnungen vor.
- **Flurstück und Gemarkung** sind optionale Projektfelder und dienen der Duplikatprüfung (gleiche Nummer zählt nur, wenn die
  Gemarkung passt oder auf einer Seite fehlt).
- **Zweiter Bauherr bei den Kontaktdaten** (`bauherren.name2/phone2/email2`), nicht in `projects`: Projekte sehen auch
  Freiberufler, Kontaktdaten der Bauherren nie. Abweichung vom ersten Entwurf ("am Projekt"), aus genau diesem Grund.
- **Im Werkvertrag steht kein Baugrundstück.** Bauadresse, Bauort, Flurstück und Gemarkung werden daraus nie übernommen, weder
  vom Mock noch aus der Antwort des Bildmodells (`normalizeFields` verwirft sie).
- **Geburtsdatum und Beruf** werden nicht ausgelesen und haben weder Feld noch Spalte.
- **Dokumenttyp bestimmt den Ordner** (`src/lib/extract/filing.ts`): Werkvertrag und Sonstiges nach `00 Verträge` (vorläufig),
  Vermessungsvertrag nach `04 Vermesser`. Der neue Ordner hat keine Schlüsselwörter, der Posteingangs-Agent sortiert dort
  vorerst nichts von selbst ein.
- **Entwürfe** (`project_drafts`) entstehen sofort nach dem Auslesen und halten Felder, Formularstand und die Datei
  (Speicher unter `drafts/<Entwurf>/…`, nur Admin und Mitarbeiter). Beim Bestätigen wird die Datei unter der Projekt-ID neu
  abgelegt und die Entwurfsdatei entfernt. Entwürfe werden nie gelöscht, nur als übernommen oder verworfen markiert.
- **Seitenbilder im Browser:** PDFs rendert pdf.js lokal (eigene Dateien im Build, kein CDN). Gesendet wird nur Seite 1,
  auf Wunsch zusätzlich die Plan-Seite, mit höchstens 1568 px Kantenlänge als JPEG (Qualität 85).
- **Mock im Demo-Modus:** Scans kann er nicht lesen. Nur im Demo-Modus liefert er dafür erfundene Beispielwerte und sagt das
  in der Prüfmaske dazu; mit echten Daten rät er höchstens aus dem Dateinamen.
- **Edge Function:** reine Logik in `logic.ts` (ohne Importe, von vitest geprüft), Aufruf in `index.ts`. Einrichtung und
  Absicherung: `docs/vertrag-extraktion.md`.
- **Vorschau zum Blättern und Zoomen** (`src/components/DocumentPreview.tsx`, Logik in `src/lib/extract/previewState.ts`):
  Das Dokument wird einmal geöffnet, jede Seite erst beim Anzeigen gerendert (höchstens vier bleiben im Speicher), die
  Seiten-Übersicht erst beim Aufklappen. Zoom 100 bis 400 % per Schaltfläche, Strg/Cmd+Mausrad und Zwei-Finger-Geste,
  Verschieben durch Ziehen, Blättern auch mit den Pfeiltasten. Die Vorschau zeigt nur an: gesendet wird weiterhin nur, was
  die Auslesung selbst rendert (Seite 1, auf Wunsch die angezeigte Plan-Seite über "Diese Seite lesen", höchstens 1568 px).
- **Kleines Antwort-Schema:** Die erste Fassung band die Antwort an ein Schema mit einem Unterobjekt je Feld (21 Felder, enum,
  alles Pflicht). Der KI-Dienst lehnte das ab ("The compiled grammar is too large"). Jetzt: flaches Array von Einträgen
  `{feld, wert, quelle, seite, sicherheit}`; Feldnamen und Stufen stehen in der Anweisung, geprüft wird in der Funktion
  (`toResponse` in `logic.ts`). Lehnt der Dienst auch das ab, geht es einmal ohne Schema-Bindung weiter (`EXTRACTOR_STRICT`).
- **Datenbanktests ohne lokales Postgres:** `tools/test-db.sh` braucht eine Postgres-Installation. Für diesen Schritt wurden
  Migrationen, Seed und `rls_test.sql` ersatzweise gegen PGlite (Postgres als WASM) ausgeführt, Anweisung für Anweisung wie
  `psql`. Vor dem Einspielen in Supabase trotzdem einmal `bash tools/test-db.sh` auf einem Rechner mit Postgres laufen lassen.

## Projekt löschen (Migration 0011)

- **Ausnahme von "nie löschen":** Bisher galt für Projekte Storno statt Löschen (Migration 0004). Das bleibt der Normalfall.
  Für Fehlanlagen und Testprojekte gibt es jetzt "Projekt löschen …" im Menü "…" der Projektseite, nur für Admins, mit
  Bestätigung durch Eintippen des Bauherrn-Namens.
- **Eine Funktion statt neuer Löschrechte:** `delete_project(p_id)` läuft mit den Rechten des Eigentümers und prüft selbst,
  dass ein Admin aufruft. Es gibt weiterhin kein DELETE-Recht auf `projects`, `activities`, `invoices` oder `bauherren`;
  auch ein Admin kann nicht direkt in den Tabellen löschen.
- **Was mitgeht:** Schritte, Rechnungen, Dokumente, Aufgaben, Aktivitäten, Projektbeteiligte, Zuweisungen und Regeln des
  Agenten (über die Fremdschlüssel), Entwürfe zu diesem Projekt (ausdrücklich), der Bauherr-Kontakt, wenn er an keinem
  anderen Projekt hängt. Mails und Anhänge des Posteingangs bleiben, ihr Verweis auf das Projekt wird geleert.
- **Dateien:** Die Funktion gibt die Speicherpfade zurück, die App entfernt die Dateien danach über die Storage-API.
  Schlägt das fehl, sind die Zeilen trotzdem gelöscht; die App meldet, wie viele Dateien liegen geblieben sind (sie sind
  dann ohne Projekt für niemanden außer Admin und Mitarbeiter erreichbar und lassen sich im Dashboard entfernen).
- **Kein Protokolleintrag:** Die Aktivitäten des Projekts werden mitgelöscht, ein eigener Eintrag entsteht nicht. Wer wann
  gelöscht hat, steht damit nirgends in der App. Vor dem Löschen echter Projekte: `npm run export:backup`.
- **Der Posteingangs-Agent löscht weiterhin nie etwas** (CLAUDE.md). Die Funktion ist nur aus der Oberfläche erreichbar.

