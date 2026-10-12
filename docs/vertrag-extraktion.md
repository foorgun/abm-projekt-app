# Neues Projekt aus einem Vertrag: KI-Auslesung einrichten

Im Dialog "Neues Projekt" lässt sich ein Vertrag (PDF, DOCX oder Bild, höchstens 10 MB) ablegen. Die App füllt die
Projektfelder vor, ein Mensch prüft jedes Feld und bestätigt. Ohne diese Einrichtung arbeitet die App mit dem Mock:
Er liest nur Text-PDFs und DOCX im Browser, Scans kann er nicht lesen.

Die echte Auslesung macht die Edge Function `extract-project` (`supabase/functions/extract-project/`). Sie bekommt
**nur Seite 1** des Vertrags als Bild (auf Wunsch zusätzlich die Plan-Seite für den Haustyp), ruft damit ein Bildmodell
von Anthropic auf und gibt je Feld `{wert, quelle, sicherheit}` zurück.

## Was vorher geklärt sein muss

1. **AVV:** Auftragsverarbeitungsvertrag mit Anthropic abgeschlossen (auf Seite 1 stehen Name, Anschrift, Telefon und
   E-Mail der Bauherren). Ohne AVV bleibt `EXTRACTOR_ENABLED` auf `false`.
2. **API-Schlüssel:** in der Anthropic Console erzeugt. Er steht ausschließlich als Secret der Funktion in Supabase,
   nie in `.env`, nie in Cloudflare, nie im Repo.
3. **Migration 0010** ist in der Datenbank (Tabelle `extraction_log` für die Kostenbremse).

## Schritt für Schritt

Alle Befehle im Projektordner. `<ref>` ist die Projekt-Referenz aus der Supabase-Adresse (`https://<ref>.supabase.co`).

1. **Supabase CLI installieren** (macOS):
   ```
   brew install supabase/tap/supabase
   supabase --version
   ```
2. **Einloggen** (öffnet den Browser):
   ```
   supabase login
   ```
3. **Mit dem Projekt verknüpfen:**
   ```
   supabase link --project-ref <ref>
   ```
4. **Secrets setzen.** Den Schlüssel nicht in eine Datei schreiben, die eingecheckt wird:
   ```
   supabase secrets set ANTHROPIC_API_KEY=<Schlüssel aus der Anthropic Console>
   supabase secrets set EXTRACTOR_ENABLED=false
   ```
   Optional, sonst gelten die Standardwerte:
   ```
   supabase secrets set EXTRACTOR_LIMIT_USER_PER_DAY=20
   supabase secrets set EXTRACTOR_LIMIT_TOTAL_PER_DAY=100
   supabase secrets set EXTRACTOR_MONTHLY_BUDGET_EUR=20
   supabase secrets set EXTRACTOR_MODEL=claude-sonnet-5-5
   supabase secrets set EXTRACTOR_USD_EUR=1.0
   ```
   Prüfen, was gesetzt ist (zeigt nur Namen, keine Werte): `supabase secrets list`
5. **Funktion deployen:**
   ```
   supabase functions deploy extract-project
   ```
6. **Einmal testen, noch ausgeschaltet:**
   ```
   npm run check:roles
   ```
   Erwartet: Freiberufler "403 abgewiesen", Admin und Mitarbeiter "nicht abgewiesen". In der App (mit
   `VITE_PROJECT_EXTRACTOR=edge`) erscheint nach dem Ablegen eines Vertrags der Hinweis "Auslesung noch nicht
   freigeschaltet", und die Felder lassen sich von Hand ausfüllen. Es ist kein Bild an den KI-Dienst gegangen.
7. **Freischalten** (erst mit AVV):
   ```
   supabase secrets set EXTRACTOR_ENABLED=true
   ```
   Secrets gelten sofort, ein neues Deploy ist nicht nötig.
8. **Frontend umstellen:** in der lokalen `.env` und in Cloudflare Pages (nur Production) `VITE_PROJECT_EXTRACTOR=edge`
   setzen, dann neu bauen bzw. pushen. Im Demo-Modus (ohne `VITE_SUPABASE_*`) bleibt immer der Mock aktiv.
9. **Mit einem erfundenen Dokument testen**, nicht mit einem echten Vertrag: ein Formular ausdrucken, von Hand
   ausfüllen, scannen und ablegen. Danach im SQL-Editor: `select at, model, images, input_tokens, output_tokens, cost_eur, ok from extraction_log order by at desc limit 5;`

Abschalten geht jederzeit mit `supabase secrets set EXTRACTOR_ENABLED=false` (wirkt sofort, die App bietet dann wieder
die manuelle Anlage an).

## Secrets der Funktion

| Secret | Standard | Bedeutung |
|---|---|---|
| `ANTHROPIC_API_KEY` | keiner | Schlüssel zum KI-Dienst. Nur hier. |
| `EXTRACTOR_ENABLED` | `false` | Nur der Wert `true` schaltet frei. |
| `EXTRACTOR_MODEL` | `claude-sonnet-5-5` | Modell-ID genau wie in der Anthropic-Dokumentation, ohne Datumsanhang. Das Modell muss Bilder und strukturierte Ausgabe (JSON-Schema) können. Bei einem anderen Modell die Preise in `logic.ts` (`PRICES_USD_PER_MTOK`) ergänzen, sonst rechnet die Kostenbremse mit dem teuersten Satz. Den Parameter `effort` sendet die Funktion nur an Modelle, die ihn kennen (`supportsEffort`). |
| `EXTRACTOR_LIMIT_USER_PER_DAY` | `20` | Auslesungen je Person und Tag |
| `EXTRACTOR_LIMIT_TOTAL_PER_DAY` | `100` | Auslesungen je Tag im ganzen Büro |
| `EXTRACTOR_MONTHLY_BUDGET_EUR` | `20` | geschätztes Monatsbudget in Euro |
| `EXTRACTOR_USD_EUR` | `1.0` | Umrechnung der Dollar-Listenpreise; 1,0 schätzt eher zu hoch |
| `EXTRACTOR_STRICT` | `true` | `false` verzichtet ganz auf die Schema-Bindung: die Anweisung verlangt reines JSON, die Funktion prüft es. Nur nötig, wenn der Dienst auch das kleine Schema ablehnt. |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Funktion von selbst bereit.

## Wie die Funktion absichert

Reihenfolge je Aufruf, der KI-Dienst kommt zuletzt:

1. Anmeldung: das Token wird beim Auth-Dienst geprüft. (Die Vorprüfung der Plattform ist in `supabase/config.toml`
   aus, weil sie mit den neuen Signaturschlüsseln gültige Anmeldungen abweisen kann; die Funktion prüft selbst.)
2. Rolle aus `user_roles`: nur `admin` und `mitarbeiter`. Freiberufler und Konten ohne Rolle bekommen 403.
3. `EXTRACTOR_ENABLED`: sonst "Auslesung noch nicht freigeschaltet", kein Aufruf.
4. Eingabe: höchstens 2 Bilder, JPEG oder PNG, je höchstens 5 MB (Grenze des KI-Dienstes) und 2576 px Kantenlänge.
   Geprüft wird der Kopf der Bilddatei: Typ und Pixelmaße müssen stimmen. Die App sendet Seiten mit höchstens 1568 px
   als JPEG (Qualität 85), das sind typischerweise 150 bis 500 kB.
5. Kostenbremse: Zählung in `extraction_log`. Bei Überschreitung "Tageslimit erreicht" bzw. "Monatsbudget erreicht",
   kein Aufruf.
6. Aufruf mit `max_tokens` 2000 und Zeitlimit 60 Sekunden je Aufruf. Die Antwort ist an ein kleines JSON-Schema gebunden:
   ein flaches Array `felder` mit Einträgen `{feld, wert, quelle, seite, sicherheit}` und `hinweise`. Die erlaubten
   Feldnamen und Sicherheitsstufen stehen in der Anweisung, nicht im Schema (ein Schema mit einem Unterobjekt je Feld
   lehnt der KI-Dienst als zu groß ab: "The compiled grammar is too large").
7. Die Funktion prüft die Antwort selbst: unbekannte Feldnamen werden verworfen (auch z. B. ein Geburtsdatum), die
   Sicherheitsstufe wird vereinheitlicht, fehlende Felder gelten als leer. Erst danach geht das Ergebnis im gewohnten
   Format `{wert, quelle, sicherheit}` je Feld an die App.
8. Ausweichweg: Lehnt der Dienst das Schema selbst ab, versucht die Funktion es genau einmal ohne Schema-Bindung
   (die Anweisung verlangt dann reines JSON). Ist eine Antwort kein gültiges JSON, fragt sie genau einmal nach.
   Je Auslesung also höchstens drei Aufrufe; ihr Verbrauch wird zusammengezählt und zählt als eine Auslesung.

`extraction_log` enthält nur Person, Zeit, Modell, Bildanzahl, Tokens, geschätzte Kosten und ob es geklappt hat.
Bilder und Feldwerte stehen weder dort noch in den Logs der Funktion. Die Logs der Funktion (Dashboard → Edge Functions →
extract-project → Logs) enthalten je Aufruf eine Zeile mit Modell, Pixelmaßen und Dateigröße der Bilder und, wenn der
KI-Dienst ablehnt, Status, Fehlertyp und Fehlermeldung des Dienstes (z. B. `invalid_request_error` mit dem betroffenen
Parameter). Lange Zeichenfolgen und Schlüssel werden aus der Meldung entfernt. Schreiben kann
die Tabelle nur die Funktion (service_role); Admins dürfen lesen, sonst niemand.

Die Kosten sind eine Schätzung aus Tokens und Listenpreis. Maßgeblich ist die Abrechnung in der Anthropic Console;
dort lässt sich zusätzlich ein hartes Ausgabenlimit setzen (empfohlen).

## Was ausgelesen wird und was nicht

- Aus dem Werkvertrag: Bauherr 1 und 2 (Name, Telefon, E-Mail), Wohnanschrift, Rechtsform, Hausbaufirma,
  Vertragsdatum, Vertragspreis, Angebotsnummer, Haustyp, Hinweis auf KfW/WEF-Förderung.
- **Nie** aus dem Werkvertrag: Bauadresse, Bauort, Flurstück, Gemarkung (stehen dort nicht; die Anschrift ist die
  Wohnanschrift). Die App verwirft solche Werte zusätzlich selbst (`normalizeFields`).
- **Nie:** Geburtsdatum, Beruf, Bankverbindung, Ausweisdaten. Dafür gibt es weder Felder noch Spalten.
- Die Hausbau-Nr. wird nicht geraten (offene Frage, siehe `docs/offene-fragen.md`).
- Scans und Handschrift: Sicherheit höchstens "mittel"; Telefon und E-Mail sind in der Prüfmaske immer markiert.
- Vertragsdatum, Vertragspreis, Angebotsnummer und Haustyp werden als Metadaten am Dokument gespeichert
  (`documents.meta`), nicht am Projekt. Der Vertragspreis belegt keine Rechnungen vor.
- Blättern, Zoomen und die Seiten-Übersicht in der Vorschau senden nichts: die Seiten werden nur im Browser gerendert.
  Eine weitere Seite geht nur über den Knopf "Diese Seite lesen" an den KI-Dienst (für den Haustyp), und dann genau
  diese eine.
- DOCX hat kein Seitenbild: dort liest die App den Text weiterhin lokal, ohne Aufruf.

## Nicht eingeschaltet: Ausweichmodell bei Ablehnung

Lehnt das Modell eine Anfrage ab, meldet die Funktion "konnte nicht ausgelesen werden" und die App bietet die
manuelle Anlage an. Die API könnte in diesem Fall automatisch auf ein anderes Modell ausweichen (`fallbacks`). Das ist
bewusst aus, weil das Ausweichmodell zu anderen Preisen abrechnet und die Kostenbremse dann falsch schätzt.

## Fehlerbilder

| Meldung in der App | Ursache | Abhilfe |
|---|---|---|
| "Auslesung noch nicht freigeschaltet" | `EXTRACTOR_ENABLED` ist nicht `true`, oder der Schlüssel fehlt bzw. ist ungültig | Secrets prüfen (`supabase secrets list`) |
| "Tageslimit erreicht" / "Monatsbudget … erreicht" | Kostenbremse | morgen erneut, oder Limit per Secret anheben |
| "Der KI-Dienst hat die Anfrage abgelehnt (…)" | Fehler 400 des KI-Dienstes: ungültiger Parameter, Modell nicht verfügbar, Guthaben aufgebraucht o. Ä. | Log der Funktion lesen: die Zeile "KI-Dienst: Fehler 400 · Typ · Meldung" nennt den Grund |
| "Die Auslesung lieferte kein verwertbares Ergebnis" | Antwort war auch nach einer Nachfrage kein gültiges JSON | erneut versuchen; tritt es öfter auf, im Log nachsehen und `EXTRACTOR_STRICT` prüfen |
| "Die Auslesung ist gerade nicht erreichbar" | Funktion nicht deployt oder Netzfehler | `supabase functions deploy extract-project`, Logs im Dashboard unter Edge Functions |
| "Keine Berechtigung für diese Aktion" | Konto ist Freiberufler oder hat keine Rolle | gewollt |
| "Die erste Seite ließ sich nicht als Bild lesen" | beschädigtes oder geschütztes PDF | Seite als JPG/PNG fotografieren oder von Hand anlegen |
