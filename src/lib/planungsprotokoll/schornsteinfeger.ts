// Schornsteinfeger vorschlagen (Planungsprotokoll): Hausnummern-Abgleich, Straßen-Normalisierung und Parser liegen in
// supabase/functions/schornsteinfeger-suche/logic.ts (ohne Importe, damit die Edge Function dieselbe Datei nutzt) und
// werden hier für die App bereitgestellt. Dazu: Bauadresse für die Suche, Übernahme ins Formular, Demo-Antwort.

import {
  QUELLE_LABEL,
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

/**
 * Suchbegriffe aus der Bauadresse: getrennte Felder (Bauort Straße, Bauort PLZ) gehen vor, sonst die einzeilige Bauadresse.
 * `fehlt` nennt, was für die Suche fehlt (die Hausnummer ist optional).
 */
export function bauadresseFuerSuche(a: { siteStreet?: string | null; sitePostalCode?: string | null; buildingAddress?: string | null }): { anfrage: SuchAnfrage | null; fehlt: string[] } {
  const alt = splitAnschrift(a.buildingAddress);
  const strasseRoh = a.siteStreet?.trim() || alt.strasse || "";
  const plz = (a.sitePostalCode?.trim() || alt.plz || "").replace(/\s+/g, "");
  const { strasse, hausnummer } = strasseUndHausnummer(strasseRoh);
  const fehlt: string[] = [];
  if (!/^\d{5}$/.test(plz)) fehlt.push(plz ? "fünfstellige PLZ des Bauorts" : "PLZ des Bauorts");
  if (!strasse) fehlt.push("Straße des Bauorts");
  return { anfrage: fehlt.length ? null : { plz, strasse, hausnummer }, fehlt };
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
