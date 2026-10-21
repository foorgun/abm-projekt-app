// Schornsteinfeger vorschlagen (Planungsprotokoll): Hausnummern-Abgleich, Straßen-Normalisierung und Parser liegen in
// supabase/functions/schornsteinfeger-suche/logic.ts (ohne Importe, damit die Edge Function dieselbe Datei nutzt) und
// werden hier für die App bereitgestellt. Dazu: Bauadresse für die Suche, Übernahme ins Formular, Demo-Antwort.

import {
  QUELLE_LABEL,
  strasseNormalisieren,
  strasseUndHausnummer,
  suchAntwort,
  type DetailAntwort,
  type Details,
  type Fehler,
  type SuchAntwort,
  type Treffer,
} from "../../../supabase/functions/schornsteinfeger-suche/logic";
import { splitAnschrift } from "./daten";

export {
  bezirkeAbgleichen,
  detailsLesen,
  hausnummerNormalisieren,
  hausnummernListe,
  hausnummerPasst,
  passendeTreffer,
  strassenAnfang,
  strassenLesen,
  strassenSchluessel,
  strasseNormalisieren,
  strasseUndHausnummer,
  QUELLE_LABEL,
} from "../../../supabase/functions/schornsteinfeger-suche/logic";
export type { DetailAntwort, Details, Fehler, Kandidat, Passt, SuchAntwort, SuchStatus, Treffer } from "../../../supabase/functions/schornsteinfeger-suche/logic";

export const QUELLE_HINWEIS = `Quelle: ${QUELLE_LABEL}, bitte prüfen.`;

export interface SuchAnfrage {
  plz: string;
  strasse: string;
  hausnummer: string | null;
}

/** Wo eine fehlende Angabe einzutragen ist (für den Verweis in der Oberfläche). */
export type FehlendeAngabe = { feld: "bauadresse" | "plz"; text: string };

/** PLZ aus einem Feld der Form "PLZ Ort" ("75173 Pforzheim"), sonst null. */
export function plzAusOrt(ort: string | null | undefined): string | null {
  return ort?.trim().match(/^(\d{5})\s+\S/)?.[1] ?? null;
}

/**
 * Straße und Hausnummer aus der Bauadresse: "Vogelsangstraße 4", "Hauptstr. 12a", "Am Bach 3/1", auch mit angehängtem
 * Ort ("…, 75173 Pforzheim" bzw. "…, Pforzheim"). Ein Flurstück statt einer Straße ergibt keine Straße.
 */
export function strasseAusBauadresse(bauadresse: string | null | undefined): { strasse: string; hausnummer: string | null; plz: string | null } {
  const t = bauadresse?.replace(/\s+/g, " ").trim() ?? "";
  if (!t || /^(flst|flurst|flur\b|gemarkung)/i.test(t)) return { strasse: "", hausnummer: null, plz: null };
  const geteilt = splitAnschrift(t);
  // Ohne PLZ: was vor dem ersten Komma steht ("Vogelsangstraße 4, Pforzheim")
  const teil = (geteilt.plz ? (geteilt.strasse ?? "") : t.split(",")[0]).trim().replace(/\.(?=\d)/, ". ");
  const { strasse, hausnummer } = strasseUndHausnummer(teil);
  return { strasse: strasse ? strasseNormalisieren(strasse) : "", hausnummer, plz: geteilt.plz };
}

/**
 * Suchbegriffe für den Schornsteinfeger-Vorschlag. Straße und Hausnummer: "Bauort Straße" aus dem Planungsprotokoll, sonst
 * die Bauadresse des Projekts. PLZ: "Bauort PLZ" aus dem Planungsprotokoll, sonst aus der Bauadresse, sonst aus dem
 * Feld Bauort ("75173 Pforzheim"). Die Anschrift des Bauherrn wird nie verwendet (die Funktion bekommt sie gar nicht).
 * `fehlt` nennt genau, was fehlt und wo es einzutragen ist; die Hausnummer ist optional.
 */
export function bauadresseFuerSuche(a: { siteStreet?: string | null; sitePostalCode?: string | null; buildingAddress?: string | null; location?: string | null }): {
  anfrage: SuchAnfrage | null;
  fehlt: FehlendeAngabe[];
} {
  const ausBauadresse = strasseAusBauadresse(a.buildingAddress);
  const ausProtokoll = a.siteStreet?.trim() ? strasseAusBauadresse(a.siteStreet) : null;
  const { strasse, hausnummer } = ausProtokoll?.strasse ? ausProtokoll : ausBauadresse;
  const plzRoh = a.sitePostalCode?.replace(/\s+/g, "") || ausBauadresse.plz || plzAusOrt(a.location) || "";
  const fehlt: FehlendeAngabe[] = [];
  if (!strasse) {
    fehlt.push({
      feld: "bauadresse",
      text: a.buildingAddress?.trim()
        ? `In der Bauadresse („${a.buildingAddress.trim()}“) steht keine Straße. Bitte in der Übersicht bei „Projektbeteiligte“ über den Stift Straße und Hausnummer eintragen.`
        : "Bauadresse fehlt, bitte in der Übersicht über den Stift bei „Projektbeteiligte“ eintragen (z. B. „Vogelsangstraße 4“).",
    });
  }
  if (!/^\d{5}$/.test(plzRoh)) {
    fehlt.push({
      feld: "plz",
      text: plzRoh
        ? `Die PLZ des Bauorts („${plzRoh}“) ist nicht fünfstellig. Bitte in der Übersicht bei „Projektdaten“ über den Stift korrigieren.`
        : a.location?.trim()
          ? `Im Bauort („${a.location.trim()}“) steht keine PLZ. Bitte in der Übersicht bei „Projektdaten“ über den Stift als „PLZ Ort“ eintragen (z. B. „75173 Pforzheim“).`
          : "PLZ des Bauorts fehlt, bitte in der Übersicht über den Stift bei „Projektdaten“ als Bauort „PLZ Ort“ eintragen (z. B. „75173 Pforzheim“).",
    });
  }
  return { anfrage: fehlt.length ? null : { plz: plzRoh, strasse, hausnummer }, fehlt };
}

/** Werte für die Beteiligten-Felder (Rolle Schornsteinfeger). Fehlende Angaben bleiben leer. */
export function kontaktAusDetails(d: Details): { name: string; address: string; phone: string; mobile: string; email: string } {
  return {
    name: d.name,
    address: [d.strasse, d.plz_ort].filter(Boolean).join(", "),
    phone: d.tel ?? "",
    mobile: d.mobil ?? "",
    email: d.email ?? "",
  };
}

// ---------------------------------------------------------------------------
// Demo-Modus: feste Beispielantwort, alle Namen und Nummern erfunden
// ---------------------------------------------------------------------------

const DEMO_TREFFER: Treffer[] = [
  {
    strasse: "Musterstraße",
    ortsteil: "Musterhausen",
    plz: "89000",
    ort: "Musterstadt",
    bezirke: [
      { bezirk: "D1", name: "Erika Rußmann", bsmId: "9001", hnr: "1,3,5,7,9,11,13,15,15 A,17,19" },
      { bezirk: "D2", name: "Max Kehrwieder", bsmId: "9002", hnr: "2,4,6,8,10,12a,14,16-30" },
    ],
  },
];

const DEMO_DETAILS: Record<string, Details> = {
  "9001": { name: "Erika Rußmann", plz_ort: "89000 Musterstadt", strasse: "Kaminweg 1", email: "info@example.de", tel: "0000 000001", mobil: "0170 0000001", fax: null, innung: "Innung Musterstadt" },
  "9002": { name: "Max Kehrwieder", plz_ort: "89000 Musterstadt", strasse: "Rauchgasse 2", email: null, tel: "0000 000002", mobil: null, fax: "0000 000003", innung: "Innung Musterstadt" },
};

/** Demo-Suche: immer dieselbe erfundene Straße, die Hausnummer wird wie im Echtbetrieb abgeglichen. */
export function demoSuche(anfrage: SuchAnfrage): SuchAntwort {
  const a = suchAntwort(DEMO_TREFFER, anfrage.hausnummer, anfrage.strasse);
  return { ...a, meldung: ["Demo-Modus: feste Beispielantwort mit erfundenen Daten.", a.meldung].filter(Boolean).join(" ") };
}

export function demoDetails(bsmId: string): DetailAntwort | Fehler {
  const d = DEMO_DETAILS[bsmId];
  return d ? { ok: true, details: d } : { ok: false, code: "error", message: "Unbekannter Schornsteinfeger (Demo)." };
}
