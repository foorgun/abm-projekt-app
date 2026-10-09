# Projektordner-Vorlage von ABM

Quelle: Ordner `Ordnerstruktur-1` (die Vorlage, die bei jedem neuen Projekt kopiert wird).
`xx.yy.xxxx`, `tt.mm.jjjj` und ähnliche Platzhalter in Ordnernamen stehen für ein **Datum** und werden
beim Ablegen durch das echte Datum ersetzt. `Firma am xxx` steht für einen Firmennamen mit Datum.

Der Posteingangs-Agent legt Dateien in genau diese Ziele ab. Die Struktur ist in der App als Daten
gespeichert (Tabelle `folder_templates`), damit ABM sie später selbst ändern kann.

```
01 Projektbeteiligte
   Liste.docx                      (Felder: ABM Nr., Hausbau Nr., Bauherr, Bauadresse, Verkäufer, Vermesser, Erdbauer, Strom, Wasser, Elektriker Baustrom)
02 Schriftverkehr
   01 Schriftverkehr mit Bauherrschaft
      01 Überschrift tt.mm.jjjj
      02 BAUANTRAG VERSAND <Nr>
   02 Schriftverkehr mit Hausbaufirma
      01 <Betreff> tt.mm.jjjj
   03 Schriftverkehr mit Amt
      01 Überschrift tt.mm.jjjj
   04 Schriftverkehr mit Vermesser
      01 Überschrift tt.mm.jjjj
      02 amtliche Lagepläne bestellt am xxx
   05 Schriftverkehr mit Clayton
03 Hausbaufirma
04 Vermesser
   01 Vermesser beauftragt am xx.yy.xxxx
   02 Vermesserunterlagen erhalten am xx.yy.xxxx
   03 Geländeprofile
      01 Geländeprofile bestellt am
      02 Geländeprofile erhalten am
05 Entwurf
   01 Entwurf 1 Pläne
   02 Entwurf 2 Pläne
06 Technische Prüfung
07 Vorabzug
   01 Brief
   02 Vorabzugspläne
   03 PP
   04 Formular Bodengutachten
08 Bauantrag
   01 Digitaler Bauantrag
   02 Bauantragspläne
      01 Blanko
         01 PDFs
         02 DWGs
      02 Unterzeichnet
   03 Wohnflächenberechnung
   04 Amtliche Lagepläne
   05 Eingangsbestätigung
      01 Eingangsbestätigung
      02 Unvollständigkeitsmitteilung
   06 Nachforderungen
   07 Deckblatt
      Deckblatt 1 / 01 Pläne
      Deckblatt 2 / 01 Pläne
   08 Entwässerungsantrag
      01 Formular
      02 Pläne
09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige
   01 Baugenehmigung
      01 erhalten am xx.yy.yyyy
   02 Baugenehmigung Entwässerung
   03 Baufreigabe
      01 erhalten am xx.yy.yyyy
      02 verteilt am xx.yy.yyyy
   04 Baubeginnsanzeige
10 Bodengutachten
   Bodengutachten erhalten am xx.xx.yy
11 Baubegleitung
   01 Ausschreibung
      01 Massenermittlung
      02 Ausschreibung versendet
         01 <Firma> am xxx
         02 <Firma 2> am xx
      03 Angebote erhalten
      04 Preisspiegel
         01 Preisspiegel
         02 Preisspiegel versendet am xx.xxx
      05 Vergabe Auftragsbestätigung
   02 Hausanschlüsse
      01 Formular Schumann Haustechnik
      02 Strom
         01 beantragt am xx.yy.xxx
         02 Angebot erhalten am
         03 Auftragsbestätigung
      03 Baustrom
         01 Angebotsabfrage / 01 <Firma> am xyxy
         02 Auftragsbestätigung
      04 Wasser / 01 Wasser beantragt am
      05 Bauwasser / 01 Bauwasser beantragt am
      06 Medien / 01 Medien beauftragt am
      07 Lieferung MSH und Grabarbeiten   (Infos.docx: Wer liefert die Mehrsparten-Hauseinführung? Wer führt die Grabarbeiten aus?)
      08 KG2000,Dichtheitsprüfung,Sichtabnahme   (Infos.docx: KG-2000-Rohre Pflicht? Dichtheitsprüfung? Sichtabnahme? je Ja/Nein)
   03 Ausführungspläne
   04 Bauanlaufgespräch
      01 Einladung versendet / 01 Zusagen, 02 Absagen
      02 Bauanlaufgespräch / 01 Protokoll, 02 Fotos
   05 Vermesser
      01 Grobabsteckung / 01 bestellt am, 02 erhalten am
      02 Feineinmessung / 01 bestellt am, 02 erhalten am
   06 Straßensperrung
      01 Straßensperrung für BP&Keller / 01 beauftragt am, 02 Angebote erhalten am, 03 Auftragsbestätigung
      02 Straßensperrung für Haus / 01 beauftragt am, 02 Angebote erhalten am, 03 Auftragsbestätigung
   07 BP-Kellerbaufirma
      01 Protokoll
      02 Zeitschiene
   09 Hausanschlüsse nach der Hausaufstellung
      01 Einladung versendet
      02 Wasser eingeführt
      03 Strom eingeführt
      04 Medien eingeführt
      05 Baustellenfotos
   10 Baustellentermine
      01 Baustellentermin am / 01 Einladung versendet tt.mm.yyyy, 02 Fotos
```

Hinweise zur Vorlage (für ABM klären):
- Die Nummerierung in 11 Baubegleitung springt von 07 auf 09 (08 fehlt).
- In 02 Schriftverkehr gibt es "mit Clayton" (vermutlich eine Hausbaufirma). Name klären.
- Einige Platzhalter sind uneinheitlich geschrieben (`xx.yy.xxxx`, `tt.mm.yyyy`, `xxy..y`). Die App normalisiert sie zu einem Datumsfeld.
