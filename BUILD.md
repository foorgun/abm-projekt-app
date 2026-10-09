# BUILD.md – Bauplan ABM Projekt-App v2

Neustart. Das erste Design wurde verworfen. Dieser Plan ersetzt alles Frühere.
Wiederverwendbar aus `reuse/` sind nur Datenbank, Importer und Warnlogik (siehe Abschnitt 9), **nicht** die alte Oberfläche.

## 1. Ziel

Eine interne App, die ABM täglich öffnet. Sie beantwortet drei Fragen auf einen Blick:
1. **Wo steht jedes Projekt, und was fehlt noch?** (Prozess pro Projekt, Aufgaben, Warnungen wie "Rechnung nicht versendet, 10.000 € offen")
2. **Was muss ich heute tun?** (Aufgaben, Fristen, Rückfragen)
3. **Liegen die Dateien dort, wo sie hingehören?** (Der Posteingangs-Agent sortiert Mail-Anhänge in die Projektordner.)

Prototyp-Anspruch: Es muss für die Geschäftsführung und den IT-Verantwortlichen überzeugend aussehen und im Demo-Modus
komplett klickbar sein. Echte Anbindungen (Supabase, Postfächer) kommen in den späteren Schritten, die Architektur ist von Anfang an darauf ausgelegt.

## 2. Umfang

**Enthalten:** Dashboard, Projekte (Alle/Aktiv/Abgeschlossen), Pipeline-Board, Projektdetail mit Prozess und Dokumentenordnern,
Aufgaben, Rechnungen, Posteingangs-Agent (Dashboard, Prüfliste, Postfächer), Anmeldung und Rollen (Supabase-Modus).

**Nicht enthalten:** CAD-Dateien, Rechnungserstellung, Buchhaltung/DATEV, Kontakte/CRM-Vollausbau, E-Mails senden, Mobile-App.
Seitenleiste zeigt "Kontakte" als deaktivierten Eintrag "bald", damit die Richtung sichtbar ist.

## 3. Architektur

```
Browser (Vite/React/TS)
   │  Repo-Interface (demoRepo | supabaseRepo)
   ▼
Supabase (Frankfurt): Postgres + RLS · Auth · Storage (privater Bucket) · Edge Functions
   ▲
   │  inbox-ingest (Edge Function, geplant per Cron oder n8n-Webhook)
Postfächer (Microsoft 365 per Graph API, später auch IMAP)
```

- Der Agent läuft **serverseitig** (Edge Function), nicht im Browser. Im Demo-Modus simuliert `demoMailSource` Postfächer mit erfundenen Mails.
- Die Zuordnung ist als **reine Funktion** gebaut (`src/agent/classify.ts`): Eingabe Mail plus Kontext (Projekte, Kontakte, Ordnervorlage), Ausgabe Entscheidung. Dieselbe Funktion wird im Browser-Demo und in der Edge Function genutzt und ist per Unit-Test abgedeckt.

## 4. Design

Referenz: `docs/design-referenz.png`. Gleiche Bildsprache (linke Navigation mit Gruppenüberschriften, Kopfzeile mit Suche und Aktionen,
KPI-Kacheln mit Icon und Trend-Badge, zwei Diagramme nebeneinander, Tabelle "Letzte Aktivitäten" mit Status-Pills), aber **dunkel**.
Kein 1:1-Nachbau, keine Fremdmarke, keine Rupien-Beispieldaten. Logo: `docs/abm-logo.png` (weißer Schriftzug auf Schwarz, oben links).

**Tokens** (CSS-Variablen in `src/styles/tokens.css`, Dark ist Standard, Light-Werte vorbereiten aber nicht ausliefern):

| Token | Wert (Vorschlag) |
|---|---|
| `--bg` | `#0c0e12` |
| `--surface` | `#14181f` (Karten) |
| `--surface-2` | `#1a1f28` (Hover, Tabellenkopf) |
| `--sidebar` | `#0a0c0f` |
| `--border` | `#242a35` |
| `--text` | `#e8ebf1` |
| `--muted` | `#8d96a6` |
| `--accent` | `#2bb3a3` (Teal, Hauptaktionen, aktive Navigation, Diagramm Hauptserie) |
| `--accent-soft` | `rgba(43,179,163,.14)` |
| `--ok` / `--warn` / `--danger` / `--info` | `#4cc38a` / `#f0b24a` / `#ef6b63` / `#6ea8ff`, je mit `-soft`-Hintergrund 14 % |

- Schrift: Inter (`@fontsource-variable/inter`), Zahlen mit `font-variant-numeric: tabular-nums`. Größen 12/13/14/16/20/28.
- Radius 10 px Karten, 8 px Inputs/Buttons, 999 px Pills. Karten: 1 px Border, kein Schatten. Abstände 4er-Raster.
- Ein Akzent, keine Verläufe, keine Emojis in der Oberfläche. Diagramme: Gitter nur horizontal, Achse beginnt bei 0, Werte per Tooltip, Farben nicht als einziger Bedeutungsträger (Pills haben Text).
- Zustände überall: Laden (Skeleton), leer (kurzer Text plus Aktion), Fehler (Meldung plus erneut versuchen).
- Responsive: ab 1024 px Seitenleiste fest, darunter einklappbar; Tabellen scrollen horizontal im Container. Tastatur-Fokus sichtbar, Kontrast mindestens AA.

**Navigation links** (Gruppen wie im Referenzbild):

```
[ABM-Logo]                                   [«]
ÜBERSICHT
  Dashboard
PROJEKTE
  Alle Projekte
  Aktive Projekte
  Abgeschlossene Projekte
  Pipeline            (Board nach Phase)
ARBEIT
  Aufgaben            (Badge: heute fällig + überfällig)
  Rechnungen          (nicht für Freiberufler)
POSTEINGANG-AGENT
  Agent-Dashboard
  Prüfliste           (Badge: offene Prüfungen)
  Postfächer
ADRESSBUCH
  Kontakte            (deaktiviert, "bald")
────────────
  Einstellungen · Hilfe
  [Avatar] Name · Rolle  ⌄
  v0.1 – Prototyp
```

**Kopfzeile:** Suche ("Projekte, Bauherren, ABM-Nr. durchsuchen", Strg+K), Glocke mit Warnungen, Button "Neues Projekt" (primär, Dropdown: Neues Projekt, Neue Aufgabe).

## 5. Seiten

**Dashboard** `/`
- Begrüßung ("Guten Abend, Name") und Datum.
- KPI-Kacheln: Aktive Projekte · Offene Aufgaben (davon überfällig) · Rechnungen nicht versendet (Summe, rot) · Agent: zur Prüfung.
- Karte "Handlungsbedarf": Warnungen aus `computeAlerts`, sortiert nach Dringlichkeit, jeweils Link zum Projekt.
- Diagramm links: "Neue Projekte pro Monat" (Balken). Diagramm rechts: "Projekte nach Phase" (horizontale Balken).
- Tabelle "Letzte Aktivitäten": Projekt, Ereignis (Schritt erledigt, Datei abgelegt, Rechnung versendet), Wer, Zeit. Filter "Alle Aktivitäten".

**Projekte** `/projekte`, `/projekte/aktiv`, `/projekte/abgeschlossen`
- Tabs Alle · Aktiv · Abgeschlossen (+ Storno ausgeblendet, per Filter einblendbar), Suche, Filter Firma, Architekt, Phase, Sortierung.
- Tabelle: ABM-Nr., Bauherr, Ort, Firma, Architekt, Phase (Pill), Fortschritt (Balken x/Y Schritte), nächste Aufgabe, Warn-Icon, Status.
- Gruppierung optional nach Eingangsmonat. Zeilenklick öffnet das Projekt.

**Pipeline** `/pipeline`: Board mit einer Spalte je Phase, Karten (Bauherr, Ort, Firma, Architekt-Kürzel, Warn-Icon). Karte per Drag-and-Drop in die nächste Phase setzt den Schritt mit heutigem Datum (mit Bestätigung).

**Projektdetail** `/projekte/:id`
- Kopf: Bauherr, ABM-Nr., Ort, Firma, Status-Pill, Aktionen.
- **Prozess-Stepper** (horizontal, alle Phasen aus `step_definitions`, je Datum bearbeitbar, aktueller Schritt hervorgehoben, "fehlt noch" klar erkennbar).
- Warnbanner für dieses Projekt.
- Tabs: Übersicht (Beteiligte laut `Liste.docx`: ABM-Nr., Hausbau-Nr., Bauherr, Bauadresse, Verkäufer, Vermesser, Erdbauer, Strom, Wasser, Elektriker Baustrom) · **Dokumente** (Ordnerbaum aus `docs/ordnerstruktur.md`, je Ordner Anzahl Dateien, leere Ordner dezent, Upload per Drag-and-Drop in einen Ordner, Herkunft "Agent"/"Upload") · Aufgaben · Rechnungen · Aktivität.

**Aufgaben** `/aufgaben`: Liste mit Filtern Heute · Diese Woche · Überfällig · Alle · Erledigt, nach Person und Projekt. Aufgaben entstehen manuell, aus Warnungen (automatisch, dedupliziert) und aus der Agent-Prüfliste. Abhaken, Fälligkeit ändern, Person zuweisen.

**Rechnungen** `/rechnungen`: Tabelle mit Status (geplant, fällig, versendet, bezahlt), Summen oben, Aktion "Als versendet markieren".

**Agent-Dashboard** `/agent`
- KPI-Kacheln: Heute verarbeitet · Automatisch abgelegt · Zur Prüfung · Fehler · Trefferquote (7 Tage, = automatisch abgelegt ohne spätere Korrektur).
- Karte "Postfächer": je Postfach Name, Adresse, Status (Verbunden/Pausiert/Fehler), zuletzt geprüft, Schalter Pausieren.
- Diagramm: Verarbeitete Anhänge pro Tag (gestapelt: automatisch, Prüfung).
- Tabelle "Letzte Aktivitäten des Agenten": Zeit, Absender, Betreff, Datei, Ziel (Projekt › Ordnerpfad), Sicherheit (%), Status-Pill (Abgelegt, Zur Prüfung, Ignoriert, Fehler). Zeile aufklappen zeigt Begründung ("ABM-Nr. 7101-088 im Betreff, Absender Verkäufer von Bien-Zenker").
- Button "Jetzt prüfen" (löst einen Lauf aus; im Demo-Modus kommen neue Beispielmails).

**Prüfliste** `/agent/pruefung`: Karten je unsichere Zuordnung. Zeigt Mail (Betreff, Absender, Auszug), Anhänge, Vorschlag des Agenten (Projekt, Ordner, Sicherheit, Begründung). Aktionen: Bestätigen · Ändern (Projekt-Suche plus Ordnerbaum-Auswahl) · Ignorieren. Option "Regel merken" (Absender → Projekt oder Absender → Ordner). Jede Bestätigung wird als Lernbeispiel gespeichert.

**Postfächer** `/agent/postfaecher`: Postfächer verwalten (Name, Adresse, Anbieter, Ordner überwachen, Pause), Regeln (Absender → Projekt/Ordner), Schwellenwerte (Auto-Ablage ab 90 %, Standard), Ignorier-Liste (Newsletter, Signaturbilder). Im Demo-Modus nur Anzeige und lokale Änderung.

## 6. Daten (Migration `0002_*.sql`, Ergänzung zu `reuse/supabase/migrations/0001_init.sql`)

Neue Tabellen, alle mit RLS (Mitarbeiter/Admin voll, Freiberufler nichts, außer Dokumenten zugewiesener Projekte):

- `folder_templates(id, path text unique, parent_path, sort, label, has_date bool, keywords text[], description)` – Ordnervorlage aus `docs/ordnerstruktur.md`. `keywords`/`description` helfen der Zuordnung ("Baugenehmigung", "Eingangsbestätigung", "Lageplan", "Wohnflächenberechnung" …).
- `documents` erweitern: `folder_path text`, `source ('upload'|'agent')`, `source_item_id uuid`, `received_on date`.
- `tasks(id, project_id null, title, due_on, assignee_id, status ('offen'|'erledigt'), source ('manuell'|'warnung'|'agent'), source_key unique null, created_at, done_at)`.
- `mailboxes(id, label, address, provider ('microsoft365'|'imap'|'demo'), status ('verbunden'|'pausiert'|'fehler'), last_checked_at, watch_folder, secret_ref)` – **keine Passwörter in der Tabelle**, nur Verweis auf Supabase Vault/Secret.
- `inbox_items(id, mailbox_id, message_id unique, received_at, from_name, from_email, subject, body_excerpt, status ('neu'|'abgelegt'|'pruefen'|'ignoriert'|'fehler'), project_id null, confidence numeric, reason text, created_at)`.
- `inbox_attachments(id, item_id, file_name, mime, size_bytes, storage_path, project_id null, folder_path null, confidence numeric, status, document_id null)`.
- `agent_runs(id, mailbox_id, started_at, finished_at, fetched, filed, to_review, ignored, errors, note)`.
- `agent_rules(id, kind ('absender_projekt'|'absender_ordner'|'ignorieren'), match text, project_id null, folder_path null, created_by, created_at)`.
- `step_definitions` erweitern, die fünf Excel-Schritte unverändert lassen (Plangespräch, Vertrag versendet, Vertrag zurück, Übergabe Baugesuch, Baugenehmigung). **Vorschlag** weiterer Phasen aus der Ordnerstruktur, mit ABM abzustimmen: Vermesser beauftragt · Entwurf freigegeben · Vorabzug versendet · Baufreigabe · Bauanlaufgespräch · Hausanschlüsse beantragt · Hausaufstellung. Reihenfolge per `sort`, Anzeige und Warnungen lesen nur aus der Tabelle, keine fest codierte Schrittliste mehr.

Dateien im Bucket `project-documents`: `<project_id>/<folder_path>/<datum>_<dateiname>`.
Ordnernamen mit Datumsplatzhalter ("erhalten am xx.yy.yyyy") werden beim Ablegen als Unterordner mit echtem Datum angelegt, z. B. `09 …/01 Baugenehmigung/01 erhalten am 14.11.2026/`.

## 7. Posteingangs-Agent – Verhalten

1. **Abholen:** pro Postfach neue Mails seit `last_checked_at` mit Anhang (oder relevantem Text). Nur lesen. Mails nicht verschieben oder löschen. Duplikate über `message_id` ausschließen.
2. **Filtern:** Signaturbilder (< 15 KB, `image/*` inline), Newsletter, Absender auf Ignorier-Liste → `ignoriert`. Angriffsfläche klein halten: ausführbare Dateien und Archive mit Passwort nie ablegen, sondern `fehler`/Prüfliste.
3. **Projekt bestimmen** (deterministisch zuerst, dann KI):
   - ABM-Nr. oder Hausbau-Nr. in Betreff, Text oder Dateiname (Regex, auch mit Leerzeichen/Bindestrich-Varianten).
   - Regel `absender_projekt`, bekannter Absender mit genau einem aktiven Projekt.
   - Bauherr-Nachname **und** Ort/Straße im Text.
   - Sonst KI-Vorschlag aus einer kleinen Kandidatenliste (max. 20 aktive Projekte, vorselektiert), nie aus allen Projekten frei raten.
4. **Ordner bestimmen:** Regel `absender_ordner` → Schlüsselwörter aus `folder_templates` → KI wählt **ausschließlich einen Pfad aus der Vorlage** (Antwort wird gegen die Liste geprüft, sonst verworfen).
5. **Entscheiden:** `Sicherheit = min(Projekt, Ordner)`. Ab 90 % und eindeutigem Projekt: automatisch ablegen. 60–89 %: Prüfliste mit Vorschlag. Darunter oder mehrdeutig: Prüfliste ohne Vorschlag. Schwellen sind Einstellungen.
6. **Ablegen:** Kopie in Storage, Eintrag in `documents` (Herkunft Agent), Aktivität protokollieren. Bei Namenskonflikt Zähler anhängen, nie überschreiben.
7. **Protokollieren:** jede Entscheidung mit Begründung in `inbox_items.reason`; Korrekturen durch Menschen werden als Regel- oder Lernbeispiel gespeichert.

**Sicherheit:** Mail-Inhalt ist nicht vertrauenswürdig (Prompt-Injection). Das Modell bekommt nur Text zum Klassifizieren, hat keine Werkzeuge, und seine Antwort wird strikt gegen erlaubte Projekt-IDs und Ordnerpfade validiert. Der Agent kann nichts löschen, senden oder freigeben.
**Datenschutz:** Region EU, Auftragsverarbeitungsverträge (Supabase, Microsoft, KI-Anbieter) vor dem Echtbetrieb, nur nötige Textauszüge an das Modell, Logs ohne vollständige Mailtexte.

Tests (`src/agent/classify.test.ts`), mindestens: ABM-Nr. im Betreff → richtiges Projekt; zwei Projekte desselben Bauherrn → Prüfliste; unbekannter Absender ohne Treffer → Prüfliste; Newsletter → ignoriert; KI-Antwort mit Pfad außerhalb der Vorlage → verworfen; Regel überstimmt KI; Dublette (`message_id`) → übersprungen; Datumsordner wird mit Maildatum benannt.

## 8. Bauschritte (in dieser Reihenfolge, jeder Schritt endet mit Typprüfung, Tests, Build, Commit)

**0. Setup.** `git init`, Vite-React-TS-Projekt, Abhängigkeiten, Ordnerstruktur `src/{components,pages,lib,data,agent,styles}`, `reuse/` einspielen (Abschnitt 9), `.gitignore`, `.env.example`, GitHub-Actions-CI. *Abnahme:* `npm run dev` zeigt leere Shell, CI grün.

**1. Design-System und Shell.** Tokens, Layout (Seitenleiste, Kopfzeile), Grundkomponenten: Button, Input, Select, Tabs, Card, KpiCard, Pill/Badge, Table, Skeleton, EmptyState, Tooltip, Stepper, Balken-/Linien-Diagramm (SVG, eine Skala). Eine Styleguide-Seite `/styleguide`. *Abnahme:* Screenshot der Shell neben `design-referenz.png`: gleiche Struktur, dunkel, ABM-Logo, nichts abgeschnitten bei 1280 px und 390 px Breite.

**2. Datenschicht.** Typen, erweitertes `Repo`-Interface, `demoRepo` mit erfundenen Daten (aus `reuse/src` und `reuse/supabase/seed.sql` ableiten, stabil per Seed), Migration `0002`, RLS-Tests. *Abnahme:* `bash tools/test-db.sh` grün.

**3. Dashboard.** Wie Abschnitt 5. *Abnahme:* der 10.000-€-Fall steht oben bei Handlungsbedarf und führt zum Projekt.

**4. Projekte und Pipeline.** Listen, Tabs, Filter, Board. *Abnahme:* Wechsel Alle/Aktiv/Abgeschlossen ohne Neuladen, Filter kombinierbar, Board verschiebt Karte und aktualisiert Stepper.

**5. Projektdetail.** Stepper, Tabs, Ordnerbaum mit Upload je Ordner. *Abnahme:* Datei in "08 Bauantrag › 03 Wohnflächenberechnung" ziehen, erscheint dort, Zähler steigt.

**6. Aufgaben.** *Abnahme:* Warnung erzeugt genau eine Aufgabe, Erledigen blendet die Warnung aus, solange die Ursache fehlt.

**7. Posteingangs-Agent (Demo).** `classify.ts`, `demoMailSource` mit ca. 25 erfundenen Mails (Baugenehmigung vom Amt, Angebot Strom, Lageplan vom Vermesser, Newsletter, uneindeutige Mail), Agent-Dashboard, Prüfliste, Postfächer. *Abnahme:* "Jetzt prüfen" legt Anhänge sichtbar im Ordnerbaum des Projekts ab, uneindeutige landen in der Prüfliste, Bestätigen legt sie ab, "Regel merken" wirkt beim nächsten Lauf.

**8. Supabase scharf.** Auth, Rollen, Storage, `supabaseRepo` gegen ein echtes Projekt (Frankfurt) prüfen, Excel-Import, Freiberufler-Sicht testen. *Abnahme:* Anmeldung, Datum ändern, Datei hochladen, Neuladen, Freiberufler sieht keine Rechnungen und nur zugewiesene Projekte.

**9. Agent scharf (nur mit IT, Phase 2).** Edge Function `inbox-ingest`, `MailSource` für Microsoft Graph (Anwendungsberechtigung nur `Mail.Read`, auf bestimmte Postfächer begrenzt per Application Access Policy), Zugangsdaten in Supabase Secrets, Cron oder n8n-Webhook, erst mit einem Testpostfach. *Abnahme:* 20 echte, vorher bekannte Mails, Ergebnis wird manuell verglichen, Trefferquote dokumentiert.

**10. Feinschliff.** Responsive, Tastatur, leere/Fehlerzustände, Texte, README, `docs/`. *Abnahme:* `npm run build` ohne Warnungen, Lighthouse-Barrierefreiheit ≥ 90.

## 9. Wiederverwendung aus `reuse/`

| Datei | Zweck |
|---|---|
| `reuse/supabase/migrations/0001_init.sql` | Schema und RLS (Firmen, Projekte, Schritte, Rechnungen, Dokumente, Rollen). Nach `supabase/migrations/` kopieren, `0002` darauf aufbauen. |
| `reuse/supabase/seed.sql`, `tests/` | Erfundene Daten, RLS-Tests, Stub für lokales Postgres |
| `reuse/tools/import_excel.py` (+ Test, `test-db.sh`) | Importer der echten Excel-Projektliste, bereinigt Storno, Datumsfehler, doppelte Nummern |
| `reuse/src/alerts.ts` (+ Test), `format.ts` | Warnlogik (Schwellen: 7 / 21 / 42 / 120 Tage, Annahmen) und Formatierung |

Der Importer wurde gegen die echte Liste (139 Projekte) geprüft. Die Supabase-Anbindung (`supabaseRepo`) der ersten Version war **nicht** gegen ein echtes Supabase getestet und ist hier nicht enthalten, sie wird in Schritt 8 neu geschrieben und geprüft.

## 10. Offene Fragen (nicht raten, in `docs/offene-fragen.md` sammeln)

- Welche Phasen und Schritte gelten wirklich, und in welcher Reihenfolge? (Vorschlag in Abschnitt 6)
- Wann wird welche Rechnung gestellt (Meilensteine, Beträge)? Ab wann gilt sie als überfällig?
- Was bedeuten "3.1+3.2" und die Werte in "Baubetreuung" aus der Excel-Liste?
- Planer: intern oder freiberuflich? Volle Namen der Architekten (BE, MC)?
- Wer ist "Clayton" (Ordner "Schriftverkehr mit Clayton")?
- Welche Postfächer soll der Agent überwachen (Sammelpostfach, persönliche)? Wer verwaltet Microsoft 365 (App-Registrierung, Admin-Zustimmung)?
- Dürfen Mailtexte (Auszüge) an einen KI-Dienst gesendet werden? AVV vorhanden?
- Backup des Fileservers: wo, wie oft, Wiederherstellung getestet?
