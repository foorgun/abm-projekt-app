#!/usr/bin/env python3
"""Erzeugt supabase/functions/standort-analyse/gemeinden.ts aus dem Gemeindeverzeichnis des Statistischen Bundesamts (BW, BY, HE).

Aufruf: python3 scripts/standort/gemeinden_erzeugen.py <AuszugGV…QAktuell.xlsx>
Quelle: https://www.destatis.de (Gemeindeverzeichnis, "Alle politisch selbständigen Gemeinden"; Datei nicht im Repo). Braucht openpyxl.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ZIEL = Path(__file__).resolve().parents[2] / "supabase/functions/standort-analyse/gemeinden.ts"
LAENDER = {"06": "HE", "08": "BW", "09": "BY"}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    blatt = next(n for n in wb.sheetnames if n.startswith("Onlineprodukt"))
    stand = re.search(r"(\d{2})(\d{2})(\d{4})$", blatt)
    out = {l: [] for l in LAENDER.values()}
    for r in wb[blatt].iter_rows(values_only=True):
        if str(r[0]) != "60" or str(r[2]) not in LAENDER:
            continue
        ags = f"{r[2]}{r[3]}{r[4]}{r[6]}"
        if not re.fullmatch(r"\d{8}", ags):
            sys.exit(f"Abbruch: Schlüssel {ags!r} unlesbar")
        # "Ulm, Universitätsstadt" → "Ulm"
        name = str(r[7]).split(",")[0].strip()
        lon, lat = float(str(r[14]).replace(",", ".")), float(str(r[15]).replace(",", "."))
        if not (47 < lat < 52 and 7 < lon < 14):
            sys.exit(f"Abbruch: Koordinaten von {name} unplausibel")
        out[LAENDER[str(r[2])]].append([ags, name, round(lat, 3), round(lon, 3)])
    print({l: len(x) for l, x in out.items()})
    ts = (
        f"// ERZEUGT von scripts/standort/gemeinden_erzeugen.py. Nicht von Hand bearbeiten. Stand {stand.group(1)}.{stand.group(2)}.{stand.group(3)}.\n"
        "// Quelle: Statistisches Bundesamt (Destatis), Gemeindeverzeichnis-Informationssystem GV-ISys. Vervielfältigung und Verbreitung,\n"
        "// auch auszugsweise, mit Quellenangabe gestattet. Je Gemeinde: Schlüssel, Name, Breite und Länge des Mittelpunkts.\n\n"
        'export const GEMEINDEN: Record<"BW" | "BY" | "HE", [string, string, number, number][]> = '
        + json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    ZIEL.write_text(ts, encoding="utf-8")
    print(f"{ZIEL.name}: {len(ts) // 1024} KB")


if __name__ == "__main__":
    main()
