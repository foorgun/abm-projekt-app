// Bauamt, Wasser, Abwasser und Strom vorschlagen (Planungsprotokoll Seite 1). Prüfen und Lesen der Antwort liegen in
// supabase/functions/versorger-suche/logic.ts (ohne Importe, damit die Edge Function dieselbe Datei nutzt). Hier: Anfrage
// aus den Protokolldaten, Übernahme ins Formular, Links zum Gegenprüfen beim Strom, Demo-Antwort.

import type { Anfrage, Antwort, Vorschlag, VersorgerRolle } from "../../../supabase/functions/versorger-suche/logic";
import type { ProtokollDaten } from "./daten";

export { antwortLesen, cacheSchluessel, frage, kostenEur, parseAnfrage, ROLLE_TEXT, VERSORGER_ROLLEN } from "../../../supabase/functions/versorger-suche/logic";
export type { Anfrage as VersorgerAnfrage, Antwort as VersorgerAntwort, Fehler as VersorgerFehler, Sicherheit, Vorschlag, VersorgerRolle } from "../../../supabase/functions/versorger-suche/logic";

/**
 * Anfrage aus dem Bauort: PLZ und Ort aus „PLZ Ort“ des Protokolls, dazu Ortsteil und Bundesland. Ohne PLZ oder Ort gibt es
 * keine Anfrage, sondern den Hinweis, was fehlt. Die Straße geht bewusst nicht an den KI-Dienst.
 */
export function versorgerAnfrage(bauort: ProtokollDaten["bauort"]): { anfrage: Anfrage | null; fehlt: string | null } {
  const m = bauort.plzOrt?.match(/^(\d{5})\s+(.+)$/);
  if (!m) return { anfrage: null, fehlt: bauort.plzOrt ? "Die PLZ des Bauorts fehlt (fünfstellig vor dem Ort)." : "PLZ und Ort des Bauorts fehlen." };
  // "Ulm-Söflingen" → Ort "Ulm", Ortsteil "Söflingen", wenn kein Ortsteil eingetragen ist
  const [ort, teil] = m[2].split(/\s*-\s*(?=[A-ZÄÖÜ])/);
  return { anfrage: { plz: m[1], ort, ortsteil: bauort.ortsteil ?? teil ?? null, bundesland: bauort.bundesland }, fehlt: null };
}

/** Vorschlag als Formularwerte (Name, Anschrift, Tel., E-Mail; Mobil und Fax bleiben leer). */
export const kontaktAusVorschlag = (v: Vorschlag) => ({ name: v.name, address: v.anschrift ?? "", phone: v.tel ?? "", mobile: "", email: v.email ?? "", fax: "" });

/** Strom zum Gegenprüfen: Abfrage „Bin ich im Netzgebiet?“ von Westnetz und das Portal aller Verteilnetzbetreiber. */
export const STROM_PRUEFEN = [
  { label: "Westnetz prüfen", url: "https://www.westnetz.de/de/einspeisen/netzgebiet-endverbraucher.html#/" },
  { label: "VNBdigital", url: "https://www.vnbdigital.de/" },
] as const;

export const QUELLE_HINWEIS_VERSORGER = "Vorschlag einer KI-Websuche auf offiziellen Seiten. Bitte prüfen, bevor du übernimmst.";

/** Feste Beispielantwort im Demo-Modus (erfundene Daten, keine echte Suche). */
export function demoVersorger(a: Anfrage): Antwort {
  const ort = a.ort;
  const v = (name: string, rest: Partial<Vorschlag> = {}): Vorschlag => ({
    name,
    anschrift: `Rathausplatz 1, ${a.plz} ${ort}`,
    tel: "0731 0000000",
    email: null,
    quelle: "https://example.org/demo",
    sicherheit: "mittel",
    hinweis: "Demo-Antwort, keine echte Suche.",
    ...rest,
  });
  const vorschlaege: Partial<Record<VersorgerRolle, Vorschlag>> = {
    bauamt: v(`Stadt ${ort}, Bauordnungsamt (Demo)`, { sicherheit: "hoch", email: "bauordnung@demo.example" }),
    wasser: v(`Stadtwerke ${ort} (Demo)`),
    abwasser: v(`Stadt ${ort}, Tiefbauamt (Demo)`),
    strom: v("Netzgesellschaft Demo GmbH", { anschrift: "Netzweg 5, 70000 Musterstadt", sicherheit: "niedrig" }),
  };
  return { ok: true, vorschlaege, gespeichert: false, abgerufenAm: new Date().toISOString() };
}
