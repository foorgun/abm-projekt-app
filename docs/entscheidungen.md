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

- **Ordnervorlage aus einer Quelle:** `docs/ordnerstruktur.md` wird geparst (`src/lib/folders.ts`, 126 Ordner).
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
