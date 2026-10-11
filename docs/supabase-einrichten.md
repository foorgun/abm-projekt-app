# Supabase einrichten (Pilotprojekt "abm-pilot", Frankfurt)

Stand: Schritt 8, Punkte 1 bis 3 (Datenanbindung, Rechte, Anmeldung). Konten per Skript, Rollenprüfung, Sicherung und
Demo-Daten für die echte Datenbank folgen (Abschnitt 8).

## 1. Zwei Schlüssel, zwei Orte

| Schlüssel | Beginnt mit | Wo er liegt | Was er darf |
|---|---|---|---|
| Publishable key | `sb_publishable_…` | `.env` (`VITE_SUPABASE_ANON_KEY`), landet im Browser | Nur, was GRANT und Zeilenregeln (RLS) erlauben. Ohne Anmeldung: nichts. |
| Secret key | `sb_secret_…` | **nur** lokal in `.env.server` (nicht eingecheckt), nie im Frontend, nie im Repo | Alles, umgeht RLS. Nur für Skripte und später den Agenten. |

`.env`, `.env.*`, `konten.local.json`, `backups/` und `supabase/.out/` stehen in `.gitignore`.
Die App weigert sich zu starten, wenn in `VITE_SUPABASE_ANON_KEY` etwas steht, das nach Secret key aussieht.

## 2. Im Dashboard prüfen (einmalig, von Hand)

1. **Authentication → Sign In / Providers:** "Allow new users to sign up" ist **aus**. Anbieter "Email" ist **an**.
2. **Project Settings → Data API:** "Automatically expose new tables" ist **aus**, "Automatic RLS" ist **an**,
   unter "Exposed schemas" steht `public`.
3. Nichts weiter anlegen: Tabellen, Rechte und der private Dateispeicher `project-documents` kommen aus den Migrationen.

## 3. Migrationen anwenden

Die Migrationen liegen in `supabase/migrations/` (0001 bis 0008). Sie enthalten kein Passwort und keinen Schlüssel.

### Weg A: SQL-Editor (empfohlen, geprüft gegen ein lokales Postgres)

```
npm run db:bundle
```

Das erzeugt `supabase/.out/migrationen-gesamt.sql` (alle Migrationen in einer Transaktion: alles oder nichts).

1. Datei öffnen, alles kopieren.
2. Dashboard → **SQL Editor** → neue Abfrage → einfügen → **Run**.
3. Fragt der Editor wegen "destructive operations" nach: bestätigen. Gemeint sind die `revoke`-Zeilen, die Rechte wegnehmen.
4. Erwartet: "Success. No rows returned". Bei einem Fehler wurde nichts übernommen; Meldung an mich weitergeben.

Nicht zweimal ausführen (beim zweiten Mal bricht es ab, weil die Typen schon existieren; das schadet nicht).
Spätere Migrationen einzeln nachziehen: `npm run db:bundle -- --ab 0007` erzeugt eine Datei nur mit den neuen.

### Weg B: Supabase CLI (nicht von mir geprüft)

```
npx supabase login
npx supabase link --project-ref <projekt-ref>     # fragt nach dem Datenbank-Passwort, speichert es nicht im Repo
npx supabase db push
```

Die CLI merkt sich, welche Migrationen schon gelaufen sind. Ich konnte diesen Weg hier nicht ausprobieren
(kein Zugang zum Projekt); insbesondere ist offen, ob sie unsere Dateinamen `0001_…` ohne Zeitstempel annimmt.
Wenn Weg A einmal benutzt wurde, bei Weg A bleiben.

### Danach prüfen

```
npm run check:setup
```

Liest nur, mit dem Publishable key und ohne Anmeldung. Erwartet: jede Tabelle "gesperrt", Selbstregistrierung "aus",
letzte Zeile "In Ordnung". Steht irgendwo "OFFEN", nicht weitermachen.

## 4. Erstes Konto (Admin)

Eine Registrierung gibt es nicht. Konten legt der Admin an, bis das Skript aus Abschnitt 8 da ist von Hand:

1. Dashboard → **Authentication → Users → Add user → Create new user**: E-Mail, ein langes Passwort,
   "Auto Confirm User" **an**.
2. Rolle und Namen zuweisen, im **SQL Editor** (Mail und Namen ersetzen):

```sql
insert into public.user_roles (user_id, role, full_name)
select id, 'admin', 'Vorname Nachname' from auth.users where email = 'du@example.com'
on conflict (user_id) do update set role = excluded.role, full_name = excluded.full_name;
```

Rollen: `admin`, `mitarbeiter`, `freiberufler`. Ein Konto ohne Zeile in `user_roles` kann sich anmelden, sieht aber nichts;
die App zeigt dann "Konto noch nicht freigeschaltet".

Einem Freiberufler Projekte zuweisen (er sieht nur diese):

```sql
insert into public.project_members (project_id, user_id)
select p.id, u.id from public.projects p, auth.users u
where u.email = 'frei@example.com' and p.abm_nr in ('8161-101', '8161-102', '8260-040');
```

## 5. App starten

```
npm run dev          # Echtbetrieb, sobald .env die beiden VITE_SUPABASE_*-Werte enthält → Anmeldeseite
npm run dev:demo     # Demo-Modus mit erfundenen Daten auf http://localhost:5199 (ignoriert .env)
```

Anmeldung mit E-Mail und Passwort. Nach den Migrationen ist die Datenbank leer: Dashboard und Listen zeigen leere Zustände,
bis Projekte angelegt oder Demo-Daten geladen sind (Abschnitt 8). Schritte, Ordnervorlage (126 Ordner) und die Schwellen des
Agenten sind schon da, die kommen aus den Migrationen.

Was im Pilotbetrieb noch **nicht** geht: Der Posteingangs-Agent liest keine Postfächer ("Jetzt prüfen" ist gesperrt, Schritt 9).
Stammdaten: Die drei Hausbaufirmen kommen aus Migration 0007. Weitere Hausbaufirmen, Verkäufer, Architekten und Vermesser legt man
direkt im Dialog "Neues Projekt" an ("+ Neu anlegen", nur der Name). Stammdaten ändern oder löschen geht in der App noch nicht.
Projektdaten, Beteiligte und Kontaktdaten des Bauherrn lassen sich auf der Projektseite bearbeiten (Kachel → "Bearbeiten").

## 6. Wer darf was (Kurzfassung)

- **Nicht angemeldet:** nichts, auf keiner Tabelle und keiner Funktion (Migration 0004, per Test abgesichert).
- **Angemeldet:** nur die Aktionen, die die App wirklich ausführt. Zum Beispiel: Projekte anlegen und ändern, aber nie löschen;
  Rechnungen als versendet markieren, aber keine Beträge ändern; Dokumente ablegen, aber nie löschen;
  Mails im Posteingang nur lesen (schreiben darf nur der Agent). Welche *Zeilen* jemand sieht, regelt RLS nach Rolle.
- **Freiberufler:** nur zugewiesene Projekte mit deren Schritten, Beteiligten und Dokumenten. Keine Rechnungen, keine
  Bauherren-Kontaktdaten, keine Aufgaben, keine Aktivitäten, kein Posteingang.
- **Stammdaten anlegen** (Hausbaufirma, Verkäufer, Architekt, Vermesser) dürfen Admin und Mitarbeiter, nur mit Namen. Freiberufler nicht.
- **Rollen vergeben** geht nicht über die App, auch nicht als Admin, sondern nur im Dashboard oder per Skript.

Lokal nachprüfen (temporäres Postgres, kein Zugriff auf das echte Projekt): `bash tools/test-db.sh` (174 Prüfungen).

## 7. Free-Tarif: was das bedeutet

Angaben nach meinem Kenntnisstand, bitte vor einer Entscheidung auf supabase.com/pricing gegenprüfen.

- **Keine automatischen Backups.** Geht etwas verloren, ist es weg. Bis `npm run export:backup` da ist (Abschnitt 8),
  gibt es keine Sicherung. Bis dahin keine Daten eintragen, die nicht auch woanders stehen.
- **Pause nach etwa einer Woche ohne Zugriffe.** Das Projekt wird angehalten, die App meldet dann "Keine Verbindung".
  Im Dashboard lässt es sich wieder starten ("Restore project"); das dauert einige Minuten. Daten bleiben erhalten,
  solange es rechtzeitig wieder gestartet wird.
- **Grenzen:** kleine Datenbank (Größenordnung 500 MB), wenig Dateispeicher (Größenordnung 1 GB), 50 MB je Datei.
  Für Tabellen reicht das lange, für Pläne und Scans nicht.
- **Mails des eingebauten Versands sind stark begrenzt.** Deshalb Anmeldung mit Passwort statt Magic Link.

**Wann auf Pro wechseln:** bevor echte Bauherren-Daten oder echte Projektdateien hineinkommen, spätestens wenn das Büro
im Alltag damit arbeitet. Gründe: tägliche Backups, keine Pause, mehr Speicher. Vorher zu klären (steht in
`docs/offene-fragen.md`): Vertrag zur Auftragsverarbeitung (AVV) mit Supabase.

## 8. Folgt in den nächsten Punkten von Schritt 8

Noch nicht vorhanden, hier nur damit klar ist, was kommt:

- Vier Testkonten per Skript, E-Mail-Adressen aus `konten.local.json` (nicht eingecheckt); Freiberufler mit drei Projekten.
- `npm run check:roles`: meldet sich je Konto an und prüft die Sichten, Ergebnis als Tabelle.
- `npm run export:backup`: alle Tabellen als JSON nach `backups/<datum>/`.
- Seed mit erfundenen Demo-Daten, getrennt von echten Daten (Spalte `is_demo`, Migration 0006), mit Schalter zum Löschen.

Diese Skripte brauchen den Secret key aus `.env.server`. Die Datei legst du selbst an; ich schreibe den Schlüssel nirgends hin.

## 9. Wenn etwas nicht geht

| Meldung in der App | Ursache | Abhilfe |
|---|---|---|
| "Die Datenbank ist noch nicht eingerichtet (Migrationen fehlen)" | Tabellen fehlen oder die API kennt sie noch nicht | Abschnitt 3; sonst im SQL-Editor `notify pgrst, 'reload schema';` |
| "E-Mail oder Passwort stimmt nicht" | falsche Daten, oder das Konto gibt es nicht | Abschnitt 4 |
| "Konto noch nicht freigeschaltet" | Konto ohne Zeile in `user_roles` | SQL aus Abschnitt 4 |
| "Keine Berechtigung für diese Aktion" | die Rolle darf das nicht (Absicht) | wenn es erlaubt sein sollte: mir melden, das ist dann eine Migration |
| "Keine Verbindung" | Projekt pausiert (Free-Tarif) oder kein Internet | Dashboard → Projekt wieder starten |
