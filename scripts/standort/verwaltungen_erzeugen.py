#!/usr/bin/env python3
"""Erzeugt supabase/functions/standort-analyse/verwaltungen.ts aus dem Anschriftenverzeichnis der Gemeinde- und Stadtverwaltungen
(Statistische Ämter des Bundes und der Länder), nur BW, BY und HE.

Aufruf: python3 scripts/standort/verwaltungen_erzeugen.py <JJJJMMTT_Anschriften_der_Gemeinde_und_Stadtverwaltungen.xlsx>
Quelle: https://www.statistikportal.de/de/veroeffentlichungen/anschriftenverzeichnis (Datei nicht im Repo). Braucht openpyxl.
Nutzung laut Quelle frei, Vervielfältigung und Verbreitung mit Quellenangabe gestattet.

Je Gemeinde (Satzart 60, Schlüssel AGS) gibt es eine oder zwei Zeilen: die Verwaltung der Gemeinde selbst und ggf. die ihrer
Verwaltungsgemeinschaft bzw. ihres Gemeindeverwaltungsverbands. Genommen wird die Zeile der Gemeinde. Gibt es nur eine Zeile,
dann diese. Felder: Verwaltung, Straße, PLZ, Ort, E-Mail (Straße und E-Mail fehlen in einigen Zeilen).
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ZIEL = Path(__file__).resolve().parents[2] / "supabase/functions/standort-analyse/verwaltungen.ts"
LAENDER = {"06", "08", "09"}
VERBUND = re.compile(r"^(Verwaltungsgemeinschaft|Gemeindeverwaltungsverband|Vereinbarte Verwaltungsgemeinschaft)\b")
SPALTEN = ["Land", None, "Satzart", "Textkennzeichen", None, "Amtlicher Regionalschlüssel (ARS)", "Amtlicher Gemeindeschlüssel (AGS)", "Gemeinde/Stadt", "Verwaltungssitz", "Straße", "PLZ", "Ort", "E-Mail-Adressen"]


def text(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None and str(v).strip() else None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    blatt = next((n for n in wb.sheetnames if n.startswith("Anschriften_")), None)
    if not blatt:
        sys.exit("Abbruch: Blatt „Anschriften_…“ fehlt")
    stand = re.search(r"(\d{2})_(\d{2})_(\d{4})$", blatt)
    if not stand:
        sys.exit(f"Abbruch: Stand im Blattnamen {blatt!r} nicht lesbar")
    zeilen = wb[blatt].iter_rows(values_only=True)
    kopf = None
    for r in zeilen:
        if r and r[0] == "Land":
            kopf = [text(x) for x in r[: len(SPALTEN)]]
            break
    if kopf != [text(x) for x in SPALTEN]:
        sys.exit(f"Abbruch: Spalten passen nicht zur erwarteten Form: {kopf}")

    je_ags = {}
    for r in zeilen:
        if str(r[0]) not in LAENDER or r[2] != 60:
            continue
        ags = str(r[6])
        if not re.fullmatch(r"\d{8}", ags):
            sys.exit(f"Abbruch: Schlüssel {ags!r} unlesbar")
        sitz, strasse, plz, ort, mail = (text(r[i]) for i in (8, 9, 10, 11, 12))
        # Die Straße fehlt bei einigen Städten (nur Postfach-PLZ)
        if not (sitz and plz and ort) or not re.fullmatch(r"\d{5}", plz):
            sys.exit(f"Abbruch: unvollständige Anschrift bei {ags}: {r[7:13]}")
        if mail and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", mail):
            mail = None
        je_ags.setdefault(ags, []).append((sitz, strasse, plz, ort, mail))

    out = {}
    for ags, liste in sorted(je_ags.items()):
        eigene = [x for x in liste if not VERBUND.match(x[0])]
        if len(liste) > 2 or len(eigene) > 1:
            sys.exit(f"Abbruch: unerwartete Zeilen bei {ags}: {liste}")
        out[ags] = list(eigene[0] if eigene else liste[0])

    anzahl = {l: sum(1 for a in out if a.startswith(l)) for l in sorted(LAENDER)}
    if min(anzahl.values()) < 400:
        sys.exit(f"Abbruch: zu wenige Gemeinden {anzahl}")
    kopfzeile = (
        "// Erzeugt mit scripts/standort/verwaltungen_erzeugen.py, nicht von Hand ändern.\n"
        "// Quelle: Statistische Ämter des Bundes und der Länder, Anschriften der Gemeinde- und Stadtverwaltungen,\n"
        f"// Stand {stand.group(1)}.{stand.group(2)}.{stand.group(3)}. Vervielfältigung und Verbreitung mit Quellenangabe gestattet.\n"
        "// Schlüssel: AGS. Werte: Verwaltung, Straße (oder null), PLZ, Ort, E-Mail (oder null).\n"
    )
    ZIEL.write_text(
        kopfzeile
        + f'export const VERWALTUNGEN_STAND = "{stand.group(1)}.{stand.group(2)}.{stand.group(3)}";\n'
        + "export const VERWALTUNGEN: Record<string, [string, string | null, string, string, string | null]> = "
        + json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"{ZIEL.name}: {len(out)} Gemeinden {anzahl}, ohne E-Mail {sum(1 for v in out.values() if not v[4])}")


if __name__ == "__main__":
    main()
