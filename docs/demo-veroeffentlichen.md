# Demo als statische Webseite veröffentlichen (mit Passwortschutz)

Nur Beschreibung. Noch nichts eingerichtet.

## Warum das ohne echte Daten geht

- Ohne `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` baut die App im **Demo-Modus**: Sie enthält nur die erfundenen Daten aus
  `src/data/demoData.ts` und läuft vollständig im Browser. Es gibt keinen Server und keine Datenbank, nichts wird gespeichert.
- Jeder Besucher hat seinen eigenen Stand, nur im Arbeitsspeicher seines Browsers. Neuladen oder "Demo zurücksetzen" stellt den Ausgangszustand her.
- Zieht jemand während der Vorführung eine echte Datei in einen Ordner, wird sie **nicht hochgeladen**: Die Demo merkt sich nur
  Name und Größe im Arbeitsspeicher des Browsers.
- Schriften liegen lokal im Build, es gibt keine externen CDNs und keine Tracker. Das Routing nutzt `#/…` (HashRouter), deshalb
  braucht der Host keine Sonderregeln für Unterseiten.

## Vor dem Veröffentlichen: Prüfliste

1. `git status` ist sauber, es liegen keine Excel-Dateien, Mails oder `.env` im Repo (stehen in `.gitignore`).
2. Lokal bauen und prüfen, dass kein Supabase-Zugang im Ergebnis steckt:
   ```bash
   npm run typecheck && npm test && npm run build
   grep -ri "supabase.co" dist/ || echo "ok: kein Supabase-Zugang im Build"
   npm run preview   # http://localhost:4173 ansehen, unten links muss "Demo-Daten" stehen
   ```
3. Beim Host **keine** Umgebungsvariablen `VITE_SUPABASE_*` setzen.
4. Optional, damit Suchmaschinen die Seite nicht aufnehmen (zusätzlich zum `noindex` in `index.html`):
   Datei `public/_headers` mit
   ```
   /*
     X-Robots-Tag: noindex, nofollow
     Referrer-Policy: no-referrer
   ```
   (wird von Cloudflare Pages und Netlify gleich verstanden).

## Variante A (empfohlen): Cloudflare Pages + Cloudflare Access

Kostenlos für unseren Zweck (Access ist bis 50 Personen frei). Der Passwortschutz ist ein Login per Einmal-Code an eine
freigegebene Mailadresse, also kein gemeinsames Passwort, das herumgereicht wird.

**1. Seite anlegen** (eine der zwei Arten)

- *Mit GitHub (aktualisiert sich bei jedem Push):* Cloudflare-Dashboard → *Workers & Pages* → *Erstellen* → *Pages* →
  *Mit Git verbinden* → privates Repo `abm-projekt-app` wählen.
  Build-Befehl `npm run build`, Ausgabeverzeichnis `dist`, Umgebungsvariable `NODE_VERSION = 20`.
  Keine `VITE_SUPABASE_*` eintragen.
- *Ohne GitHub (Ordner hochladen):* lokal bauen und hochladen:
  ```bash
  npm run build
  npx wrangler pages deploy dist --project-name abm-demo
  ```
  Danach ist die Demo unter `https://abm-demo.pages.dev` erreichbar (noch ohne Schutz, deshalb Schritt 2 sofort anschließen).

**2. Zugriff schützen**

Cloudflare-Dashboard → *Zero Trust* → *Access* → *Applications* → *Add an application* → *Self-hosted*:

- Domain: `abm-demo.pages.dev`; zweite Regel für Vorschau-Versionen: `*.abm-demo.pages.dev`
- Policy: *Allow* · *Emails* → die Adressen der Geschäftsführung, der IT und deine eigene
- Login-Methode: *One-time PIN* (Code per Mail, kein Konto nötig)
- Sitzungsdauer: z. B. 24 Stunden

Ergebnis: Wer die Adresse öffnet, gibt seine Mailadresse ein und bekommt einen Code. Nur freigegebene Adressen kommen durch.

**3. Prüfen**

- In einem privaten Browserfenster öffnen: Es muss die Cloudflare-Anmeldung erscheinen, nicht die App.
- Mit einer nicht freigegebenen Adresse testen: Kein Zugang.
- Nach der Anmeldung: unten links steht "Demo-Daten".

## Variante B: Netlify

Geht auch, aber der Passwortschutz für ganze Seiten kostet bei Netlify einen bezahlten Tarif (Pro).

- Neue Seite aus dem GitHub-Repo; Build-Befehl `npm run build`, Verzeichnis `dist`.
- Schutz entweder über *Site configuration → Access & security → Password protection* (ein gemeinsames Passwort)
  oder per Basic-Auth in `public/_headers`:
  ```
  /*
    Basic-Auth: abm:<langes-zufälliges-Passwort>
  ```
  Achtung: Dann steht das Passwort im Repo. Besser die Einstellung im Netlify-Dashboard nutzen.

## Danach

- **Aktualisieren:** mit GitHub-Anbindung reicht `git push`; ohne: erneut `npm run build` und `wrangler pages deploy`.
- **Abschalten:** Pages-Projekt löschen (Cloudflare → Workers & Pages → Projekt → Einstellungen → Löschen); die Access-Regel mit entfernen.
- **Nicht vermischen:** Die Demo-Seite bekommt nie Supabase-Zugangsdaten. Für den Echtbetrieb (Schritt 8) gibt es eine eigene,
  getrennte Adresse mit echter Anmeldung.
