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
