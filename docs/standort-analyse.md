# Standortangaben fürs Planungsprotokoll

Die Edge Function `standort-analyse` ermittelt aus Bauort und Bauadresse eines Projekts Vorschläge. Sie liest nie die Anschrift des
Bauherrn. Ins PDF kommt nur, was im Reiter Planungsprotokoll mit „Alle übernehmen“ gespeichert wurde (Tabelle `standort_angaben`).
Solange für ein Projekt nichts übernommen ist, startet die Ermittlung beim Öffnen des Reiters von selbst (einmal je Aufruf);
Übernehmen bleibt ein bewusster Klick. Antworten aus dem Cache zählen nicht zum Tageslimit.
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
| Adresse | [Photon](https://photon.komoot.io) (komoot), Daten OpenStreetMap | ODbL, Namensnennung. Laut Anbieter Fair Use, „extensive usage will be throttled“, keine Verfügbarkeitszusage, keine Lizenzangabe zum Dienst selbst. | Haus, Straße oder Ort (wird gemeldet). Photon sucht unscharf: Es zählt nur ein Treffer mit gleicher Straße und im Ort des Projekts. |
| Gemeindeverwaltung (Seite 1) | Statistische Ämter des Bundes und der Länder, [Anschriften der Gemeinde- und Stadtverwaltungen](https://www.statistikportal.de/de/veroeffentlichungen/anschriftenverzeichnis) (Stand 31.01.2026), eingebaut als `verwaltungen.ts` | „Die Nutzung der Daten ist uneingeschränkt“, Vervielfältigung und Verbreitung mit Quellenangabe gestattet. | Über den Gemeindeschlüssel. Name der Verwaltung, Anschrift, E-Mail (fehlt bei 210 von 3578), **kein Telefon**. Bei Mitgliedern einer Verwaltungsgemeinschaft die Verwaltung der Gemeinde selbst. |
| Gemeinde | Statistisches Bundesamt, Gemeindeverzeichnis GV-ISys (Stand 30.09.2026), eingebaut als `gemeinden.ts` | „Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet.“ | Über den Namen aus der Adresssuche, bei Namensgleichheit die nächste Gemeinde. Unklar: nicht ermittelbar. |
| Schneelast | DIBt, Zuordnung nach Verwaltungsgrenzen (Stand 07.02.2023), eingebaut als `zonen.ts` | Auf der Seite keine Lizenz genannt. Verbindlich sind laut DIBt die Bekanntmachungen der Länder. | Gemeinde bzw. Kreis. Die Städte Ulm und Kassel stehen nicht in der Tabelle. |
| Erdbeben | DIBt, Zuordnung (Stand 02.06.2022), BY und HE | wie oben | Gemarkung. BW fehlt: Das Land verweist nur auf die Karte 1:350 000. |
| Höhe | EU-DEM 25 m über Open Topo Data | Copernicus, Quellenangabe nötig. Öffentliche API: 1 Anfrage/s, 1000/Tag, keine Nutzungsbedingungen und keine Verfügbarkeitszusage. | ±7 m RMSE |
| Radon | BW: Liste des Umweltministeriums (15.06.2021). BY: BayMBl. 2021 Nr. 63. HE: laut BfS keine Gebiete. Dazu BfS-WMS Radon-222 in der Bodenluft. | Festlegungen sind Amtsblatt bzw. Ministeriumsliste. BfS-Dienst: Gebühren und Zugriff „NONE“, keine Lizenz genannt. | Gemeinde bzw. Kreis; Bodenluft als Rasterwert (Übersicht). |
| Wasserschutz | BW: LUBW WMS Wasserschutzgebietszone. BY: LfU `wasser/wsg`. HE: HLNUG `bewirtschaftungsgebiete`. | BW: UIS-Nutzungsvereinbarung, „Grundlage: Daten aus dem Umweltinformationssystem (UIS) der LUBW“; WMS-Abfragen dort nicht ausdrücklich geregelt. BY und HE: CC BY 4.0. | Punkt. Nicht rechtsverbindlich. BY ohne Zonen, BW fasst Zone I und II zusammen. |
| Hochwasser | BW: LUBW WMS Überschwemmungsgebiet. BY: LfU `wasser/ueberschwemmungsgebiete`. HE: HLNUG `gebiete_naturbedingter_risiken`. | wie Wasserschutz | HQ100 an kartierten Gewässern, kein Starkregen. |
| Lärm | BW: LUBW ArcGIS-REST `wfs/Umgebungslaermkartierung_Strassenenverkehrslaerm_24_Stunden` (laut UDO-Karte Kartierung 2022), nur Straße, LDEN in 5-dB-Stufen. BY: LfU `laerm/hauptverkehrsstrassen` (2022). HE: HLNUG Umweltatlas, ArcGIS-REST `laerm_oden` (2022). | BW: im Dienst keine Lizenz genannt, wie Wasserschutz (UIS-Nutzungsvereinbarung); bitte klären. BY: CC BY 4.0. HE: im Dienst nur © HLNUG, für andere HLNUG-Dienste CC BY 4.0; bitte klären. | BW: Hauptverkehrsstraßen, für Ulm und Stuttgart keine Werte (Test 10.11.2026), dort kartieren vermutlich die Städte selbst. BY nur außerhalb der Ballungsräume, HE weitgehend alle Straßen. |

Nicht automatisch:

- **Stromversorger:** Es gibt keine amtliche, frei nutzbare Zuordnung von Standort zu Netzbetreiber. Das Marktstammdatenregister führt Betreiber, aber keine Netzgebiete.
- **BKG (VG250, DGM200):** wäre die amtliche Wahl für Gemeindeschlüssel und Höhe, antwortet aber weder von hier noch von Supabase aus (Test 01.11.2026).
- **Nominatim:** sperrt die Server von Supabase („Access denied“, HTTP 403). Deshalb Photon. **Overpass:** Die Regeln nennen eine App als Backend auf den öffentlichen Servern problematisch.

Grenze der Adresssuche: Fehlt die Straße in den OSM-Daten oder ist sie anders geschrieben, gilt der Standort nur als Ort. Zonen und Radon gehen dann, Kartenabfragen nicht.

## Cache und Limit

Fristen je Thema stehen in `logic.ts` (`CACHE_TAGE`): Adresse, Zonen und Höhe 365 Tage, Radon 180, Lärm 90, Wasserschutz und Hochwasser
28. Gespeichert werden nur ermittelte Werte, nie Fehler. Höchstens 20 Analysen mit Abfragen je Person und Tag; Antworten aus dem Cache zählen nicht.

## Zonentabellen erneuern

```
python3 scripts/standort/zonen_erzeugen.py Schneelastzonen_nach_Verwaltungsgrenzen.xlsx Erdbebenzonen_Formular_Untergrundklassen.xlsx
python3 scripts/standort/gemeinden_erzeugen.py AuszugGV3QAktuell.xlsx
python3 scripts/standort/verwaltungen_erzeugen.py 20260131_Anschriften_der_Gemeinde_und_Stadtverwaltungen.xlsx
```

Die Gemeindeverwaltung erscheint in der Liste der Standortangaben als Zeile „Gemeinde (Seite 1)“. Steht im Projekt noch keine
Gemeinde, ist sie angehakt; „Alle übernehmen“ trägt dann Name, Anschrift und E-Mail bei der Beteiligten „Gemeinde“ ein. Eine
schon eingetragene Gemeinde wird nur ersetzt, wenn man die Zeile selbst anhakt (bei derselben Gemeinde bleiben Tel. und Fax).

Das Skript bricht ab, wenn die Tabellen nicht zur erwarteten Form passen. Danach `ZONEN_VERSION` in `logic.ts` hochsetzen und die Tests laufen lassen: Sie prüfen, dass jede namentliche Ausnahme genau eine Gemeinde des Kreises trifft.

## Einrichten

```
npm run db:bundle -- --ab 20
npx supabase db query --linked -f supabase/.out/migrationen-ab-0020.sql
npx supabase functions deploy standort-analyse
```
