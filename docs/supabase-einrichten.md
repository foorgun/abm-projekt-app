# Supabase einrichten (Pilotprojekt "abm-pilot", Frankfurt)

Stand: Schritt 8 (Datenanbindung, Rechte, Anmeldung, Skripte für Konten, Rollenprüfung, Sicherung und Demo-Daten).
Die Skripte aus Abschnitt 8 sind geschrieben und lokal geprüft, soweit das ohne das echte Projekt geht.

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

Die Migrationen liegen in `supabase/migrations/` (0001 bis 0015). Sie enthalten kein Passwort und keinen Schlüssel.

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
Spätere Migrationen einzeln nachziehen: `npm run db:bundle -- --ab 7` (gleichbedeutend `--ab 0007`) erzeugt eine Datei nur mit den neuen.

### Weg B: Supabase CLI mit `db query` (geprüft am 20.10.2026 mit Migration 0015)

> **Nicht `npx supabase db push` benutzen.** Die Migrationen wurden über den SQL-Editor eingespielt, deshalb ist die
> Migrationshistorie der CLI leer (`npx supabase migration list --linked` zeigt bei „remote“ nichts). `db push` hielte
> darum alle Migrationen ab 0001 für neu und würde sie noch einmal ausführen.

Dieselbe Bundle-Datei wie bei Weg A, nur ohne Kopieren: `db query --linked` schickt genau diese eine Datei über die
Management API an das verknüpfte Projekt (eine Transaktion, alles oder nichts). Braucht kein Datenbank-Passwort.

```
npx supabase login                                   # einmalig, öffnet den Browser
npx supabase link --project-ref <projekt-ref>        # einmalig; die Verknüpfung steht in supabase/.temp/ (nicht im Repo)
npm run db:bundle -- --ab 15                         # nur die neuen Migrationen, hier ab 0015
# Datei supabase/.out/migrationen-ab-0015.sql lesen: nur die erwarteten Anweisungen?
npx supabase db query --linked -f supabase/.out/migrationen-ab-0015.sql
```

Danach prüfen, ob die Tabellen da sind und RLS aktiv ist (nur lesend), z. B.:

```
npx supabase db query --linked "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'schornsteinfeger%'"
```

### Danach prüfen

```
npm run check:setup
```

Liest nur, mit dem Publishable key und ohne Anmeldung. Erwartet: jede Tabelle "gesperrt", Selbstregistrierung "aus",
letzte Zeile "In Ordnung". Steht irgendwo "OFFEN", nicht weitermachen.

## 4. Erstes Konto (Admin)

Eine Registrierung gibt es nicht. Konten legt der Admin an: von Hand wie hier, oder mehrere auf einmal per Skript (Abschnitt 8):

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
VITE_APP_MODE=pilot npm run dev   # Pilot-Modus: nur Projekte, Dokumente, Planungsprotokoll (siehe docs/hosting-echtbetrieb.md)
```

Anmeldung mit E-Mail und Passwort. Nach den Migrationen ist die Datenbank leer: Dashboard und Listen zeigen leere Zustände,
bis Projekte angelegt oder Demo-Daten geladen sind (Abschnitt 8, `npm run seed:demo`). Schritte, Ordnervorlage (127 Ordner) und die Schwellen des
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
- **Planungsprotokoll** (0013/0014): Bürodaten lesen Admin und Mitarbeiter, ändern nur Admins. Protokolle anlegen und lesen
  Admin und Mitarbeiter, nie ändern oder löschen. Die Vorlagen im Bucket `vorlagen` lesen nur Admin und Mitarbeiter; hochladen
  geht nur mit dem Secret key (`npm run vorlagen:hochladen`). Beteiligte der neuen Rollen (Kellerbauer, Ämter, Versorger Gas/
  Fernwärme/Abwasser, Sachbearbeiter …) sehen Freiberufler nicht, die fünf Rollen aus Liste.docx weiterhin.
- **Rollen vergeben** geht nicht über die App, auch nicht als Admin, sondern nur im Dashboard oder per Skript.

Lokal nachprüfen (temporäres Postgres, kein Zugriff auf das echte Projekt): `bash tools/test-db.sh` (174 Prüfungen).

## 7. Free-Tarif: was das bedeutet

Angaben nach meinem Kenntnisstand, bitte vor einer Entscheidung auf supabase.com/pricing gegenprüfen.

- **Keine automatischen Backups.** Geht etwas verloren, ist es weg. Die einzige Sicherung ist `npm run export:backup` (Abschnitt 8),
  und die sichert keine Dateien. Regelmäßig laufen lassen, mindestens vor jedem Import und jeder Migration.
- **Pause nach etwa einer Woche ohne Zugriffe.** Das Projekt wird angehalten, die App meldet dann "Keine Verbindung".
  Im Dashboard lässt es sich wieder starten ("Restore project"); das dauert einige Minuten. Daten bleiben erhalten,
  solange es rechtzeitig wieder gestartet wird.
- **Grenzen:** kleine Datenbank (Größenordnung 500 MB), wenig Dateispeicher (Größenordnung 1 GB), 50 MB je Datei.
  Für Tabellen reicht das lange, für Pläne und Scans nicht.
- **Mails des eingebauten Versands sind stark begrenzt.** Deshalb Anmeldung mit Passwort statt Magic Link.

**Wann auf Pro wechseln:** bevor echte Bauherren-Daten oder echte Projektdateien hineinkommen, spätestens wenn das Büro
im Alltag damit arbeitet. Gründe: tägliche Backups, keine Pause, mehr Speicher. Vorher zu klären (steht in
`docs/offene-fragen.md`): Vertrag zur Auftragsverarbeitung (AVV) mit Supabase.

## 8. Demo-Daten, Testkonten, Prüfungen, Sicherung

Reihenfolge einhalten. Schritte mit **[Secret key]** brauchen die Datei `.env.server`, die du selbst anlegst:

```
SUPABASE_SECRET_KEY=sb_secret_…
```

Den Schlüssel findest du im Dashboard unter Project Settings → API Keys → Secret keys. Die Datei ist in `.gitignore`.
Kein Skript gibt den Schlüssel aus oder schreibt ihn irgendwohin. Wer ihn hat, kann alles lesen und löschen: nicht weitergeben,
und wenn er doch einmal in eine Mail oder einen Chat gerät, im Dashboard widerrufen und neu erzeugen.

| Nr. | Befehl | Was passiert | Schlüssel |
|---|---|---|---|
| 1 | `npm run db:bundle -- --ab 0008`, Datei im SQL-Editor ausführen | Migrationen 0008 und 0009 | keiner |
| 2 | `npm run seed:demo` | lädt rund 2.000 erfundene Zeilen (60 Projekte, 150 Rechnungen, 624 Dokumente ohne Dateien …), alle mit `is_demo` | **[Secret key]** |
| 3 | `konten.beispiel.json` nach `konten.local.json` kopieren, vier E-Mail-Adressen eintragen | Liste der Testkonten, nur lokal | keiner |
| 4 | `npm run konten:anlegen` | legt fehlende Konten an, setzt Rolle und Namen, weist dem Freiberufler drei Demo-Projekte zu | **[Secret key]** |
| 5 | `npm run check:roles` | meldet sich je Konto an und prüft die Sichten, Ergebnis als Tabelle | keiner (Passwörter aus `konten.local.json`) |
| 6 | `npm run check:repo` | ruft jede Funktion der App einmal gegen die echte Datenbank auf, mit Testdaten, die danach entfernt werden | **[Secret key]** (Vorbereiten und Aufräumen) |
| 6a | `npm run vorlagen:hochladen` | lädt die drei PDF-Vorlagen des Planungsprotokolls aus `vorlagen/planungsprotokoll/` in den privaten Bucket `vorlagen` (prüft vorher die Felder) | **[Secret key]** |
| 7 | `npm run export:backup` | alle Tabellen als JSON nach `backups/abm-backup-<Datum>_<Uhrzeit>/` | **[Secret key]** |

**Demo-Daten wieder entfernen:** `npm run seed:demo -- --loeschen` **[Secret key]**. Entfernt alles mit `is_demo` samt der daran
hängenden Zeilen; echte Projekte, die drei Hausbaufirmen und die Ordnervorlage bleiben. Zweimal laden geht nicht (das Skript bricht ab).

**Ohne Secret key** geht der Seed auch: `npm run seed:demo -- --sql` schreibt `supabase/.out/demo-seed.sql` und
`demo-loeschen.sql` zum Einfügen in den SQL-Editor (eine Transaktion, rund 550 KB). Genau diese Dateien sind lokal geprüft:
`npm run seed:demo -- --sql && bash tools/test-db.sh --demo` lädt, zählt und löscht restlos.

**`check:roles` lesen:** Jede Zeile hat eines von drei Ergebnissen: eine Zeilenzahl, `gesperrt (Code: Text)` oder
`UNERWARTETER FEHLER (Code: Text)`. "Gesperrt" heißt, die Datenbank lehnt wegen fehlender Berechtigung ab (meist Code `42501`,
bei unseren Funktionen `P0001: Keine Berechtigung`). Ein unerwarteter Fehler zählt immer als FEHLER, auch wenn 0 Zeilen erwartet waren.
Übersprungene Konten (ohne Passwort in der Datei) stehen am Ende; für sie ist nichts geprüft.

**Konten:**

- Gibt es ein Konto schon (z. B. deines), bleibt das Passwort unberührt; das Skript setzt nur Rolle und Namen.
- Neue Konten bekommen ein zufälliges Passwort. Es wird nicht angezeigt, sondern steht danach in `konten.local.json`.
  Der Person auf sicherem Weg geben; ändern lässt es sich im Dashboard unter Authentication → Users.
- `check:roles` und `check:repo` melden sich nur mit Konten an, zu denen ein Passwort in `konten.local.json` steht.
  Für dein eigenes Konto kannst du dort von Hand `"passwort": "…"` ergänzen; sonst wird es übersprungen.
  Gebraucht wird mindestens ein Admin-Konto mit Passwort (das neu angelegte reicht).
- Der Freiberufler bekommt die ersten drei aktiven Demo-Projekte. Hat er schon genau drei Zuweisungen, bleiben sie.

**Sicherung:** enthält alle Tabellen, die Liste der Konten (ohne Passwörter) und die Liste der Dateien im Speicher, aber
**nicht die Dateien selbst**. Im Free-Tarif ist das die einzige Sicherung; vor jedem größeren Schritt (Import, Migration) laufen lassen.
Der Ordner enthält Kontaktdaten: nicht in eine Cloud-Ablage legen, die dafür nicht gedacht ist. Eine Wiederherstellung aus den
JSON-Dateien gibt es noch nicht als Skript.

## 9. Wenn etwas nicht geht

| Meldung in der App | Ursache | Abhilfe |
|---|---|---|
| "Die Datenbank ist noch nicht eingerichtet (Migrationen fehlen)" | Tabellen fehlen oder die API kennt sie noch nicht | Abschnitt 3; sonst im SQL-Editor `notify pgrst, 'reload schema';` |
| "E-Mail oder Passwort stimmt nicht" | falsche Daten, oder das Konto gibt es nicht | Abschnitt 4 |
| "Konto noch nicht freigeschaltet" | Konto ohne Zeile in `user_roles` | SQL aus Abschnitt 4 |
| "Keine Berechtigung für diese Aktion" | die Rolle darf das nicht (Absicht) | wenn es erlaubt sein sollte: mir melden, das ist dann eine Migration |
| "Keine Verbindung" | Projekt pausiert (Free-Tarif) oder kein Internet | Dashboard → Projekt wieder starten |
