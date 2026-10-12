# Design v2

Stilbeschreibung für alle späteren Sitzungen. Die Vorbilder (fünf Bildschirmfotos aus einem Chat vom Oktober 2026) sind nicht im Repo;
dieses Dokument beschreibt den Stil in Worten. Umgesetzt in `src/styles/tokens.css` und `src/styles/components.css`,
ohne Tailwind oder UI-Bibliotheken. Keine Marken oder Texte der Vorbilder übernehmen.

## Grundhaltung

Neutral, fast schwarz, ruhig. Keine farbig getönten Flächen. Flächen unterscheiden sich nur durch kleine Helligkeitsstufen und
1-px-Ränder, nie durch Schatten. Farbe ist Information: Teal für Daten und aktive Zustände, Rot/Orange/Grün/Blau nur für Status.

## Farben

| Rolle | Wert | Verwendung |
|---|---|---|
| Hintergrund | `#0a0a0b` | Seite und Seitenleiste (gleich dunkel, Seitenleiste nur mit feinem Rand rechts) |
| Fläche 1 | `#111113` | Karten |
| Fläche 2 | `#141416` | Tabellenkopf, Hover, Eingabefelder, Toast, Menüs |
| Fläche 3 | `#1c1c1f` | aktiver Menüpunkt, gewählte Zeile, Icon-Kacheln, Secondary-Button |
| Rand | `#262629` | alle Karten, Felder, Trennlinien |
| Rand stark | `#34343a` | Hover-Rand, Outline-Button |
| Text | `#f4f4f5` | Überschriften, Werte |
| Text 2 | `#c4c4ca` | Fließtext in Tabellen |
| Gedämpft | `#8e8e96` | Beschreibungen, Achsen, Nebenzeilen |
| Leise | `#7e7e86` | Platzhalter, leere Ordner (≥ 4,5:1 auf Hintergrund und Karten) |
| Teal | `#2bb3a3` | **nur** Diagramme, aktive Zustände (Balken am aktiven Menüpunkt, Tab-Unterstrich, erledigte Prozessschritte, Fortschritt) und Fokusring |
| Status | ok `#4cc38a`, warn `#f0b24a`, danger `#ef6b63`, info `#6ea8ff` | Pills, Warnbanner, Badges, Icons; immer mit Text |

Teal erscheint nie als getönte Fläche (kein Teal-Hintergrund hinter Text). Links sind hell (Textfarbe) und werden beim Hover unterstrichen.

## Form

- Radien: Karten 14 px, Buttons und Eingabefelder 10 px, kleine Elemente (Icon-Kachel, Menüeintrag) 8 px, Pills voll rund.
- Ränder 1 px, keine Schatten (auch nicht bei Menüs, Dialogen, Toasts; dort trennt der stärkere Rand und das Abdunkeln dahinter).
- Abstände im 4er-Raster, Karten innen 20 px.

## Buttons

Alle Buttons gehören zu einer Familie (`Button`, `IconButton`):

| Variante | Aussehen | Wofür |
|---|---|---|
| primary | helle Fläche (`#f4f4f5`), dunkle Schrift, optional Pfeil- oder Plus-Icon | die eine Hauptaktion je Bereich (Neues Projekt, Bestätigen, Speichern) |
| secondary | dunkelgrau gefüllt (Fläche 3), helle Schrift, feiner Rand | häufige Nebenaktionen |
| outline | transparent, Rand stark, helle Schrift | neutrale Aktionen (Abbrechen, Ändern, Filter) |
| ghost | ohne Fläche und Rand, gedämpfte Schrift, beim Hover Fläche 2 | leise Aktionen in Listen und Kopfzeilen |
| destructive | korallrote Fläche (`#cf3f3f`, dunkler als das Status-Rot, damit weiße Schrift 4,5:1 erreicht), weiße Schrift, oft mit Papierkorb-Icon | Löschen, Ignorieren mit Folgen |

Größen sm 30 px, md 36 px, lg 42 px Höhe. Icon-Button quadratisch in denselben Höhen, meist outline oder ghost.
Schrift 13 px halbfett (lg 14 px). Fokus: 2-px-Teal-Ring mit Abstand.

## Schalter

Track 36 × 20 px, voll rund. Aktiv: heller Track, dunkler Knopf. Inaktiv: dunkler Track (Fläche 3) mit Rand, grauer Knopf.
Kein Teal. Einstellungen mit Schalter stehen als Zeilen in einer Karte, getrennt durch feine Linien.

## Toast

Unten rechts, Breite bis 380 px. Karte (Fläche 2, Rand, Radius 12). Links ein Status-Icon (Häkchen grün, Warnung rot),
daneben **fetter Titel** und darunter eine gedämpfte Beschreibung in kleinerer Schrift. Verschwindet nach wenigen Sekunden.

## Listen- und Einstellungskarten

Je Eintrag eine Zeile: links eine **Icon-Kachel** (32 px, Fläche 3, Rand, Radius 8, Icon gedämpft), daneben Titel (halbfett) und
Beschreibung (gedämpft, eine Zeile), rechts ein kleiner Button (outline, bei der Hauptaktion primary) oder ein Schalter.
Mehrere Einträge entweder als eigene Karten mit 8 px Abstand oder als Zeilen einer Karte.

## Kennzahl-Kacheln

Karte mit neutraler Icon-Kachel links neben der Beschriftung (Icon in Statusfarbe nur bei Warnwerten), großer Wert (32 px),
gedämpfte Fußzeile.

## Diagramme

- **Flächendiagramm** (`AreaChart`) für Verläufe über die Zeit: weiche, aber nicht überschwingende Linie (monotone Interpolation),
  2 px, leichtes Leuchten; darunter ein Verlauf von Teal (ca. 35 %) nach transparent; Punkte als dunkler Kreis mit Teal-Ring;
  sehr leise horizontale Gitterlinien (keine senkrechten), Achse ab 0, Monatskürzel unten in Gedämpft.
  Oben im Kartenkopf Titel, Beschreibung und eine **Trend-Pill** (dunkle Fläche, Pfeil ↗/↘ und Prozent gegenüber Vormonat).
  Zweite Serie hell/neutral statt Teal. Tooltip beim Hover, Tabellenansicht darunter, Animation nur ohne `prefers-reduced-motion`.
- **Säulen** für Zählwerte (z. B. neue Projekte pro Monat), gedämpftes Teal, aktuelle Periode in vollem Teal.
- Gestapelte Säulen: Teal + Violett (geprüfte Farbkombination).

## Kopfzeile

Suche links (Strg+K, auch Befehle wie "Neue Aufgabe"), rechts die Glocke als Ghost-Icon-Button mit kleinem roten Zähler und
ein einzelner primärer Button "+ Neues Projekt". Kein geteilter Button, keine Teal-Fläche.

## Seitenpanel und Filter-Chips

- **Seitenpanel (`Drawer`)**: von rechts, 440 px breit (mobil volle Breite), Fläche `--surface`, Kopf mit Titel und Schließen, Fuß mit
  höchstens zwei Buttons (Outline + Primär). Escape und Klick daneben schließen, der Fokus kehrt zur Zeile zurück.
  Für Details zu einer Tabellenzeile, wenn eine eigene Seite zu viel wäre.
- **Chips**: Pillenform, Rahmen `--border`, Nummer in Mono; gewählt: helle Fläche wie der primäre Button. Für kurze, feste Mengen
  (Hauptordner 01–11); bei wenig Platz scrollt die Reihe waagerecht.
