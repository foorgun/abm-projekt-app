# Entscheidungen

Wo `BUILD.md` offen oder widersprüchlich ist, steht hier die gewählte (einfachste vernünftige) Lösung.
Neueste Einträge unten.

## Schritt 0 – Setup

- **Fehlende Module aus `reuse/`:** `alerts.ts` importiert `./steps` und `./types`, die nicht mitgeliefert wurden.
  Beide sind in `src/lib/` neu geschrieben, passend zu den Tests in `alerts.test.ts`.
- **Schrittliste:** Die fünf Excel-Schritte stehen als `CORE_STEPS` in `src/lib/steps.ts` (gleich wie Migration 0001),
  weil die Warnregeln sie per Key referenzieren. Alle Anzeigen (Stepper, Pipeline, Fortschritt) lesen die Liste aus
  `step_definitions` über das Repo, nicht aus dem Code.
- **Logo:** `docs/abm-logo.png` wurde auf den Schriftzug zugeschnitten (`src/assets/abm-logo.png`). Der schwarze
  Hintergrund wird in der Seitenleiste per `mix-blend-mode: screen` unsichtbar, eine zweite Logodatei ist nicht nötig.
- **Screenshots:** `scripts/screenshots.mjs` nutzt `playwright-core` mit dem installierten Google Chrome
  (kein Browser-Download, kein CDN). Ausgabe in `screenshots/` (nicht im Repo).
- **`tools/test-db.sh`:** sucht Postgres zusätzlich unter `/usr/local/opt/postgresql*/bin` (Homebrew auf Intel-Macs).
- **CI:** `.github/workflows/ci.yml` mit drei Jobs (Web, Importer, Datenbank). Ohne GitHub-Remote noch nicht gelaufen.
- **`reuse/`** bleibt bis Schritt 8 liegen (siehe PROMPT.md), die Arbeitskopien liegen in `supabase/`, `tools/`, `src/lib/`.

## Schritt 1 – Design-System und Shell

- **Diagrammfarbe:** `--chart-1` ist `#25a294`, eine Stufe dunkler als `--accent` (`#2bb3a3`). Der Akzent lag knapp außerhalb
  des Helligkeitsbands für Diagrammflächen auf `--surface`. Zweite Serie (gestapelt, nur Agent-Diagramm) `--chart-2` `#8b7cf6`,
  geprüft auf Farbfehlsichtigkeit (ΔE 16) und Kontrast ≥ 3:1. Statusfarben (ok/warn/danger/info) werden nie als Serienfarbe genutzt.
- **Keine Verläufe:** Skeleton pulsiert über Deckkraft statt mit Schimmer-Verlauf, Select-Pfeil ist ein Icon.
- **Zusätzliche Tokens:** `--surface-3`, `--border-strong`, `--text-2`, `--faint`, `--focus`, `--overlay`, Radien, Abstände, Schriftgrößen.
  Hex-Werte stehen nur in `tokens.css`.
- **Tabs:** zwei Varianten derselben Komponente, `line` (Seitenbereiche) und `segmented` (Filter wie Heute/Woche).
- **Einklappen:** ab 1024 px klappt « die Seitenleiste auf Icons ein (gespeichert in `localStorage`, nur Komfort).
  Darunter ist sie ein Drawer über das Menü-Icon, Escape oder Klick daneben schließt ihn.
- **Benutzer im Demo-Modus:** erfundene "Jana Roth", Rolle über das Benutzermenü umschaltbar (Admin/Mitarbeiter/Freiberufler),
  damit die Freiberufler-Sicht vorführbar ist. Echter Schutz bleibt RLS (Schritt 8).
- **Kein Dark-Mode-Schalter** wie im Referenzbild: Dark ist fest, Light ist nur vorbereitet.
- **Diagramme:** eigene SVG-Komponenten (Säulen, gestapelt, horizontal, Linie), keine Diagrammbibliothek.
  Jede hat Tooltip und eine aufklappbare Tabellenansicht für Barrierefreiheit.
- **Dashboard in Schritt 1** zeigt den Ladezustand (Skeleton) in der Zielstruktur. Die vollständige Komposition mit Beispielwerten
  steht unter `#/styleguide`.
