# Standortangaben fürs Planungsprotokoll

Die Edge Function `standort-analyse` ermittelt aus Bauort und Bauadresse eines Projekts Vorschläge. Sie liest nie die Anschrift des
Bauherrn. Ins PDF kommt nur, was im Reiter Planungsprotokoll mit „Alle übernehmen“ gespeichert wurde (Tabelle `standort_angaben`).
Länder: BW, BY, HE. Andere Länder bekommen die Meldung „noch nicht verfügbar“.

## Felder in den Vorlagen

| Thema | Schwabenhaus (S. 3) | Living Haus, Bien-Zenker (S. 2) |
|---|---|---|
| Schneelastzone | Radio `SLZ`: 1, 1a, 2, 2a, 3 | Kontrollkästchen 2.03 bis 2.07: 1, 1a, 2, 2a, 3 |
| Erdbebenzone | Radio `Erdbebenzone`: 0, 1, 2, 3 | Kontrollkästchen 2.11 bis 2.15: keine, 0, 1, 2, 3 |
| Wasserschutz | Radio `Wasserschutz` (ein Kreis) | Kontrollkästchen 2.16 bis 2.19: keine, 1, 2, 3 |
| Radon | Radio `Radon`: ja, nein | kein Feld |
| Hochwasser | kein Feld | kein Feld |
| Lärm | nur „Schallschutz Auflagen seitens B-Plan“ | Lärmpegelbereiche I bis V nach DIN 4109 |
| Stromversorger | Beteiligte `StromName` usw. | Beteiligte, Textfeld 1.22 usw. |
| Höhe | `undefined.Text2` „Höhe über NHN“ | Textfeld 2.01 „Höhe über NN“ mit Nullpunkt RFB/FFB |

Bewusst nicht ins PDF:

- **Lärm:** Die Lärmkartierung liefert Pegel an Hauptverkehrsstraßen, keinen Lärmpegelbereich nach DIN 4109.
- **Höhe:** Das Geländemodell ist auf etwa ±7 m genau. Das ist kein Vermesserwert für einen Nullpunkt.
- **Wasserschutz-Auflagen (Schwabenhaus):** Rich-Text-Feld, wird nicht beschrieben.
- **Zone 3a und >3a:** In den Vorlagen gibt es dafür kein Kästchen. Die App meldet, dass der Wert von Hand zu vermerken ist.

Schwabenhaus legt jede Radio-Auswahl dreifach übereinander. Gesetzt wird die oberste Lage, sonst verdeckt ein leeres Kästchen das Kreuz.

## Quellen

| Thema | Quelle | Lizenz, Bedingungen | Genauigkeit |
|---|---|---|---|
| Adresse | OpenStreetMap Nominatim (`search`, `reverse`) | ODbL, Namensnennung. Höchstens 1 Anfrage/s, eigener User-Agent, Cache, abschaltbar (Secret `STANDORT_NOMINATIM_AUS=1`), kein Massenabruf. Keine Zusage, Zugang kann entzogen werden. | Hausnummer, Straße oder Ort (wird gemeldet). Gemeindeschlüssel aus OSM-Merkmalen. |
| Schneelast | DIBt, Zuordnung nach Verwaltungsgrenzen (Stand 07.02.2023), eingebaut als `zonen.ts` | Auf der Seite keine Lizenz genannt. Verbindlich sind laut DIBt die Bekanntmachungen der Länder. | Gemeinde bzw. Kreis. Stadtkreis Ulm steht nicht in der Tabelle. |
| Erdbeben | DIBt, Zuordnung (Stand 02.06.2022), BY und HE | wie oben | Gemarkung. BW fehlt: Das Land verweist nur auf die Karte 1:350 000. |
| Höhe | EU-DEM 25 m über Open Topo Data | Copernicus, Quellenangabe nötig. Öffentliche API: 1 Anfrage/s, 1000/Tag, keine Nutzungsbedingungen und keine Verfügbarkeitszusage. | ±7 m RMSE |
| Radon | BW: Liste des Umweltministeriums (15.06.2021). BY: BayMBl. 2021 Nr. 63. HE: laut BfS keine Gebiete. Dazu BfS-WMS Radon-222 in der Bodenluft. | Festlegungen sind Amtsblatt bzw. Ministeriumsliste. BfS-Dienst: Gebühren und Zugriff „NONE“, keine Lizenz genannt. | Gemeinde bzw. Kreis; Bodenluft als Rasterwert (Übersicht). |
| Wasserschutz | BW: LUBW WMS Wasserschutzgebietszone. BY: LfU `wasser/wsg`. HE: HLNUG `bewirtschaftungsgebiete`. | BW: UIS-Nutzungsvereinbarung, „Grundlage: Daten aus dem Umweltinformationssystem (UIS) der LUBW“; WMS-Abfragen dort nicht ausdrücklich geregelt. BY und HE: CC BY 4.0. | Punkt. Nicht rechtsverbindlich. BY ohne Zonen, BW fasst Zone I und II zusammen. |
| Hochwasser | BW: LUBW WMS Überschwemmungsgebiet. BY: LfU `wasser/ueberschwemmungsgebiete`. HE: HLNUG `gebiete_naturbedingter_risiken`. | wie Wasserschutz | HQ100 an kartierten Gewässern, kein Starkregen. |
| Lärm | BY: LfU `laerm/hauptverkehrsstrassen` (2022). HE: HLNUG Umweltatlas, ArcGIS-REST `laerm_oden` (2022). | BY: CC BY 4.0. HE: im Dienst nur © HLNUG, für andere HLNUG-Dienste CC BY 4.0; bitte klären. | BY nur außerhalb der Ballungsräume, HE weitgehend alle Straßen. |

Nicht automatisch:

- **Lärm BW:** Einen LUBW-Dienst gibt es nicht. Die Straßenlärm-Ebenen des UBA-WMS (`VeLa/LK`) haben im Test (01.11.2026) innerhalb von 40 bis 60 s nicht geantwortet.
- **Stromversorger:** Es gibt keine amtliche, frei nutzbare Zuordnung von Standort zu Netzbetreiber. Das Marktstammdatenregister führt Betreiber, aber keine Netzgebiete.
- **BKG (VG250, DGM200):** wäre die amtliche Wahl für Gemeindeschlüssel und Höhe, war beim Bau aber von hier nicht erreichbar und ist deshalb nicht eingebaut.

## Cache und Limit

Fristen je Thema stehen in `logic.ts` (`CACHE_TAGE`): Adresse, Zonen und Höhe 365 Tage, Radon 180, Lärm 90, Wasserschutz und Hochwasser
28. Gespeichert werden nur ermittelte Werte, nie Fehler. Höchstens 20 Analysen mit Abfragen je Person und Tag; Antworten aus dem Cache zählen nicht.

## Zonentabellen erneuern

```
python3 scripts/standort/zonen_erzeugen.py Schneelastzonen_nach_Verwaltungsgrenzen.xlsx Erdbebenzonen_Formular_Untergrundklassen.xlsx
```

Das Skript bricht ab, wenn die Tabellen nicht zur erwarteten Form passen. Danach `ZONEN_VERSION` in `logic.ts` hochsetzen.

## Einrichten

```
npm run db:bundle -- --ab 20
npx supabase db query --linked -f supabase/.out/migrationen-ab-0020.sql
npx supabase functions deploy standort-analyse
```
