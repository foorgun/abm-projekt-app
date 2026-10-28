# Neues Projekt aus einem Vertrag: KI-Auslesung einrichten

Im Dialog "Neues Projekt" lassen sich mehrere Dokumente auf einmal ablegen, typisch Werkvertrag und Vermesservertrag
(PDF, DOCX oder Bild, höchstens 30 MB je Datei). Jede Datei wird zuerst gespeichert (Entwurf, `project_draft_files`)
und dann einzeln ausgelesen, mit dem Schema ihrer Dokumentart. Die App führt die Ergebnisse zusammen, ein Mensch prüft
jedes Feld und bestätigt. Ohne diese Einrichtung arbeitet die App mit dem Mock: Er liest nur Text-PDFs und DOCX im
Browser, Scans kann er nicht lesen.

Die echte Auslesung macht die Edge Function `extract-project` (`supabase/functions/extract-project/`). Sie bekommt je
Dokument **die ersten zwei Seiten** als Bild (auf Wunsch eine weitere Seite, z. B. die Plan-Seite für den Haustyp), ruft
damit ein Bildmodell von Anthropic auf und gibt je Feld `{wert, quelle, sicherheit}` zurück. Ein Dokument = ein Aufruf =
eine Auslesung im Tageslimit.

### Mehrere Dokumente: Ablauf

1. Dateien wählen oder hineinziehen (mehrere auf einmal). Je Datei zeigt die Liste Name, Größe, Fortschritt (gespeichert,
   KI liest, ausgelesen), die von der KI vorgeschlagene Dokumentart (änderbar) und "Entfernen".
2. Über 30 MB oder falscher Typ: abgelehnt, nicht gespeichert, nicht ausgelesen. Scheitert die Auslesung (Limit,
   beschädigt, Dienst nicht erreichbar), bleibt die Datei gespeichert, die Meldung nennt Datei und Grund, und sie wird
   mit dem Projekt abgelegt. Die Ergebnisse der anderen Dateien bleiben.
3. Schema je Art (`FIELDS_BY_TYPE`, in App und Funktion gleich, per Test geprüft): Werkvertrag liefert Bauherr,
   Hausbaufirma und Vertragsdaten, nie das Grundstück; Vermesservertrag und Baugrundauftrag liefern Bauort und Grundstück;
   Honorarvereinbarung Bauherr und Bauvorhaben. Wird die Art geändert, fallen nicht passende Felder weg, und die App
   bietet an, die Datei mit der neuen Art erneut zu lesen.
4. Zusammenführen (`src/lib/extract/merge.ts`): gleicher Wert in mehreren Dokumenten (Schreibweise und Leerzeichen
   egal, Telefon nur Ziffern) wird übernommen. Abweichende Werte zeigt die Prüfmaske mit Quelle ("aus Werkvertrag" /
   "aus Vermesservertrag"); der Mensch wählt, vorher lässt sich das Projekt nicht anlegen. Jedes Feld nennt seine Quelle.
   Vertragsdatum, Preis, Angebotsnummer und Haustyp bleiben beim jeweiligen Dokument.
5. Anlegen: jedes Dokument wird im Ordner seiner Art abgelegt (Werkvertrag und Honorarvereinbarung "00 Verträge",
   Vermesservertrag "04 Vermesser", Baugrundauftrag "10 Bodengutachten").

Keine stille Kürzung: Die Prüfmaske nennt je Dokument, welche Seiten gelesen wurden ("Seiten 1–2 von 9 gelesen").
Ist ein Seitenbild über 5 MB, rendert die App es kleiner (1024 statt 1568 px); reicht das nicht, meldet sie es.

### Grenzen der Anthropic-API (geprüft am 28.10.2026, Dokumentation "PDF support" und "Vision")

| Grenze | Wert | Bedeutung hier |
|---|---|---|
| Anfragegröße | 32 MB (Standard-Endpunkte) | je Aufruf höchstens 4 Seitenbilder à typisch 150–500 kB: weit darunter |
| PDF-Seiten je Anfrage | 600, bei Kontextfenster unter 1 Mio. Token 100 | nicht berührt: die App sendet Seitenbilder, keine PDFs |
| PDF-Kosten | je Seite Text (1.500–3.000 Token) plus Bild | Grund, keine ganzen PDFs zu senden |
| Bild je Datei | 10 MB (Base64) auf der Claude API, 5 MB auf Bedrock | die Funktion lässt 5 MB zu (strenger) |
| Bildmaße | höchstens 8000 × 8000 px; ab 21 Bildern je Anfrage höchstens 2000 px | die App sendet höchstens 1568 px |
| Bilder je Anfrage | 100 (Modelle mit 200k Kontext) bzw. 600 | höchstens 4 |
| Auflösung | Claude 4.7 und neuer: bis 2576 px lange Kante, sonst 1568 px | 1568 px genügt für Vertragsseiten |

### Grenzen von Supabase

- Speicher: projektweite Grenze je Datei im Free-Plan höchstens 50 MB, ab Pro bis 500 GB (Dashboard → Storage →
  Settings). Die Buckets haben keine eigene Grenze (`file_size_limit` leer); 30 MB passen in beiden Plänen.
- Edge Functions: 256 MB Speicher, 2 s CPU-Zeit, 150 s Laufzeit (Free) bzw. 400 s (bezahlte Pläne). Eine
  Grenze für die Größe der Anfrage nennt die Dokumentation nicht. Die Funktion bekommt nur Seitenbilder (unter 5 MB je
  Bild), nie die Originaldatei.

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
4. Eingabe: höchstens 4 Bilder, JPEG oder PNG, je höchstens 5 MB und 2576 px Kantenlänge; optional Dokumentart
   und Datei-ID des Entwurfs (die Datei muss es geben).
   Geprüft wird der Kopf der Bilddatei: Typ und Pixelmaße müssen stimmen. Die App sendet Seiten mit höchstens 1568 px
   als JPEG (Qualität 85), das sind typischerweise 150 bis 500 kB.
5. Kostenbremse: Zählung in `extraction_log`, jedes Dokument zählt einzeln (20 je Person und Tag, 100 im Büro, 20 € im
   Monat). Bei Überschreitung eine verständliche Meldung (wer, wie viele, dass die Datei gespeichert bleibt), kein Aufruf.
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

`extraction_log` enthält nur Person, Zeit, Modell, Bildanzahl, Tokens, geschätzte Kosten, ob es geklappt hat, die
Dokumentart und die Datei im Entwurf (darüber Kosten je Projekt, sobald der Entwurf übernommen ist). Admins sehen die
Kosten je Monat und je Projekt unter Einstellungen → "KI-Auslesung: Kosten" (Ansichten `extraction_costs_by_month`,
`extraction_costs_by_project`).
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
  Eine weitere Seite geht nur über den Knopf "Diese Seite lesen" an den KI-Dienst (z. B. für den Haustyp), und dann genau
  diese eine; sie ergänzt nur leere Felder und zählt als weitere Auslesung.
- DOCX hat kein Seitenbild: dort liest die App den Text weiterhin lokal, ohne Aufruf.

## Nicht eingeschaltet: Ausweichmodell bei Ablehnung

Lehnt das Modell eine Anfrage ab, meldet die Funktion "konnte nicht ausgelesen werden" und die App bietet die
manuelle Anlage an. Die API könnte in diesem Fall automatisch auf ein anderes Modell ausweichen (`fallbacks`). Das ist
bewusst aus, weil das Ausweichmodell zu anderen Preisen abrechnet und die Kostenbremse dann falsch schätzt.

## Fehlerbilder

| Meldung in der App | Ursache | Abhilfe |
|---|---|---|
| "Auslesung noch nicht freigeschaltet" | `EXTRACTOR_ENABLED` ist nicht `true`, oder der Schlüssel fehlt bzw. ist ungültig | Secrets prüfen (`supabase secrets list`) |
| "Dein Tageslimit ist erreicht" / "Tageslimit des Büros" / "Monatsbudget … aufgebraucht" | Kostenbremse (jedes Dokument zählt) | Felder von Hand ausfüllen, morgen bzw. ab dem Monatsersten erneut, oder Limit per Secret anheben |
| "Nicht angemeldet: Es wurde keine Sitzung mitgeschickt" / "Sitzung abgelaufen" | Anmeldung im Browser verloren oder abgelaufen | die App frischt die Sitzung vorher auf und versucht es einmal erneut; sonst neu anmelden, die Dateien bleiben im Entwurf |
| "Der KI-Dienst hat die Anfrage abgelehnt (…)" | Fehler 400 des KI-Dienstes: ungültiger Parameter, Modell nicht verfügbar, Guthaben aufgebraucht o. Ä. | Log der Funktion lesen: die Zeile "KI-Dienst: Fehler 400 · Typ · Meldung" nennt den Grund |
| "Die Auslesung lieferte kein verwertbares Ergebnis" | Antwort war auch nach einer Nachfrage kein gültiges JSON | erneut versuchen; tritt es öfter auf, im Log nachsehen und `EXTRACTOR_STRICT` prüfen |
| "Die Auslesung ist gerade nicht erreichbar" | Funktion nicht deployt oder Netzfehler | `supabase functions deploy extract-project`, Logs im Dashboard unter Edge Functions |
| "Keine Berechtigung für diese Aktion" | Konto ist Freiberufler oder hat keine Rolle | gewollt |
| "Die Datei ließ sich nicht als Bild darstellen" | beschädigtes oder mit Passwort geschütztes PDF | Seite als JPG/PNG fotografieren oder von Hand ausfüllen; die Datei wird trotzdem abgelegt |
