# Urlaub und Krankheit ("Abwesenheit")

Seite `/abwesenheit` (Menüpunkt "Abwesenheit"), Migration `0012_abwesenheit.sql`.

## Welche Daten

| Daten | Tabelle | Inhalt |
|---|---|---|
| Urlaubsanspruch | `urlaubs_anspruch` | je Person und Jahr: Tage (Standard 30) und Übertrag aus dem Vorjahr |
| Urlaubsanträge | `abwesenheiten` (art `urlaub`) | Zeitraum, Werktage, Status (offen, genehmigt, abgelehnt, zurückgezogen), optionale Notiz, wer wann entschieden hat, optionale Begründung einer Ablehnung |
| Krankmeldungen | `abwesenheiten` (art `krank`) | erster und letzter Krankheitstag (das Ende darf offen sein), sonst nichts |

**Krankmeldungen enthalten keine Diagnose und keinen Freitext.** Dafür gibt es kein Eingabefeld, die Schnittstelle
nimmt keinen Text an, und die Datenbank lehnt eine Krankmeldung mit Notiz ab (Constraint `abwesenheiten_krank_schlicht`).
Eine Krankschreibung (AU) wird weiterhin beim Büro eingereicht, nicht in der App.

Auch Urlaubsnotizen sind für Organisatorisches gedacht (z. B. "Vertretung abgesprochen"), nicht für Gesundheitliches.

## Wer sieht was

| Rolle | Eigene Zeilen | Zeilen anderer | Kalender | Anspruch pflegen | Anträge entscheiden |
|---|---|---|---|---|---|
| Admin | ja | ja, auch Krankmeldungen | mit Grund (Urlaub oder krank) | ja | ja, aber nie den eigenen |
| Mitarbeiter | ja | nein | nur "abwesend", ohne Grund | nein | nein |
| Freiberufler | kein Zugriff | nein | nein | nein | nein |

- Durchgesetzt wird das in der Datenbank (Zeilenregeln, Spaltenrechte, ein Trigger), nicht nur in der Oberfläche.
- **Vier-Augen-Prinzip:** Ein Admin kann den eigenen Urlaubsantrag nicht genehmigen oder ablehnen. Das muss ein anderer
  Admin tun. Mit nur einem Admin-Konto bleiben dessen Anträge offen.
- **Kalender für Mitarbeiter:** Die Funktion `kalender_abwesenheiten` liefert Nicht-Admins Name und Zeitraum, aber nie die
  Art. Eine Krankmeldung ohne Ende erscheint dort bis heute, damit das fehlende Ende nicht verrät, dass jemand krank ist.
  Enthalten sind nur genehmigter Urlaub und Krankmeldungen; offene, abgelehnte und zurückgezogene Anträge nicht.
- Im eigenen Kalender sieht jede Person den Grund ihrer eigenen Abwesenheit (aus den eigenen Zeilen).
- Status, Werktage und die Entscheidung setzt nie der Browser: dafür gibt es kein Schreibrecht. Die Werktage rechnet die
  Datenbank (Montag bis Freitag ohne Feiertage in Baden-Württemberg; der 24.12. und der 31.12. sind Werktage).
- Gelöscht wird nichts: ein Antrag wird zurückgezogen oder abgelehnt, die Zeile bleibt.

## Hinweise zum Datenschutz

- Krankmeldungen sind auch ohne Diagnose Gesundheitsdaten im Sinn von Art. 9 DSGVO (die Tatsache "krank von … bis …").
  Deshalb sehen sie nur die betroffene Person und die Admins, und der Kalender zeigt anderen nur "abwesend".
- Die Daten liegen in der Supabase-Datenbank (Frankfurt). Für den Echtbetrieb gilt dieselbe Voraussetzung wie für die
  übrigen Personendaten: Auftragsverarbeitungsvertrag mit Supabase (siehe `docs/offene-fragen.md`).
- Die Sicherung (`npm run export:backup`) enthält beide Tabellen. Wer die Sicherung aufbewahrt, bewahrt damit auch
  Krankmeldungen auf.
- **Löschfrist (offen):** Vorschlag: Abwesenheitsdaten drei Jahre nach Ende des Kalenderjahres löschen (Verjährung von
  Urlaubsansprüchen). Das ist noch nicht entschieden und nicht eingebaut; es gibt derzeit kein automatisches Löschen.
  Siehe `docs/offene-fragen.md`.
- Bei nur rund zehn Personen lässt sich aus "abwesend" und dem Büroalltag oft trotzdem auf den Grund schließen. Das
  kann die App nicht verhindern; sie zeigt den Grund nur nicht an.

## Einrichten

1. Migration 0012 anwenden: `npm run db:bundle -- --ab 0012`, Datei im SQL-Editor ausführen.
2. `npm run konten:anlegen`: legt für alle Konten mit Rolle Admin oder Mitarbeiter den Anspruch des laufenden Jahres an
   (30 Tage). Vorhandene Einträge bleiben, wie sie sind.
3. Optional `npm run seed:demo`: lädt erfundene Anträge in allen Stati und eine Krankmeldung. Sie hängen an den
   vorhandenen Konten (Admins zuerst) und tragen `is_demo`; `npm run seed:demo -- --loeschen` entfernt sie wieder.
   Achtung: Solange sie geladen sind, zählen sie im Urlaubsstand dieser Konten mit.
4. `npm run check:roles` prüft die Rechte. Dabei entstehen Testanträge für den 2. und 3. März 2099, die am Ende
   zurückgezogen bzw. abgelehnt sind. Sie bleiben als Zeilen stehen (gelöscht wird nie), zählen aber in keinem Jahr.

## Termine diese Woche (Dashboard)

Die Karte zeigt erfundene Demo-Termine (`src/demo/termine.ts`), relativ zur laufenden Woche. Es gibt keinen
Netzwerkaufruf und keine Zugangsdaten. Die Schnittstelle `TermineQuelle` (`src/lib/termine.ts`) ist der Punkt, an dem
später Outlook über Microsoft Graph angeschlossen wird: serverseitig über eine Edge Function, nie mit einem Schlüssel
im Frontend.
