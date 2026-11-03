# Umgebungen: development und production

| | development | production |
|---|---|---|
| Supabase-Projekt | bisheriges Projekt, Demodaten | `abm-prod`, Frankfurt, keine Demodaten |
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
| `check:setup` | von außen, ohne Anmeldung | Publishable key |
| `check:roles` | meldet sich je Konto an | Publishable key, Kontenliste |
| `check:ki` | Auslesung mit dem erfundenen Dokument `scripts/fixtures/demo-vertrag.png` | Publishable key, Admin-Konto |
| `check:build` | baut mit den öffentlichen Werten und prüft `dist/` | Publishable key |
| `export:backup` | Tabellen als JSON, ohne Dateien | Secret key |
| `konten:anlegen` | Konten und Rollen | Secret key |
| `vorlagen:hochladen` | PDF-Vorlagen des Planungsprotokolls | Secret key |

Der Ablauf pro Änderung folgt nach der Einrichtung von production.
