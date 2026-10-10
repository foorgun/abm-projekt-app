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
