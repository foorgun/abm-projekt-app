# CLAUDE.md – ABM Projekt-App

Interne Web-App für ABM Architektur und Baumanagement (Becker und Cetin GbR, Ulm, ca. 10 Mitarbeiter).
Ersetzt die Excel-Projektliste, zeigt pro Projekt den Prozessstand, offene Aufgaben und Warnungen
und enthält einen Posteingangs-Agenten, der Mail-Anhänge automatisch in den richtigen Projektordner sortiert.

Lies zuerst `BUILD.md` (Bauplan, Reihenfolge, Abnahmekriterien), dann `docs/ordnerstruktur.md`,
dann das Design-Referenzbild `docs/design-referenz.png`.

## Regeln

- Sprache der Oberfläche, Texte und Doku: **Deutsch** (Sie-Form vermeiden, neutral/du). Code und Bezeichner: Englisch oder wie im Bestand.
- **Keine echten Daten ins Repo.** Excel, Mails, Namen echter Bauherren, Importergebnisse, `.env` sind in `.gitignore`. Demo-Daten sind erfunden.
- Stack: Vite, React 18, TypeScript (strict), react-router-dom (HashRouter), Supabase (Postgres, Auth, Storage, Edge Functions), vitest. Schriften lokal über `@fontsource` (DSGVO), keine externen CDNs, keine Tracker.
- Alle Datenzugriffe über das `Repo`-Interface (`src/lib/repo.ts`) mit `demoRepo` und `supabaseRepo`. Die UI spricht nie direkt mit `supabase`. Ohne `VITE_SUPABASE_*` läuft die App im Demo-Modus.
- Zugriffsschutz in der Datenbank (RLS), nicht im Frontend. Jede neue Tabelle: RLS-Policy plus Test in `supabase/tests/rls_test.sql`. Rollen: `admin`, `mitarbeiter`, `freiberufler` (nur zugewiesene Projekte, keine Rechnungen, keine Bauherren-Kontaktdaten).
- Migrationen: neue Datei pro Änderung (`000N_*.sql`). Erst nach dem ersten Produktiveinsatz sind bestehende Dateien tabu.
- **Der Agent löscht nie etwas und sendet nie Mails.** Er liest Postfächer (nur lesen), legt Kopien der Anhänge ab und protokolliert jede Entscheidung. Unsichere Zuordnungen gehen in die Prüfliste, nicht automatisch ins Archiv.
- Aktive CAD-Dateien (Nemetschek/Allplan, `.dwg`, `.pln`) bleiben auf dem Fileserver. Die App verwaltet nur die Dokumentenebene (PDF, Office, Bilder, Mails).
- Warn-Schwellenwerte (`src/lib/alerts.ts`) sind Annahmen, nicht bestätigt. Immer als Konstanten halten und mit Tests absichern.
- KI-Aufrufe (Zuordnung von Dokumenten) nur über eine Edge Function, nie mit API-Key im Frontend. Nur Daten senden, die zur Zuordnung nötig sind (Betreff, Absender, Dateiname, Textauszug).

## Design

Dunkel, ruhig, dicht. Orientierung: `docs/design-referenz.png` (linke Navigation mit Gruppen, Kopfzeile mit Suche,
KPI-Kacheln, zwei Diagramme, Tabelle "Letzte Aktivitäten"), aber im **Dark Mode**. Details in `BUILD.md` Abschnitt 4.
Farben und Abstände nur über CSS-Variablen (Tokens), keine Hex-Werte in Komponenten.

## Befehle

```
npm install
npm run dev          # Demo-Modus auf http://localhost:5173
npm run typecheck && npm test && npm run build    # vor jedem Commit
python3 -m unittest discover -s tools -p "test_*.py"   # Excel-Import
bash tools/test-db.sh   # Datenbank- und RLS-Tests (temporäres Postgres, nicht als root)
```

## Vorgehen

Arbeite in kleinen Schritten gemäß `BUILD.md`. Nach jedem Schritt: Typprüfung, Tests, Build, kurzer Commit
(Conventional Commits, deutsch oder englisch einheitlich). Öffne die App im Browser und prüfe die Oberfläche
tatsächlich, bevor du einen UI-Schritt als fertig meldest. Nenne am Ende jedes Schritts, was nicht getestet ist.
