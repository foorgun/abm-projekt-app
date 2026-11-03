# Umgebungen: development und production

| | development | production |
|---|---|---|
| Supabase-Projekt | bisheriges Projekt `abm-pilot.`, Demodaten | `abm-prod`, Frankfurt, keine Demodaten |
| Adresse der App | Worker `abm-dev` (noch anzulegen) | `https://abm-pilot.fcetin19.workers.dev` |
| Stand der Migrationen | bis 0022 | bis 0021 (0022 folgt mit PR #9) |
| Anthropic | Workspace `abm-dev` | Workspace `abm-prod` |
| KI-Auslesung | an | **aus**, bis der AVV unterschrieben ist |
| Lokale Werte | `.env.ziel.development` | `.env.ziel.production` |
| Konten | `konten.development.local.json` | `konten.production.local.json` |
| Sicherungen | `backups/development/` | `backups/production/` |
| Erzeugtes SQL | `supabase/.out/development/` | `supabase/.out/production/` |

Alle diese Dateien stehen in `.gitignore`. `npm run check:secrets` sperrt sie zusätzlich bei jedem Commit und in der CI, auch bei `git add -f`.

## Regeln

- `npm run dev` nutzt immer development. Der Entwicklungsserver bricht ab, falls er eine Adresse von production bekäme.
- Jedes Skript verlangt `-- --ziel development` oder `-- --ziel production`, einen Standard gibt es nicht.
- Bei production muss `abm-prod` eingetippt werden. Ohne Eingabe bricht das Skript ab.
- Die Skripte vergleichen Ref und URL mit dem Ziel (`scripts/lib/ziele.ts`). Vertauschte Dateien werden abgewiesen.
- In production sind nur die neuen Schlüssel erlaubt (`sb_publishable_…`, `sb_secret_…`).
- `seed:demo` und `check:repo` laufen nur gegen development.
- Nie `supabase db push` und nie `supabase link` als Grundlage: Die Ref kommt immer aus dem Ziel.

## Befehle

| Befehl (`npm run …  -- --ziel <ziel>`) | Was | Braucht |
|---|---|---|
| `db:bundle [--ab N]` | erzeugt die SQL-Datei, spielt nichts ein | nichts |
| `db:einspielen --datei supabase/.out/<ziel>/….sql` | spielt sie ein, eine Transaktion | Zugangs-Token |
| `functions:deploy [name …]` | Edge Functions, `verify_jwt` aus `config.toml` | Zugangs-Token |
| `secrets:setzen --liste` | Namen der Secrets | Zugangs-Token |
| `secrets:setzen ANTHROPIC_API_KEY` | prüft den Schlüssel beim Dienst, setzt ihn dann | Zugangs-Token, Anthropic-Schlüssel |
| `secrets:setzen EXTRACTOR_ENABLED=true` | Einstellungen (nur `EXTRACTOR_*`) | Zugangs-Token |
| `auth:einrichten` | Auth-Einstellungen und Daten-API, nur production | Zugangs-Token |
| `check:setup` | von außen, ohne Anmeldung | Publishable key |
| `check:roles` | meldet sich je Konto an | Publishable key, Kontenliste |
| `check:ki` | Auslesung mit dem erfundenen Dokument `scripts/fixtures/demo-vertrag.png` | Publishable key, Admin-Konto |
| `check:build` | baut mit den öffentlichen Werten und prüft `dist/` | Publishable key |
| `export:backup` | Tabellen als JSON, ohne Dateien | Secret key |
| `konten:anlegen` | Konten und Rollen | Secret key |
| `vorlagen:hochladen` | PDF-Vorlagen des Planungsprotokolls | Secret key |

## Ablauf pro Änderung

1. **Branch** von `main`, kleine Schritte, Commit-Sperre läuft automatisch.
2. **CI** grün: Commit-Sperre, Typprüfung, Tests, Build, Datenbank- und RLS-Tests.
3. **Test in development:** `db:bundle` und `db:einspielen`, bei Bedarf `functions:deploy`, danach `check:setup`, `check:roles`, `check:repo`. Oberfläche im Browser ansehen.
4. **Sicherung:** `export:backup -- --ziel production`. Sie enthält keine Dateien aus dem Speicher.
5. **Migration auf production:** `db:bundle -- --ziel production --ab N`, Datei lesen, `db:einspielen`.
6. **Merge und Deploy:** PR nach `main`, Cloudflare baut den Worker neu. Functions mit `functions:deploy -- --ziel production`.
7. **Prüfen:** `check:setup` und `check:roles -- --ziel production`.

### Regel: Migrationen nur abwärtskompatibel

Solange jemand mit der alten Version arbeitet, muss die alte Version der App mit der neuen Datenbank laufen. Deshalb kommt die Migration **vor** dem Merge. Spalten und Werte kommen dazu. Entfernen und Umbenennen folgen frühestens in einer späteren Migration, wenn keine Version sie mehr nutzt.

Den Stand je Umgebung zeigt die Tabelle oben. Eine automatische Migrationshistorie gibt es nicht, deshalb nach jedem Einspielen hier nachtragen.

## Wo welche Schlüssel liegen

| Schlüssel | Ort (nur lokal oder im Dienst) | Nie |
|---|---|---|
| Publishable key | `.env.ziel.<ziel>`, Build-Variable des Workers (`VITE_SUPABASE_ANON_KEY`) | |
| Secret key | `.env.ziel.<ziel>`, in den Functions automatisch als `SUPABASE_SECRET_KEYS` | Frontend, Cloudflare, Repo |
| Zugangs-Token (je Umgebung ein eigenes, sieht nur sein Projekt) | `.env.ziel.<ziel>` | Repo, Chat |
| Datenbank-Passwort | `.env.ziel.<ziel>` | Repo, Chat |
| Anthropic-Schlüssel | `.env.ziel.<ziel>`, Secret `ANTHROPIC_API_KEY` der Function | Frontend, Cloudflare, Repo |
| Passwörter der Konten | `konten.<ziel>.local.json` | Repo, Chat |

Gelangt ein Schlüssel doch in einen Commit, Chat oder Mail: im jeweiligen Dienst widerrufen und neu erzeugen.

## Ablaufdaten

| Was | Ablauf | Zu tun |
|---|---|---|
| Zugangs-Token development und production | 01.02.2027 (erzeugt 03.11.2026, 90 Tage) | rechtzeitig neu erzeugen, in die Datei eintragen |
| Anthropic `abm-dev` und `abm-prod` | beim Erzeugen in `.env.ziel.<ziel>` notieren | vor Ablauf ersetzen, dann `secrets:setzen` |
| Anthropic `abm-pilot` | 11.11.2026, nicht mehr im Einsatz | widerrufen |
| Alte Supabase-Schlüssel (anon, service_role) | Abschaltung Anfang 2027 | Rückfall in `supabase/functions/_shared/serviceKey.ts` entfernen, danach alte Schlüssel in beiden Projekten abschalten |

Bei abgelaufenem oder ungültigem KI-Schlüssel sehen Admins in der App „KI-Schlüssel ungültig oder abgelaufen“. Dann neuen Schlüssel in die Datei eintragen und `secrets:setzen -- --ziel <ziel> ANTHROPIC_API_KEY` ausführen.

## Auftragsverarbeitung (AVV)

Der AVV besteht zwischen Furkan Cetin als Auftragsverarbeiter und ABM als Verantwortlichem. Anthropic und Supabase sind Unterauftragnehmer von Furkan Cetin.

Die KI-Auslesung sendet Seiten von Verträgen mit personenbezogenen Daten der Bauherren an Anthropic. Sie bleibt in production ausgeschaltet (`EXTRACTOR_ENABLED=false`), bis der AVV unterschrieben ist. Tests vorher nur mit dem erfundenen Dokument. Freischalten: `secrets:setzen -- --ziel production EXTRACTOR_ENABLED=true` und im Worker `VITE_PROJECT_EXTRACTOR=edge`.

## Oberfläche in production

Der Build erkennt production an der Projektadresse (`src/lib/umgebung.ts`). Der Willkommenshinweis macht dort keine Aussage über erfundene Daten, die Terminkarte mit den Demo-Terminen fehlt.

## Einrichtung von production: was gesetzt ist

Auth: Selbstregistrierung aus, E-Mail/Passwort an, Mindestlänge 12, Site-URL und Redirects auf die Adresse oben. Daten-API: nur Schema `public`. Stammdaten (Hausbaufirmen mit 8161, 8185, 8260, Prozessschritte, Ordnervorlage) kommen aus den Migrationen, die Vorlagen des Planungsprotokolls aus `vorlagen:hochladen`. Die Bürodaten pflegt ein Admin in den Einstellungen. Einen erzwungenen Passwortwechsel gibt es nicht, jedes Konto kann sein Passwort im Benutzermenü ändern.
