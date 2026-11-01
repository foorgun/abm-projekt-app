#!/usr/bin/env python3
"""Erzeugt supabase/functions/standort-analyse/zonen.ts aus den amtlichen DIBt-Tabellen (BW, BY, HE).

Aufruf: python3 scripts/standort/zonen_erzeugen.py <Schneelastzonen.xlsx> <Erdbebenzonen.xlsx>
Quelle: https://www.dibt.de/de/wir-bieten/technische-baubestimmungen/ (Dateien nicht im Repo).
Braucht openpyxl. Bricht ab, wenn die Tabellen nicht mehr zur erwarteten Form passen: lieber keine Daten als falsche.
"""
import json
import re
import sys
import warnings
from pathlib import Path

import openpyxl

warnings.simplefilter("ignore")
ZIEL = Path(__file__).resolve().parents[2] / "supabase/functions/standort-analyse/zonen.ts"
ZONEN = {"1", "1a", "2", "2a", "3", "3a", ">3a"}

# Kreisschlüssel Baden-Württemberg (die Tabelle nennt nur Namen)
BW_KREISE = {
    "SK Stuttgart": "08111", "LK Böblingen": "08115", "LK Esslingen": "08116", "LK Göppingen": "08117", "LK Ludwigsburg": "08118",
    "Rems-Murr-Kreis": "08119", "SK Heilbronn": "08121", "LK Heilbronn": "08125", "Hohenlohekreis": "08126", "Schwäbisch Hall": "08127",
    "Main-Tauber-Kreis": "08128", "LK Heidenheim": "08135", "Ostalbkreis": "08136", "SK Baden-Baden": "08211", "SK Karlsruhe": "08212",
    "LK Karlsruhe": "08215", "LK Rastatt": "08216", "SK Heidelberg": "08221", "SK Mannheim": "08222", "Neckar-Odenwald-Kreis": "08225",
    "Rhein-Neckar-Kreis": "08226", "SK Pforzheim": "08231", "Calw": "08235", "Enzkreis": "08236", "LK Freudenstadt": "08237",
    "SK Freiburg im Breisgau": "08311", "LK Breisgau-Hochschwarzwald": "08315", "LK Emmendingen": "08316", "Ortenaukreis": "08317",
    "LK Rottweil": "08325", "Schwarzwald-Baar-Kreis": "08326", "LK Tuttlingen": "08327", "LK Konstanz": "08335", "LK Lörrach": "08336",
    "LK Waldshut": "08337", "LK Reutlingen": "08415", "LK Tübingen": "08416", "Zollernalbkreis": "08417", "SK Ulm": "08421",
    "Alb-Donau-Kreis": "08425", "LK Biberach": "08426", "Bodenseekreis": "08435", "LK Ravensburg": "08436", "LK Sigmaringen": "08437",
}
# Landkreise, die die Tabellen nur als "alle" führen (Schlüssel werden unten gegen die Erdbebentabelle geprüft, soweit möglich)
ALLE_KREISE = {
    "BY": {
        "Dachau": "09174", "Eichstätt": "09176", "Erding": "09177", "Freising": "09178", "Fürstenfeldbruck": "09179", "Neuburg-Schrobenhausen": "09185",
        "Pfaffenhofen a.d. Ilm": "09186", "Freyung-Grafenau": "09272", "Kelheim": "09273", "Landshut": "09274", "Straubing-Bogen": "09278",
        "Amberg-Sulzbach": "09371", "Schwandorf": "09376", "Bamberg": "09471", "Coburg": "09473", "Hof": "09475", "Lichtenfels": "09478",
        "Wunsiedel i. Fichtelgebirge": "09479", "Erlangen-Höchstadt": "09572", "Fürth": "09573", "Neustadt a.d. Aisch-Bad Windsheim": "09575",
        "Roth": "09576", "Kitzingen": "09675", "Miltenberg": "09676", "Main-Spessart": "09677", "Schweinfurt": "09678", "Würzburg": "09679",
        "Aichach-Friedberg": "09771", "Augsburg": "09772", "Günzburg": "09774", "Lindau (Bodensee)": "09776",
    },
    "HE": {
        "Groß-Gerau": "06433", "Main-Taunus-Kreis": "06436", "Odenwaldkreis": "06437", "Offenbach": "06438", "Gießen": "06531", "Lahn-Dill-Kreis": "06532",
        "Limburg-Weilburg": "06533", "Marburg-Biedenkopf": "06534", "Vogelsbergkreis": "06535", "Fulda": "06631", "Hersfeld-Rotenburg": "06632",
        "Kassel": "06633", "Schwalm-Eder-Kreis": "06634", "Waldeck-Frankenberg": "06635", "Werra-Meißner-Kreis": "06636",
    },
}
# Bayern, Erdbebentabelle: Kreise als "alle". Gleicher Name bei Stadt und Landkreis: die Zeile gilt für beide.
BY_ERDBEBEN_KREISE = {
    "Altötting": ["09171"], "Amberg": ["09361"], "Amberg-Sulzbach": ["09371"], "Ansbach": ["09561", "09571"], "Bad Kissingen": ["09672"],
    "Bamberg": ["09461", "09471"], "Bayreuth": ["09462", "09472"], "Cham": ["09372"], "Coburg": ["09463", "09473"], "Dachau": ["09174"],
    "Deggendorf": ["09271"], "Dingolfing-Landau": ["09279"], "Ebersberg": ["09175"], "Erding": ["09177"], "Erlangen": ["09562"],
    "Erlangen-Höchstadt": ["09572"], "Forchheim": ["09474"], "Freising": ["09178"], "Freyung-Grafenau": ["09272"], "Fürstenfeldbruck": ["09179"],
    "Fürth": ["09563", "09573"], "Haßberge": ["09674"], "Kitzingen": ["09675"], "Kronach": ["09476"], "Kulmbach": ["09477"],
    "Landsberg am Lech": ["09181"], "Landshut": ["09261", "09274"], "Lichtenfels": ["09478"], "Main-Spessart": ["09677"], "Miltenberg": ["09676"],
    "Mühldorf a. Inn": ["09183"], "München": ["09162", "09184"], "Neustadt a.d. Aisch-Bad Windsheim": ["09575"], "Neustadt a.d. Waldnaab": ["09374"],
    "Nürnberger Land": ["09574"], "Regen": ["09276"], "Regensburg": ["09362", "09375"], "Rhön-Grabfeld": ["09673"], "Rottal-Inn": ["09277"],
    "Schwandorf": ["09376"], "Schweinfurth": ["09678"], "Starnberg": ["09188"], "Straubing-Bogen": ["09278"], "Würzburg": ["09663", "09679"],
}
# Schreibfehler in der Erdbebentabelle, nur für die Gegenprobe der Kreisschlüssel
BY_TIPPFEHLER = {"Kehlheim": "Kelheim"}


def stop(msg):
    sys.exit(f"Abbruch: {msg}")


def zone(v):
    z = str(v).strip()
    if z not in ZONEN:
        stop(f"unbekannte Schneelastzone {v!r}")
    return z


def namen(text):
    """Gemeindeliste einer Zelle: Namen, Teilgebiete werden als solche markiert."""
    text = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    # Kommas in Klammern gehören zum Namen
    # Trenner (Komma, "und") in Klammern gehören zum Namen
    teile, tiefe, cur = [], 0, ""
    i = 0
    while i < len(text):
        c = text[i]
        tiefe += c == "("
        tiefe -= c == ")"
        und = not tiefe and text.startswith(" und ", i)
        if (c == "," and not tiefe) or und:
            teile.append(cur)
            cur = ""
            i += 5 if und else 1
            continue
        cur += c
        i += 1
    teile.append(cur)
    out = []
    for n in (t.strip() for t in teile):
        if not n or n.startswith("gemeindefreier"):
            continue
        teilweise = re.search(r"\((nur|ohne) Gemeindeteile?", n) is not None
        out.append({"name": re.sub(r"\s*\((nur|ohne) Gemeindeteile?.*\)$", "", n), **({"teilweise": True} if teilweise else {})})
    return out


def schnee_bw(ws):
    kreise, aktuell = {}, None
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if r[0] != "BW":
            continue
        kreis, gem, z = r[1], r[2], r[3]
        if kreis and str(kreis).startswith("Regierungsbezirk"):
            continue
        if kreis and str(kreis).strip() == "Bodensee":
            continue
        if kreis:
            aktuell = str(kreis).strip()
            if aktuell not in BW_KREISE:
                stop(f"BW: unbekannter Kreis {aktuell!r}")
            kreise.setdefault(BW_KREISE[aktuell], {"name": aktuell, "ausnahmen": []})
        e = kreise[BW_KREISE[aktuell]]
        z = zone(z)
        if not gem or str(gem).lower().startswith("alle"):
            if "zone" in e:
                stop(f"BW: {aktuell} hat zwei Regelzonen")
            e["zone"] = z
        else:
            e["ausnahmen"] += [{**n, "zone": z} for n in namen(str(gem))]
    for k, e in kreise.items():
        if "zone" not in e:
            stop(f"BW: {e['name']} hat keine Regelzone")
    return {"gemeinden": {}, "kreise": kreise}


def schnee_ags(ws, land):
    gemeinden, kreise = {}, {}
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if r[0] != land:
            continue
        schluessel, gem = str(r[2]).strip(), str(r[3] or "").strip()
        if re.fullmatch(r"\d{8}", schluessel):
            gemeinden[schluessel] = zone(r[4])
            continue
        if schluessel.lower() != "alle":
            stop(f"{land}: unbekannte Zeile {r[:5]}")
        name = str(r[1]).strip()
        if name not in ALLE_KREISE[land]:
            stop(f"{land}: Kreis ohne Schlüssel {name!r}")
        e = {"name": name, "zone": zone(r[4]), "ausnahmen": []}
        m = re.search(r"außer:?\s*(.+?)\s*(?:=\s*SLZ\s*(\S+?)|SLZ\s*=\s*(\S+?));?\s*$", gem, re.S)
        if gem.lower() != "alle":
            if not m:
                stop(f"{land}: Ausnahme nicht lesbar: {gem!r}")
            e["ausnahmen"] = [{**n, "zone": zone(m.group(2) or m.group(3))} for n in namen(m.group(1))]
        kreise[ALLE_KREISE[land][name]] = e
    return {"gemeinden": gemeinden, "kreise": kreise}


def erdbeben_by(ws):
    """Bayern: Zeilen je Gemarkung. Zeilen ohne Gemeinde setzen die vorige Gemeinde desselben Kreises fort; "alle"-Zeilen gelten für den Kreis."""
    out, kreise, letzte = {}, {}, None
    for r in ws.iter_rows(values_only=True):
        if not isinstance(r[0], int):
            continue
        if r[6] not in (0, 1, 2, 3, 99):
            stop(f"BY Erdbeben: unbekannte Zone {r[6]!r}")
        z = "keine" if r[6] == 99 else str(r[6])
        if isinstance(r[2], int):
            letzte = (f"{r[2]:08d}", r[1])
            out.setdefault(letzte[0], []).append({"g": re.sub(r"\s+", " ", str(r[5])).strip(), "z": z})
        elif r[2] is None:
            if letzte and letzte[1] == r[1]:
                out[letzte[0]].append({"g": re.sub(r"\s+", " ", str(r[5])).strip(), "z": z})
        elif str(r[2]).strip() == "alle":
            name = str(r[1]).strip()
            if name not in BY_ERDBEBEN_KREISE:
                stop(f"BY Erdbeben: Kreis ohne Schlüssel {name!r}")
            # "alle außer N": die Ausnahme ist nur intern nummeriert, deshalb nicht eindeutig
            eindeutig = str(r[5]).strip() == "alle"
            for code in BY_ERDBEBEN_KREISE[name]:
                kreise[code] = z if eindeutig else None
        else:
            stop(f"BY Erdbeben: unbekannte Zeile {r[:8]}")
    return out, kreise


def erdbeben_he(ws):
    out = {}
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if not r[4] or not r[1]:
            continue
        roh = str(r[2]).strip()
        m = re.fullmatch(r"Zone (\d)", roh)
        if not m and not re.fullmatch(r"k\. ?A\.", roh):
            stop(f"HE Erdbeben: unbekannte Zone {roh!r}")
        # k. A. = die Karte macht für diese Gemarkung keine Angabe: nicht als "keine Zone" deuten
        z = m.group(1) if m else None
        out.setdefault(f"06{int(r[4]):06d}", []).append({"g": str(r[1]).strip(), "z": z})
    return out


def verdichten(erd):
    """Gemeinde mit durchgehend gleicher Zone: nur die Zone; sonst die Gemarkungen."""
    return {a: (rows[0]["z"] if len({x["z"] for x in rows}) == 1 else rows) for a, rows in sorted(erd.items())}


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sn = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    eq = openpyxl.load_workbook(sys.argv[2], read_only=True, data_only=True)
    blatt = lambda wb, code: next(wb[n] for n in wb.sheetnames if n.startswith(code))
    schnee = {"BW": schnee_bw(blatt(sn, "BW")), "BY": schnee_ags(blatt(sn, "BY"), "BY"), "HE": schnee_ags(blatt(sn, "HE"), "HE")}
    (e_by, e_by_kreise), e_he = erdbeben_by(eq["Bayern"]), erdbeben_he(eq["Hessen"])

    # Gegenprobe der von Hand gepflegten Kreisschlüssel: führt ein "alle"-Kreis auch Einzelzeilen, muss der Kreisname gleich sein
    # (die Einzelzeile geht beim Nachschlagen vor)
    for land in ("BY", "HE"):
        zeilen = {str(r[2]).strip(): str(r[1]).strip() for r in blatt(sn, land).iter_rows(values_only=True) if r[0] == land}
        for k, e in schnee[land]["kreise"].items():
            doppelt = [a for a in schnee[land]["gemeinden"] if a.startswith(k)]
            falsch = [a for a in doppelt if zeilen[a] != e["name"]]
            if falsch:
                stop(f"{land}: Kreis {e['name']} ({k}) passt nicht zu den Zeilen {[(a, zeilen[a]) for a in falsch[:3]]}")
            abweichend = [a for a in doppelt if schnee[land]["gemeinden"][a] != e["zone"]]
            if doppelt:
                print(f"{land}: {e['name']} hat {len(doppelt)} Einzelzeilen, davon {len(abweichend)} mit anderer Zone als die Regelzone {e['zone']}")
    # Hessen: Schlüssel und Name stehen in der Erdbebentabelle
    he_namen = {f"06{int(r[6]):03d}": str(r[7]) for r in list(eq["Hessen"].iter_rows(values_only=True))[1:] if r[6] and r[7]}
    for k, e in schnee["HE"]["kreise"].items():
        if e["name"].split("-")[0].split(" ")[0] not in he_namen.get(k, ""):
            stop(f"HE: {e['name']} passt nicht zu {k} ({he_namen.get(k)})")
    by_namen = {}
    for r in eq["Bayern"].iter_rows(values_only=True):
        if isinstance(r[0], int) and isinstance(r[2], int):
            by_namen[f"{r[2]:08d}"[:5]] = BY_TIPPFEHLER.get(str(r[1]), str(r[1]))
    for k, e in schnee["BY"]["kreise"].items():
        if k in by_namen and e["name"].split(" ")[0].split("-")[0] not in by_namen[k]:
            stop(f"BY: {e['name']} passt nicht zu {k} ({by_namen[k]})")

    fehlt = sorted(set(BW_KREISE.values()) - set(schnee["BW"]["kreise"]))
    print("BW-Kreise ohne Zeile in der Tabelle:", [n for n, k in BW_KREISE.items() if k in fehlt])
    print("Schnee:", {l: (len(s["gemeinden"]), len(s["kreise"])) for l, s in schnee.items()})
    print("Erdbeben BY Gemeinden:", len(e_by), "Kreise:", len(e_by_kreise), "HE:", len(e_he))
    for land, e in (("BY", e_by), ("HE", e_he)):
        werte = [x["z"] for rows in e.values() for x in rows]
        print(land, {str(z): werte.count(z) for z in set(werte)}, "gemischt:", sum(1 for rows in e.values() if len({x["z"] for x in rows}) > 1))

    kopf = (
        "// ERZEUGT von scripts/standort/zonen_erzeugen.py aus den Tabellen des DIBt. Nicht von Hand bearbeiten.\n"
        "// Schneelastzonen Stand 07.02.2023, Erdbebenzonen Stand 02.06.2022 (BY, HE; BW steht dort nicht, siehe logic.ts).\n"
        "// Verbindlich sind die amtlichen Bekanntmachungen der Länder.\n\n"
    )
    ts = (
        kopf
        + "export interface SchneeAusnahme { name: string; zone: string; teilweise?: boolean }\n"
        + "export interface SchneeKreis { name: string; zone: string; ausnahmen: SchneeAusnahme[] }\n"
        + "export interface SchneeLand { gemeinden: Record<string, string>; kreise: Record<string, SchneeKreis> }\n"
        + "export type ErdbebenEintrag = string | null | { g: string; z: string | null }[];\n\n"
        + "export const SCHNEELAST: Record<\"BW\" | \"BY\" | \"HE\", SchneeLand> = "
        + json.dumps(schnee, ensure_ascii=False, separators=(",", ":"))
        + ";\n\nexport const ERDBEBEN: Record<\"BY\" | \"HE\", Record<string, ErdbebenEintrag>> = "
        + json.dumps({"BY": verdichten(e_by), "HE": verdichten(e_he)}, ensure_ascii=False, separators=(",", ":"))
        + ";\n\n/** Bayern: Kreise, die die Erdbebentabelle als \"alle\" führt. null: \"alle außer …\", also nicht eindeutig. */\n"
        + "export const ERDBEBEN_BY_KREISE: Record<string, string | null> = "
        + json.dumps(e_by_kreise, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(ts, encoding="utf-8")
    print(f"{ZIEL.name}: {len(ts) // 1024} KB")


if __name__ == "__main__":
    main()
