# Offene Fragen an ABM

Nicht geraten, sondern gesammelt. Antworten bitte direkt hier eintragen.

- Welche Phasen und Schritte gelten wirklich, und in welcher Reihenfolge? (Vorschlag in BUILD.md Abschnitt 6, im Demo so umgesetzt)
- Wann wird welche Rechnung gestellt (Meilensteine, Beträge)? Ab wann gilt sie als überfällig?
- Warn-Schwellen 7 / 21 / 42 / 120 Tage sind Annahmen. Passen sie?
- Was bedeuten "3.1+3.2" und die Werte in "Baubetreuung" aus der Excel-Liste?
- Planer: intern oder freiberuflich? Volle Namen der Architekten (BE, MC)?
- Wer ist "Clayton" (Ordner "Schriftverkehr mit Clayton")?
- Ordnervorlage: In "11 Baubegleitung" fehlt die Nummer 08. Absicht oder Lücke?
- Welche Postfächer soll der Agent überwachen (Sammelpostfach, persönliche)? Wer verwaltet Microsoft 365 (App-Registrierung, Admin-Zustimmung)?
- Dürfen Mailtexte (Auszüge) an einen KI-Dienst gesendet werden? AVV vorhanden?
- Backup des Fileservers: wo, wie oft, Wiederherstellung getestet?
- Ordner mit Namens-Platzhaltern (`<Firma> am …`, `<Betreff> …`, `BAUANTRAG VERSAND <Nr>`): Soll der Agent dort je ablegen,
  oder nur Menschen von Hand?
- `08 Bauantrag/02 Bauantragspläne/01 Blanko/02 DWGs` liegt in der Vorlage, aber CAD-Dateien bleiben laut Regel auf dem
  Fileserver. Ordner in der App ausblenden oder nur als Hinweis zeigen?
- Wer pflegt Aufgaben: auch Freiberufler (eigene Aufgaben), oder nur Mitarbeiter? (Im Prototyp: nur Mitarbeiter.)
- Agent: Sollen Mails ohne Anhang mit Projektbezug (z. B. Rückfrage vom Amt) als Aufgabe oder in der Prüfliste landen?
- Agent: Passen die Sicherheitswerte (z. B. Nachname + Ort = 85 %, also immer Prüfliste)? Nach dem Testlauf mit 20 echten Mails anpassen.
- Agent: Wer darf Regeln anlegen und Schwellen ändern (im Prototyp: Regeln alle Mitarbeiter, Schwellen nur Admin)?
- Rechnungen: Ab wann gilt eine Rechnung als fällig zum Versand (im Prototyp 7 Tage nach dem auslösenden Schritt)? Welche Rechnungen
  gibt es je Projekt (im Prototyp: Abschlag Vorplanung, Genehmigungsplanung, Ausführungsplanung/Baubegleitung, Schlussrechnung)?
- Rechnungen: Soll auch "bezahlt" in der App gepflegt werden, oder kommt das später aus der Buchhaltung?
- Rechnungen: Es gibt kein Zahlungsziel. Deshalb kennt die App nur "Nicht versendet" (fällig, noch nicht raus) und "Offen"
  (versendet, nicht bezahlt), aber kein "überfällig" im Sinn von "Kunde zahlt nicht". Späterer Schritt: Feld Zahlungsziel je Rechnung
  (Datum oder Tage ab Versand, eigene Migration), daraus "überfällig" als Kennzahl und als Warnung. Welche Frist gilt bei ABM (14 Tage?)?

## Zu Schritt 8 (Supabase)

- Vertrag zur Auftragsverarbeitung (AVV) mit Supabase: liegt er vor bzw. lässt er sich im Free-Tarif abschließen? Vor echten Bauherren-Daten klären.
- Wechsel auf den Pro-Tarif: wann, und wer zahlt (Backups, keine Pause)?
- Sollen Admins Rollen und Projektzuweisungen in der App pflegen (Nutzerverwaltung), oder reicht Skript/Dashboard?
- Passwörter: Mindestlänge und Regeln im Dashboard festlegen (Authentication → Passwords). Zwei-Faktor-Anmeldung gewünscht?
- Wird ein Dokument in der Prüfliste in ein anderes Projekt verschoben, bleibt die Datei im Speicher unter der alten Projekt-ID liegen.
  Das muss der Agent in Schritt 9 lösen (Datei mit verschieben), sonst passt die Zugriffsregel des Speichers nicht mehr.
- Nummernkreise der Hausbaufirmen (z. B. 8161 für Bien-Zenker?): stimmen die Zuordnungen aus der Demo? Erst mit bestätigtem
  Nummernkreis schlägt die App die nächste freie ABM-Nr. vor. Schreibweise der Firmennamen muss zur Excel-Liste passen (Import).
- Soll die Aufgabe "Fehlende Angaben nachfragen" nach 7 Tagen fällig sein, und an wen geht sie, wenn kein Architekt gewählt ist?
- Sicherung: Sollen auch die Dateien aus dem Speicher gesichert werden, und wohin? Wer führt `export:backup` wie oft aus?
  Ein Skript zur Wiederherstellung aus der Sicherung gibt es noch nicht.

## Zu "Neues Projekt aus einem Vertrag"

- **Ablageort des Werkvertrags:** vorläufig der neue Ordner `00 Verträge` (Migration 0010, `docs/ordnerstruktur.md`). Wo legt ABM
  den Werkvertrag heute ab? Sobald das klar ist: Ordner in der Vorlage umbenennen bzw. `CONTRACT_FOLDER` in
  `src/lib/extract/filing.ts` anpassen (eigene Migration). Dokumente vom Typ "Sonstiges" landen bis dahin ebenfalls dort.
- **Hausbau-Nr.:** Steht sie im Werkvertrag, und ist sie dieselbe Nummer wie die Angebotsnummer? Bis das geklärt ist, bleibt das
  Feld beim Anlegen aus einem Vertrag leer (es wird nicht geraten); die Angebotsnummer steht als Metadatum am Dokument.
- **Vermessungsauftrag erzeugen:** Der Vermessungsauftrag ist eine leere Vorlage, die ABM ausfüllt, kein Dokument zum Auslesen.
  Spätere Funktion: den Auftrag aus den Projektdaten (Bauherr, Baugrundstück, Flurstück, Gemarkung, Vermesser) vorausgefüllt als
  PDF erzeugen. Noch nicht gebaut. Dafür braucht es die Vorlage des jeweiligen Vermessungsbüros und die Liste der Leistungen.
- **KfW/WEF-Förderung:** Ist sie im Vertrag angekreuzt, zeigt die Prüfmaske die Frist (15 Monate ab Vertragsdatum) nur als Hinweis.
  Soll daraus eine Aufgabe oder Warnung werden, und stimmt die Frist für alle Hausbaufirmen?
- **Baugrundstück:** Bauadresse, Flurstück und Gemarkung stehen nicht im Werkvertrag. Kommen sie verlässlich aus der Mail des
  Verkäufers oder erst aus dem Vermessungsauftrag? Davon hängt ab, ob der Posteingangs-Agent sie später vorschlagen kann.
- **Zweiter Bauherr:** gespeichert als zweiter Kontakt (Name, Telefon, E-Mail) bei den Kontaktdaten des Bauherrn, nicht am Projekt,
  damit Freiberufler ihn nicht sehen. Reicht das, oder braucht es mehr als zwei Bauherren (Bauherrengemeinschaft)?
- **AVV und Freigabe:** Die KI-Auslesung sendet Seite 1 des Vertrags (Name, Anschrift, Telefon, E-Mail der Bauherren) als Bild an
  den KI-Dienst. Vor dem Freischalten (`EXTRACTOR_ENABLED=true`) braucht es den Auftragsverarbeitungsvertrag mit dem Anbieter und
  die Zustimmung von ABM. Siehe `docs/vertrag-extraktion.md`.
- **Limits der Auslesung:** 20 je Person und Tag, 100 je Tag, 20 € im Monat sind Annahmen. Passen sie zum Büro?
