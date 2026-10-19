# Hosting für den Pilotbetrieb: Cloudflare Pages + Cloudflare Access

Ziel: Die App läuft unter einer `…pages.dev`-Adresse, verbunden mit dem Supabase-Projekt "abm-pilot". Davor steht Cloudflare Access:
Wer die Seite öffnet, bekommt einen Einmalcode per Mail, und nur freigegebene Adressen kommen durch. Danach folgt die
Anmeldung der App (E-Mail und Passwort). Keine eigene Domain im ersten Schritt.

Stand der Prüfung: Den Build, die Sicherheits-Kopfzeilen und die Anmeldung von einer fremden Adresse habe ich lokal geprüft
(Abschnitt 7). Die Klickwege in Cloudflare und Supabase habe ich **nicht** selbst durchgeklickt; Menünamen können leicht abweichen.

## 0. Was vorher erledigt sein muss

| | Erledigt, wenn |
|---|---|
| Migrationen 0001 bis 0012 angewendet | `npm run check:setup` endet mit "In Ordnung" |
| Rollen stimmen | `npm run check:roles` endet mit "Alle … Prüfungen bestanden" |
| Build ist sauber | `npm run check:build` endet mit "Build in Ordnung" |
| Sicherung gezogen | `npm run export:backup` (Ordner `backups/…` liegt lokal) |
| Code liegt bei GitHub | siehe Schritt 1; **bisher hat das Repo keine Verbindung zu GitHub** (`git remote -v` ist leer) |

## 1. Code zu GitHub (privat)

Cloudflare baut aus einem Git-Repository. Das Repo muss **privat** sein.

1. Auf github.com: **New repository** → Name z. B. `abm-projekt-app` → **Private** → ohne README, ohne .gitignore anlegen.
2. Lokal im Projektordner:
   ```bash
   git status                      # muss sauber sein
   git remote add origin git@github.com:<dein-konto>/abm-projekt-app.git
   git push -u origin main
   ```
3. Auf GitHub nachsehen: Es dürfen **nicht** im Repo liegen: `.env`, `.env.server`, `konten.local.json`, `backups/`, `supabase/.out/`,
   Excel-Dateien. Sie stehen alle in `.gitignore`; ein Blick in die Dateiliste genügt.

Der lokale Ordner `public/design/` ist nicht eingecheckt und wird deshalb auch nicht veröffentlicht. `check:build` weist darauf hin.

## 2. Cloudflare Pages: Projekt anlegen

1. dash.cloudflare.com → **Workers & Pages** → **Create** → Reiter **Pages** → **Connect to Git**.
2. GitHub verbinden und **nur dieses eine Repository** freigeben ("Only select repositories").
3. Einstellungen des Builds:

   | Feld | Wert |
   |---|---|
   | Project name | z. B. `abm-pilot` (ergibt `abm-pilot.pages.dev`; der Name ist danach fest) |
   | Production branch | `main` |
   | Framework preset | `None` (oder `Vite`; die Werte unten gelten in beiden Fällen) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | leer lassen |

4. **Environment variables** (aufklappen), für **Production**:

   | Name | Wert | Art |
   |---|---|---|
   | `VITE_SUPABASE_URL` | wie in deiner lokalen `.env` | Text |
   | `VITE_SUPABASE_ANON_KEY` | der Publishable key, beginnt mit `sb_publishable_` | Text |
   | `NODE_VERSION` | `20` | Text |
   | `VITE_APP_MODE` | `pilot` für die Testphase (nur Projekte, Dokumente, Planungsprotokoll); weglassen oder `voll` für alles | Text |

   **Nie den Secret key (`sb_secret_…`) eintragen.** Alles, was mit `VITE_` beginnt, landet im Browser jedes Besuchers.
   Der Publishable key darf dort stehen: ohne Anmeldung gibt die Datenbank damit nichts heraus (`check:setup`, `check:roles`).

5. Für **Preview** (Vorschau-Builds anderer Branches) **keine** `VITE_SUPABASE_*`-Variablen setzen. Vorschauen laufen dann im
   Demo-Modus mit erfundenen Daten und können die echte Datenbank nicht erreichen.
6. **Save and Deploy**. Nach ein bis zwei Minuten steht die Seite unter `https://<projektname>.pages.dev`.

**Noch nicht weitergeben.** Bis Schritt 3 erledigt ist, kann jeder mit der Adresse die Anmeldeseite sehen (aber ohne Konto nichts lesen).

Jeder spätere `git push` auf `main` baut und veröffentlicht automatisch neu.

### Pilot-Modus (`VITE_APP_MODE`)

Für die Testphase zeigt die App nur das Nötigste. Der Schalter wirkt beim **Bauen**: nach jeder Änderung der Variable
in Cloudflare unter **Deployments** den letzten Stand mit **Retry deployment** neu bauen (oder einen neuen Commit pushen).

| Wert | Was sichtbar ist |
|---|---|
| `pilot` | Seitenleiste: Projekte, unten Einstellungen (nur Admin) und Hilfe. Button "Neues Projekt" (mit Dokument lesen und Prüfmaske). Projekt-Detail mit Prozessleiste und den Reitern Übersicht, Dokumente, Planungsprotokoll. Suche oben. |
| nicht gesetzt, leer oder `voll` | alles wie bisher |

Im Pilot ausgeblendet (nicht gelöscht, Daten bleiben in der Datenbank): Dashboard, Menüpunkte Aktive/Abgeschlossene
Projekte und Pipeline, Aufgaben, globale Dokumente-Seite, Rechnungen, Abwesenheit, Posteingangs-Agent mit Prüfliste und
Postfächern, Adressbuch, Auswertungen, Warnungsglocke, Warnungen zu Rechnungen, im Projekt die Reiter Aufgaben,
Rechnungen und Aktivität. Jede andere Adresse (auch `#/` und direkte Links wie `#/rechnungen`) führt zur Projektliste.
Angefangene Projekte aus einem Dokument ("Später weitermachen") stehen im Pilot oben in der Projektliste statt in der Prüfliste.

Der Schalter ist nur Oberfläche: Was eine Rolle darf, entscheidet weiter die Datenbank (`npm run check:roles`).
Die Aufgabe "Fehlende Angaben nachfragen" legt die Datenbank beim Anlegen weiterhin an; sie ist im Pilot nur nicht sichtbar.

Lokal ausprobieren: `VITE_APP_MODE=pilot npm run dev` bzw. `VITE_APP_MODE=pilot npm run build`.

## 3. Cloudflare Access davor schalten

Access gehört zu "Zero Trust". Der kostenlose Tarif reicht für bis zu 50 Personen; beim ersten Öffnen fragt Cloudflare nach einem
Team-Namen und möglicherweise nach einer Zahlungsart, auch für den kostenlosen Tarif.

1. dash.cloudflare.com → **Zero Trust** → Team-Namen wählen (z. B. `abm`) → Tarif **Free**.
2. **Settings → Authentication → Login methods**: **One-time PIN** muss vorhanden sein (ist meist voreingestellt). Sonst hinzufügen.
3. **Access → Applications → Add an application → Self-hosted**.

   | Feld | Wert |
   |---|---|
   | Application name | `ABM Projekt-App (Pilot)` |
   | Session Duration | `24 hours` (siehe unten) |
   | Application domain | Domain `pages.dev`, Subdomain `<projektname>` → ergibt `<projektname>.pages.dev` |
   | zweite Domain hinzufügen | Subdomain `*.<projektname>` → schützt auch die Vorschau-Adressen `…​.<projektname>.pages.dev` |
   | Identity providers | nur **One-time PIN** anhaken |

4. **Policy** hinzufügen:

   | Feld | Wert |
   |---|---|
   | Policy name | `Büro ABM` |
   | Action | **Allow** |
   | Include → Selector | **Emails** → die freigegebenen Adressen einzeln eintragen (deine, die deines Bruders, weitere Tester) |

   Nicht "Emails ending in" mit einer allgemeinen Domain (z. B. `gmail.com`) verwenden: das ließe alle mit so einer Adresse hinein.
5. Speichern. **Prüfen** in einem privaten Browserfenster:
   - `https://<projektname>.pages.dev` öffnen → es erscheint die Cloudflare-Seite "Sign in", **nicht** die App.
   - Freigegebene Adresse eintragen → Code kommt per Mail → danach erscheint die Anmeldeseite der App.
   - Mit einer **nicht** freigegebenen Adresse probieren: Es kommt kein Code, die App erscheint nicht.

**Achtung, bekannte Falle:** In den Pages-Einstellungen gibt es einen Schalter "Access policy" (Settings → General). Er schützt nur die
Vorschau-Adressen, **nicht** die Hauptadresse `<projektname>.pages.dev`. Deshalb die Anwendung wie oben von Hand anlegen und Punkt 5 wirklich prüfen.

**Sitzungsdauer:** 24 Stunden heißt, jeder braucht einmal am Tag einen neuen Code. Für den Alltag im Büro ist `1 week` bequemer;
kürzer ist sicherer, wenn Geräte geteilt werden. Die Anmeldung der App selbst bleibt davon unabhängig bestehen, bis man sich abmeldet.

**Zwei Anmeldungen, zwei Zwecke:** Access entscheidet, wer die Seite überhaupt laden darf. Die Anmeldung der App entscheidet, wer was
sieht (Rollen). Beide Adresslisten pflegen: eine Person braucht einen Eintrag in der Access-Policy **und** ein Konto mit Rolle in Supabase.

## 4. Supabase: was für die neue Adresse nötig ist

**Für die Anmeldung mit E-Mail und Passwort ist nichts nötig.** Geprüft: Die Schnittstellen von Supabase (Anmeldung, Daten,
Dateien) antworten Browsern von jeder Adresse (`Access-Control-Allow-Origin: *`); der Schutz liegt im Schlüssel, in der Anmeldung und
in den Rechten der Datenbank, nicht in der Adresse. Es gibt keine Weiterleitung nach der Anmeldung, also auch keine Liste erlaubter
Weiterleitungsadressen zu pflegen.

Trotzdem einmal einstellen (Dashboard → **Authentication**):

| Wo | Was | Warum |
|---|---|---|
| URL Configuration → Site URL | `https://<projektname>.pages.dev` | steht in Mails von Supabase (z. B. Passwort zurücksetzen aus dem Dashboard); sonst zeigt der Link auf `localhost` |
| URL Configuration → Redirect URLs | dieselbe Adresse eintragen | nur nötig, falls später Magic Link oder "Passwort vergessen" dazukommt |
| Sign In / Providers | "Allow new users to sign up" bleibt **aus**; alle Anbieter außer Email aus | keine Registrierung |
| Passwörter (Policies / Email-Anbieter) | Mindestlänge 12 | die Skript-Passwörter sind lang, selbst gewählte sollen es auch sein |
| Users | Passwörter der vier Testkonten neu setzen, bevor echte Personen sie nutzen | sie stehen in `konten.local.json` auf deinem Rechner |

## 5. Vor dem ersten Nutzer

- **Pilot-Hinweis:** Beim ersten Login erscheint einmal je Konto und Gerät die Einführung ("Das ist ein Pilot. Die Daten sind erfunden,
  Prozessschritte und Warnfristen sind Annahmen."). Nachlesen unter **Hilfe** unten links. Der Text steht in
  `src/components/PilotIntro.tsx` (`PILOT_NOTICE`). **Sobald echte Daten hineinkommen, den Satz "Die Daten sind erfunden" ändern.**
- **Demo-Daten:** bleiben für den Pilot drin. Vor echten Daten entfernen: `npm run seed:demo -- --loeschen`.
- **Free-Tarif von Supabase:** keine Backups, Pause nach etwa einer Woche ohne Zugriffe (dann meldet die App "Keine Verbindung";
  im Supabase-Dashboard wieder starten). Vor echten Bauherren-Daten auf Pro wechseln (`docs/supabase-einrichten.md`, Abschnitt 7).
- **Was Tester wissen sollten:** Der Posteingangs-Agent liest noch keine Postfächer. Beispieldokumente lassen sich nicht öffnen,
  selbst hochgeladene Dateien schon. Die Postfächer in der App heißen "… (Demo)", weil sie zu den Beispieldaten gehören.

## 6. Liste: was du selbst einstellen musst

**GitHub**
- [ ] Privates Repository anlegen, `git push` (Schritt 1)
- [ ] Dateiliste prüfen: keine `.env*`, keine Konten, keine Sicherungen

**Cloudflare**
- [ ] Pages-Projekt mit Git verbinden, Build `npm run build`, Ausgabe `dist` (Schritt 2)
- [ ] Production-Variablen `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION=20`; für Preview keine Supabase-Variablen
- [ ] Testphase: `VITE_APP_MODE=pilot` (Production), danach neu bauen; später entfernen für den vollen Umfang
- [ ] Zero Trust einrichten, One-time PIN aktiv (Schritt 3)
- [ ] Access-Anwendung für `<projektname>.pages.dev` **und** `*.<projektname>.pages.dev`, Policy "Allow" mit einzelnen Adressen
- [ ] Im privaten Fenster prüfen: ohne Freigabe keine App
- [ ] Sitzungsdauer festlegen (24 Stunden oder eine Woche)

**Supabase**
- [ ] Site URL und Redirect URL auf die pages.dev-Adresse (Schritt 4)
- [ ] Mindestlänge für Passwörter
- [ ] Passwörter der Testkonten neu setzen, Konto deines Bruders prüfen (Rolle `admin`, Name)
- [ ] Entscheiden: Free oder Pro, bevor echte Daten kommen

**Nach dem ersten Aufruf der echten Adresse**
- [ ] Anmelden, Einführung erscheint, Fußzeile unten links zeigt "v0.1 – Pilot" (nicht "Demo-Daten")
- [ ] Ein Projekt anlegen, eine Datei hochladen und wieder öffnen
- [ ] Auf dem Handy über mobiles Netz (anderes Gerät, anderes Netz) dasselbe einmal

## 7. Was geprüft ist und was nicht

Geprüft (lokal, mit dem Produktions-Build und denselben Kopfzeilen, wie Cloudflare sie aus `public/_headers` setzt):

- `npm run check:build`: kein Secret key, kein Wert aus `.env.server`, keine Passwörter oder Adressen aus `konten.local.json`,
  keine Quelltext-Karten, kein Styleguide, `noindex` und `robots.txt` vorhanden.
- Anmeldung von einer anderen Adresse als der Entwicklungsadresse: funktioniert, Sitzung bleibt nach Neuladen, Abmelden löscht sie.
- Vorabanfragen (CORS) von `https://abm-pilot.pages.dev` an Anmeldung, Daten und Dateispeicher von Supabase: alle erlaubt.
- Die Sicherheits-Kopfzeilen (Content-Security-Policy u. a.) blockieren nichts, was die App braucht; es werden nur die eigene Adresse
  und das Supabase-Projekt angefragt.
- `/#/styleguide` zeigt im Produktions-Build "Diese Seite gibt es nicht".
- Einführung: erscheint beim ersten Login, nach "Verstanden" nicht mehr, auf einem zweiten Gerät wieder einmal.

Nicht geprüft:

- Cloudflare Pages und Access selbst (kein Zugang): Build dort, die Wirkung von `_headers`, der Einmalcode, der Schutz der Hauptadresse.
- Datei hochladen und öffnen unter der Content-Security-Policy im Browser (lokal nur über `check:repo` ohne Browser gelaufen).
- Safari und Firefox, echtes Handy.
- Ob Cloudflare Access und die App-Anmeldung im Alltag als doppelte Hürde stören.

## 8. Wenn etwas nicht geht

| Beobachtung | Ursache | Abhilfe |
|---|---|---|
| Seite zeigt unten links "Prototyp · Demo-Daten" | Variablen fehlen im Build | Pages → Settings → Environment variables (Production) prüfen, dann **Retry deployment**: Variablen wirken erst beim nächsten Build |
| "Die App konnte nicht starten … nur der Publishable key" | in `VITE_SUPABASE_ANON_KEY` steht der Secret key | sofort ersetzen, neu bauen, den Secret key im Supabase-Dashboard widerrufen und neu erzeugen |
| Weiße Seite, in der Browser-Konsole "Content Security Policy" | eine Kopfzeile aus `public/_headers` blockiert etwas | mir die Meldung geben; zur Not die Zeile `Content-Security-Policy` vorübergehend entfernen |
| App erscheint ohne Cloudflare-Code | Access schützt die Hauptadresse nicht | Schritt 3, Punkt 3: Domain `<projektname>.pages.dev` in der Anwendung prüfen |
| Kein Code per Mail | Adresse steht nicht in der Policy (dann kommt absichtlich keiner), oder Spam-Ordner | Policy prüfen |
| "Keine Verbindung" in der App | Supabase-Projekt pausiert (Free-Tarif) | Supabase-Dashboard → Projekt wieder starten |
