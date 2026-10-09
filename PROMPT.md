# Prompt für Claude Code in VS Code

## So startest du

1. Ordner `abm-projekt-app` anlegen, entpacken bzw. den Inhalt dieses Kits hineinkopieren (`CLAUDE.md`, `BUILD.md`, `PROMPT.md`, `docs/`, `reuse/`).
2. In VS Code: *Datei › Ordner öffnen* → `abm-projekt-app`.
3. Terminal in VS Code öffnen (Strg+ö bzw. Ctrl+`) und `claude` starten (Claude-Code-Erweiterung oder CLI).
4. Den Prompt unten einfügen.
5. Optional vorher: leeres privates GitHub-Repo `abm-projekt-app` anlegen, damit Claude am Ende pushen kann.

## Prompt (kopieren)

```
Wir bauen eine interne Projekt-App für ABM Architektur und Baumanagement, komplett neu.

Lies zuerst CLAUDE.md, dann BUILD.md, dann docs/ordnerstruktur.md und schau dir docs/design-referenz.png an.
Das Referenzbild zeigt die gewünschte Bildsprache (linke Navigation mit Gruppen, Kopfzeile mit Suche, KPI-Kacheln,
zwei Diagramme, Aktivitätstabelle), aber wir bauen es im Dark Mode, mit ABM-Logo (docs/abm-logo.png), deutschen Texten
und den Seiten aus BUILD.md Abschnitt 5, inklusive des Posteingangs-Agenten (Dashboard, Prüfliste, Postfächer).

Vorgehen:
1. Fasse in fünf Sätzen zusammen, was du verstanden hast, und nenne Annahmen oder Widersprüche, die dir in BUILD.md auffallen. Stelle nur Fragen, die du nicht selbst sinnvoll entscheiden kannst.
2. Arbeite BUILD.md Schritt 0 bis 7 der Reihe nach ab. Das ist der klickbare Demo-Prototyp mit erfundenen Daten, ohne Supabase-Zugang.
3. Nach jedem Schritt: npm run typecheck, npm test und npm run build ausführen, die App im Browser öffnen und die Oberfläche
   wirklich ansehen (Screenshot bei 1280 px und 390 px), Fehler beheben, dann committen. Melde mir pro Schritt in drei Zeilen,
   was fertig ist, was nicht getestet wurde und was du entschieden hast.
4. Nach Schritt 1 und nach Schritt 3 halte an und zeige mir die Screenshots, bevor du weiterbaust. Das Design ist der Knackpunkt.
5. Schritt 8 bis 10 (echtes Supabase, echter Agent) erst, wenn ich es sage.

Harte Regeln: keine echten Daten ins Repo, keine externen CDNs oder Schriften, der Agent liest nur und löscht oder sendet nie etwas,
alle Datenzugriffe über das Repo-Interface, Dark Mode über Tokens.
Wenn etwas in BUILD.md unklar ist, wähle die einfachste vernünftige Lösung und schreibe die Entscheidung in docs/entscheidungen.md.
```

## Danach (wenn der Prototyp steht)

```
Weiter mit Schritt 8: Supabase scharf. Ich habe ein Projekt in Frankfurt angelegt, die Zugangsdaten stehen in .env.
Schreibe supabaseRepo neu, teste gegen das echte Projekt, importiere die Excel-Liste mit tools/import_excel.py
(Datei liegt lokal unter <Pfad>, nicht ins Repo) und prüfe die Rolle "freiberufler".
```

## Tipps

- Ist das Ergebnis nach Schritt 1 optisch nicht gut genug, sag es dort und schicke einen Screenshot mit Kritik. Eine Rückmeldung zum Design in diesem Schritt spart viele spätere Korrekturen.
- `/clear` zwischen den Schritten ist in Ordnung, `CLAUDE.md` und `BUILD.md` geben den Kontext zurück.
- Den Ordner `reuse/` nach Schritt 0 nicht löschen, bis Schritt 8 durch ist.
