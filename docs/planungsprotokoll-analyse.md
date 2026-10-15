# Planungsprotokoll: Analyse und Machbarkeitstest

Stand: 14.10.2026 (Analyse und Spike). **Nachtrag 15.10.2026:** Stufe (a) ist gebaut, siehe Abschnitt 6.

Grundlage sind drei ausfüllbare PDF-Vorlagen (AcroForm) der Hausbaufirmen in `vorlagen/planungsprotokoll/`.
Es sind Firmendokumente, deshalb sind sie per `.gitignore` aus dem Repo ausgeschlossen. Die Feldtabelle je Vorlage steht in
[planungsprotokoll-felder.md](planungsprotokoll-felder.md), die JSON-Fassung in `docs/planungsprotokoll/<vorlage>.json`.

Skripte (`scripts/planungsprotokoll/`, Node, devDependencies `pdf-lib`, `@pdf-lib/fontkit`):

| Skript | Zweck |
|---|---|
| `felder.mjs` | Feld-Inventar: Name, Typ, Seite, Position, Gruppe, Beschriftung, Abschnitt → JSON |
| `klassen.mjs` | Klassifizierung und Zuordnung zum Datenmodell (von `felder.mjs` benutzt) |
| `bericht.mjs` | JSON → `docs/planungsprotokoll-felder.md` |
| `befuellen.mjs` | Spike: Seite 1 mit erfundenem Demo-Projekt füllen und prüfen, dass sonst nichts geändert wurde |
| `rendern.mjs` | Seite 1 der befüllten PDFs mit pdf.js als PNG |

Ergebnisse des Spikes liegen in `screenshots/planungsprotokoll/` (nicht im Repo).

## 1. Die Vorlagen im Vergleich

| | Schwabenhaus | Living Haus | Bien-Zenker |
|---|---|---|---|
| Datei | SH-Planungs-Dokumentation, Stand 2026-04 | FB-22-201-03 Planungsprotokoll LH Bauantrag | FB-22-201-03 Planungsprotokoll Bauantrag |
| Seiten | 38 | 24 | 24 |
| Felder (Widgets) | 378 (646) | 423 (423) | 423 (423) |
| Typen | 177 Text, 78 Radio-Gruppen, 119 Checkbox, 4 Bildfelder | 136 Text, 287 Checkbox | 136 Text, 287 Checkbox |
| Feldnamen | sprechend (`BauherrName`, `VermesserTel`, `SLZ`), teils unsauber (`undefined.Dachfarbe`, `Group5`) | durchnummeriert (`Textfeld 1.02`, `Kontrollkästchen 3.13`) | wie Living Haus |
| Ankreuzlogik | echte Radio-Gruppen (eine Antwort je Frage) | lauter Einzel-Checkboxen, „eine Antwort“ ist nicht erzwungen | wie Living Haus |
| Vorbelegt | nichts | 4 Summenfelder der Flächenberechnung (S. 4, `Textfeld 4.09/4.14/4.19/4.24`) | wie Living Haus |
| Formular-JavaScript | keins | nur diese 4 Summenfelder: `AFSimple_Calculate("SUM", …)`, Zahlenformat 2 Nachkommastellen | wie Living Haus |
| Kopffelder auf Folgeseiten | BV-Nr., Bauherr, Bauort wiederholt (S. 29, 37, gleiche Felder) | nein | nein |
| Besonderheiten | 1 Rich-Text-Feld (`WasserschutzgebietAuflagen`), 4 Bildfelder für Fotos/Skizzen | – | – |

**Living Haus und Bien-Zenker sind dieselbe Vorlage** (beide Marken der gleichen Unternehmensgruppe): gleiche
423 Feldnamen in gleicher Reihenfolge, gleiche Abschnitte. Unterschiede nur im Logo, in der Fußzeile, um etwa 6 pt
verschobenen Positionen und in Hinweistexten („Living Haus“ statt „Bien-Zenker“, Abschnitt 7 „Wasserhärtebereich“ bzw.
„Wasserhärtebereich/Regenwassernutzung“). Für die App heißt das: **zwei Formulartypen, nicht drei** – eine Zuordnung
„FB-22“ mit je einer PDF-Datei pro Marke.

### Abschnitte

| Schwabenhaus | Living Haus / Bien-Zenker |
|---|---|
| S. 1–2 Projektbeteiligte (Bauherr, Bauort, Architekt, Vermesser, Baugrundgutachter, Erdbau, Keller, Gemeinde, Bauamt; S. 2 Versorger mit Anschrift) | S. 1 Kopfdaten und Beteiligte (alles auf einer Seite, Versorger ohne Anschrift) |
| 1 Allgemeine Angaben zum Baugrundstück (S. 3–7: Schneelast, Erdbeben, Radon, B-Plan, Dach, Abstandsflächen …) | 1 Allgemeine Angaben für den Bauantrag (S. 2) |
| – | 2 Planungsvorgaben LBO und B-Plan inkl. Flächenberechnung (S. 3–4) |
| – | 3 Angaben zum Bauvorhaben (S. 5) |
| – | 4 Barrierefreiheit DIN 18040-2, 5 Planungsgrundlage (S. 6) |
| 2 Sommerlicher Wärmeschutz | 9 Sommerlicher Wärmeschutz |
| 3 Trinkwasserversorgung | 7 Wasserhärtebereich |
| 4 Entwässerung | 6 Entwässerung |
| – | 8 Bodengutachten |
| 5 Sockeldetails DIN 68800-2 (8 Seiten) | 10 Sockeldetails (7 Seiten) |
| 6 Hausanschlüsse | 11 Hausanschlüsse, 15 Hausanschluss allgemein |
| 7 Montagebedingungen, Zufahrt | 12 Montagebedingungen |
| 8 Heizungssystem | 13 Liefer-/Leistungsumfang Heizung |
| 9 Abgas/Schornstein | 14 Abgas/Schornstein |
| 10 Elektroinstallationen | 16 Elektroinstallation |
| – | 17 Betonfertiggaragen |
| A4 Fertigteilgarage | (in 17) |
| – | 18 Änderungen aus dem Bauantrag |
| 11 Checkliste Bauantragserstellung | 19 Checkliste Bauantragserstellung |
| A1 Nachbarbebauung, A2 Edelstahlschornstein, A3 Fenstereinbau, A5 Warmwasserbedarf, Checkliste Doppel-Wärmepumpe | – |

Nur bei Schwabenhaus: Baugrundgutachter als Beteiligter, Fax für Gemeinde/Bauamt, Anschrift je Versorger, „Sonstige“
Beteiligte, Bildfelder, Anhänge A1–A5, Doppel-Wärmepumpe. Nur bei FB-22: Schornsteinfeger als Beteiligter, LBO/B-Plan
mit Flächenberechnung, Barrierefreiheit, Bodengutachten als eigener Abschnitt, „Änderungen aus dem Bauantrag“.

### Klassifizierung (Felder, nicht Widgets)

| | Schwabenhaus | Living Haus / Bien-Zenker |
|---|---|---|
| aus Projekt/Kontakt vorbefüllbar | 68 | 51 |
| … davon heute im Datenmodell | 9 ja, 14 teilweise, 45 fehlt | 9 ja, 14 teilweise, 28 fehlt |
| manuelle Eingabe | 113 | 85 |
| Ankreuzfeld-Entscheidung | 197 | 287 |

Vorbefüllbar sind praktisch nur die **Kopfdaten und Beteiligten** (SH S. 1–2, FB-22 S. 1). Alles ab Abschnitt 1 ist
Planungsinhalt: Maße, Auflagen, Ja/Nein-Entscheidungen. Davon ließe sich später wenig ableiten (z. B. Bundesland,
Hausbaufirma). Die Beschriftungen in der Feldtabelle stammen aus einer Positions-Heuristik; bei dicht gesetzten
Zeilen erwischt sie gelegentlich das Nachbarwort. Für eine Eingabemaske müssten die Fragen ohnehin von Hand
benannt werden.

## 2. Machbarkeitstest Seite 1

Erfundenes Demo-Projekt (Bauherr „Jörg und Bärbel Müller-Weißgerber“, „Größlestraße 7“, Beteiligte wie „Vermessungsbüro
Kößler“, „Schornsteinfeger Rußwurm“, „Abwasserverband Flußtal“, alle mit `example.de`-Adressen und 0000-Nummern),
gefüllt mit pdf-lib, **nicht flach gemacht**: Die Felder bleiben im PDF bearbeitbar.

| | Schwabenhaus | Living Haus | Bien-Zenker |
|---|---|---|---|
| gesetzte Felder | 40 | 51 | 51 |
| Umlaute ä ö ü ß, Ä Ö Ü | korrekt | korrekt | korrekt |
| andere Felder geändert (Wert, Ankreuzstatus, Erscheinungsbild) | keine (197 Ankreuzfelder geprüft) | keine (287) | keine (287) |

Gelöst bzw. gelernt:

- **Umlaute:** Die Vorlagen verweisen auf Calibri/Helv ohne nutzbare eingebettete Glyphen. Das Skript bettet eine
  Unicode-Schrift ein (Liberation Sans, SIL OFL, liegt `pdfjs-dist` bei) und erzeugt damit die Erscheinungsbilder
  der gesetzten Felder. Für den Produktivbetrieb eine eigene, lizenzklare Schrift einbetten (z. B. die App-Schrift als TTF).
- **Schriftgröße:** Die Vorlagen stehen auf Auto-Größe. In den großen mehrzeiligen Namensfeldern von FB-22 ergab das
  Riesenschrift. Das Skript setzt 9 pt und verkleinert bis 6 pt, bis der Text in die Breite passt.
- **Nur gezielt neu zeichnen:** `save({ updateFieldAppearances: false })`. Sonst zeichnet pdf-lib alle Felder neu,
  dann sähen auch die Ankreuzfelder anders aus.
- **Rich-Text-Feld** (`WasserschutzgebietAuflagen`, SH): pdf-lib kann es nicht lesen und nicht sicher schreiben.
  Nicht befüllen oder vorher in der Vorlage auf Klartext umstellen lassen.
- **Kopffelder auf Folgeseiten** (SH: BV-Nr., Bauherr, Bauort auf S. 29, 37) sind dieselben Felder und werden
  automatisch mitgefüllt.
- **Anzeige in macOS Vorschau:** Vorschau zeichnet Formularfelder selbst neu und bricht dabei mehrzeilige Felder an
  Bindestrichen um. Die E-Mail `mueller-weissgerber@…` erschien dort als „mueller-“. In pdf.js (gleiches Verhalten wie
  Acrobat: gespeichertes Erscheinungsbild) ist alles vollständig. Abhilfe bei Bedarf: zusätzlich eine flach gemachte
  Druckfassung erzeugen.

**Nicht getestet:** Öffnen in Adobe Acrobat/Reader und Weiterbearbeiten dort (nur pdf.js und macOS Vorschau
geprüft), Druck, Annahme der befüllten Datei durch die Hausbaufirmen, Feldwerte mit Zeilenumbrüchen, sehr lange
Namen über die 6-pt-Grenze hinaus, Seiten ab 2. Die Summen der FB-22-Flächenberechnung rechnet nur ein PDF-Programm
mit JavaScript (Acrobat), weder pdf-lib noch pdf.js. Füllt die App diese Seite einmal (Variante c), muss sie die
Summen selbst eintragen.

## 3. Was im Datenmodell fehlt

Heute: `projects` (abm_nr, hausbau_nr, location, flurstueck, gemarkung, architect_id …), `bauherren` (name, address,
phone, email, building_address, name2, phone2, email2), `project_parties` (role ∈ vermesser, erdbauer, strom,
wasser, elektriker_baustrom; name; contact als **eine** Textzeile), `team_members` (name, Kürzel, ohne Kontaktdaten).

Fehlt für Seite 1 (bzw. SH S. 1–2):

1. **Rollen von Beteiligten:** Kellerbauer/Bodenplatte, Baugrundgutachter, Genehmigungsbehörde/Gemeinde, Bauamt/
   Bauaufsicht (SH unterscheidet beide), Schornsteinfeger, Versorger Gas, Fernwärme, Abwasser, Sonstige.
   (`bauherren.basement_builder` und `surveyor` sind Altspalten aus 0001 und werden nicht benutzt.)
2. **Kontaktdaten je Beteiligten getrennt:** Telefon, Mobil, E-Mail, Fax, Anschrift. Heute nur `contact`.
3. **Architekt:** Telefon, Mobil, E-Mail. Entweder je Mitarbeiter in `team_members` oder als Bürodaten von ABM.
4. **Bauherr:** Straße und PLZ/Ort getrennt (heute `address` als eine Zeile), Mobil getrennt von Telefon.
5. **Bauort:** Straße/Baugebiet, PLZ, Ort, Ortsteil/Gemeindeteil, Bundesland, Flur getrennt von Flurstück.
   Heute `building_address` als eine Zeile plus `location`, `flurstueck`, `gemarkung`.
6. **Nummer:** Ob „Projekt-Nr.“ (FB-22) und „Schwabenhaus BV-Nr.“ der `hausbau_nr` entsprechen, ist offen
   (Annahme im Spike: ja).
7. **Protokoll selbst:** Welche Vorlage, Stand, Werte der übrigen Felder, wer wann was eingetragen hat, erzeugte PDFs.

## 4. Vorschlag Datenmodell (nur Vorschlag, keine Migration angelegt)

Leitlinien: bestehende Tabellen erweitern statt ersetzen, alte Spalten bleiben lesbar, RLS wie bei
`project_parties` (parties_read/parties_write), Freiberufler sehen keine Bauherren-Kontaktdaten.

Migration `0013_planungsprotokoll_stammdaten.sql`:

```sql
-- Neue Rollen (Enum erweitern; eigene Transaktion, da ADD VALUE nicht im selben Block nutzbar ist)
alter type public.party_role add value 'kellerbauer';
alter type public.party_role add value 'bodengutachter';
alter type public.party_role add value 'gemeinde';
alter type public.party_role add value 'bauamt';
alter type public.party_role add value 'schornsteinfeger';
alter type public.party_role add value 'gas';
alter type public.party_role add value 'fernwaerme';
alter type public.party_role add value 'abwasser';
alter type public.party_role add value 'sonstige';

-- Kontaktdaten getrennt; "contact" bleibt als Freitext/Notiz
alter table public.project_parties
  add column phone text, add column mobile text, add column email text, add column fax text, add column address text;
grant insert (phone, mobile, email, fax, address), update (phone, mobile, email, fax, address)
  on public.project_parties to authenticated;   -- Zeilenregel: parties_write (0002)

-- Bauherr: Anschrift getrennt, Mobil
alter table public.bauherren
  add column street text, add column postal_code text, add column city text, add column mobile text;

-- Bauort am Projekt (gehört zum Grundstück, nicht zum Bauherrn)
alter table public.projects
  add column site_street text, add column site_postal_code text, add column site_city text,
  add column site_district text, add column site_state text default 'Baden-Württemberg', add column flur text;

-- Architekt: Kontaktdaten je Mitarbeiter (alternativ feste Bürodaten in einer Einstellungstabelle)
alter table public.team_members add column phone text, add column mobile text, add column email text;
```

Migration `0014_planungsprotokolle.sql` (erst für Variante b/c nötig):

```sql
create table public.planning_protocols (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  template    text not null check (template in ('schwabenhaus-2026-04', 'fb22-living-haus', 'fb22-bien-zenker')),
  field_values jsonb not null default '{}',   -- Feldname der Vorlage → Wert (Text, true/false, Radio-Option)
  status      text not null default 'entwurf' check (status in ('entwurf', 'abgegeben')),
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table public.planning_protocols enable row level security;
-- Lesen/Schreiben: admin, mitarbeiter, zugewiesene Freiberufler wie bei den Projekten. Da das Protokoll Bauherren-
-- Kontaktdaten enthält: Kopfdaten nicht in "field_values" speichern, sondern beim Erzeugen aus bauherren lesen
-- (Freiberufler bekommen sie dann über RLS nicht). Plus Tests in supabase/tests/rls_test.sql.
```

Die erzeugten PDFs gehören in den Projektordner (Storage, Ordner laut `docs/ordnerstruktur.md`) und werden nie
überschrieben, sondern als neue Fassung abgelegt.

Spätere Option: Ämter, Gemeinden und Versorger wiederholen sich über Projekte hinweg. Dann ein Adressbuch
`contacts` und `project_parties.contact_id`. Für den Anfang reichen die Felder je Projekt.

## 5. Aufwand

Schätzung für eine Person mit Kenntnis des Codes, inklusive Tests, RLS-Tests, Browserprüfung. Spanne, weil die
Abnahme der PDFs durch die Hausbaufirmen und Acrobat-Verhalten noch unbekannt sind.

| Variante | Umfang | Aufwand |
|---|---|---|
| **(a) Nur Seite 1 automatisch** | Migration 0013, Eingabefelder für neue Rollen/Kontakte im bestehenden Projekt-Bearbeiten, Repo-Methoden (demo + supabase), PDF-Erzeugung im Browser mit pdf-lib (Vorlage aus Storage, Zuordnung aus `klassen.mjs` übernehmen), Button „Planungsprotokoll erzeugen“, Ablage im Projektordner | **3–5 Tage** |
| **(b) Abschnitte 1–3 als Eingabemaske** | zusätzlich Tabelle `planning_protocols` (0014), Maske mit ca. 115 Feldern (SH) bzw. 136 Feldern (FB-22) aus einer gepflegten Feldbeschreibung (Frage, Typ, Optionen, Gruppe), Zwischenspeichern, Exklusivlogik für FB-22-Checkboxen, PDF aus gespeicherten Werten | **+6–9 Tage** (gesamt 9–14) |
| **(c) Alle Abschnitte** | rund 800 Felder in zwei Formularfamilien mit Hand-Benennung jeder Frage, Bildfelder (SH), Rich-Text-Feld, Anhänge A1–A5, Prüfung aller Seiten in Acrobat; Pflege bei jeder neuen Vorlagen-Revision | **+10–15 Tage** (gesamt 19–29) |

Empfehlung: mit (a) beginnen. Der Nutzen steckt in den Kopfdaten, weil sie heute bei jedem Protokoll abgetippt
werden. Die fachlichen Abschnitte füllen Architekt und Bauherr ohnehin gemeinsam im PDF aus. (b) lohnt sich erst,
wenn die Angaben in der App auch weiterverwendet werden (Warnungen, Auswertungen). Risiko bei (b) und (c): Neue
Revisionen der Vorlagen ändern Feldnamen und Seiten. Das Inventar-Skript erkennt das, die Zuordnung muss dann aber
nachgepflegt werden.

## Offene Fragen

- Entspricht „Projekt-Nr.“ (FB-22) bzw. „BV-Nr.“ (Schwabenhaus) der `hausbau_nr`?
- Architekt auf dem Protokoll: der zuständige Mitarbeiter mit eigener Durchwahl oder immer die Bürodaten von ABM?
- Dürfen wir die Vorlagen im Storage ablegen? Wer liefert neue Revisionen?
- Wird ein befülltes, noch bearbeitbares PDF von den Hausbaufirmen angenommen, oder braucht es eine flache Fassung?

## 6. Umsetzung Stufe (a), 15.10.2026

- Reiter „Planungsprotokoll“ im Projekt (nur Admin und Mitarbeiter): Vorlage nach Hausbaufirma (sonst Auswahl), Stand
  „x von y Feldern“, Knöpfe „Planungsprotokoll erzeugen“ (bearbeitbar) und „Flache Fassung erzeugen“, Liste der Fassungen
  mit Download, darunter die Angaben für Seite 1 (Bauherr/Bauort getrennt, Sachbearbeiter, 13 Rollen), alles einklappbar.
- Code: `src/lib/planungsprotokoll/` (`daten.ts` Werte aus dem Projekt, `zuordnung.ts` Feldnamen je Vorlage, `pdf.ts`
  Befüllen, Prüfen, Einbrennen, `erzeugen.ts` im Browser), Reiter `src/pages/project/PlanungsprotokollTab.tsx`,
  Einstellungen `src/pages/Einstellungen.tsx` (Bürodaten).
- Datenbank: Migration 0013 (Rollen als Text mit Prüfregel, getrennte Kontaktfelder, Bauherr/Bauort getrennt, Flur,
  Bürodaten, Datenübernahme) und 0014 (Tabelle `planungsprotokolle`, privater Bucket `vorlagen`).
- Eigene Einbrenn-Funktion statt `form.flatten()` von pdf-lib, das an Feldern dieser Vorlagen abbricht. Pixelvergleich
  bearbeitbar gegen flach (pdf.js, alle Seiten): Living Haus und Bien-Zenker gleich; Schwabenhaus nur auf Seite 4
  Kantenpixel an den Rahmen der vier leeren Bildfelder.
