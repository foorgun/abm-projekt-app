// Klassifizierung der Felder des Planungsprotokolls:
//   vorbefuellbar  aus Projekt/Kontakt füllbar; `quelle` nennt das Datenfeld, `im_modell` ob es das schon gibt
//   manuell        Eingabe je Projekt (Planungsangaben, Maße, Freitext)
//   ankreuzen      Ankreuzfeld-Entscheidung (Checkbox, Radio)
// im_modell: "ja" = vorhanden, "teilweise" = vorhanden, aber anders geschnitten (z. B. eine Kontaktzeile statt Tel./Mail),
//            "fehlt" = gibt es im Datenmodell noch nicht.

/** Beteiligte/Rollen und wie das heutige Datenmodell sie abbildet. */
export const ROLLEN = {
  architekt: { label: "Architekt", name: ["team_members.name (über projects.architect_id)", "ja"], kontakt: ["Bürodaten ABM (nicht im Modell)", "fehlt"] },
  vermesser: { label: "Vermessungsbüro", name: ["project_parties[vermesser].name", "ja"], kontakt: ["project_parties[vermesser].contact (eine Zeile)", "teilweise"] },
  bodengutachter: { label: "Baugrundgutachter", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  erdbau: { label: "Erdbau-Unternehmen", name: ["project_parties[erdbauer].name", "ja"], kontakt: ["project_parties[erdbauer].contact (eine Zeile)", "teilweise"] },
  keller: { label: "Kellerbauer/Bodenplatte", name: ["Rolle fehlt (Altspalte bauherren.basement_builder ungenutzt)", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  gemeinde: { label: "Genehmigungsbehörde (Gemeinde)", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  bauamt: { label: "Bauaufsicht/Bauamt", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  schornsteinfeger: { label: "Schornsteinfeger", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  strom: { label: "Versorger Strom", name: ["project_parties[strom].name", "ja"], kontakt: ["project_parties[strom].contact (eine Zeile)", "teilweise"] },
  gas: { label: "Versorger Gas", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  fernwaerme: { label: "Versorger Fernwärme", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  wasser: { label: "Versorger Wasser", name: ["project_parties[wasser].name", "ja"], kontakt: ["project_parties[wasser].contact (eine Zeile)", "teilweise"] },
  abwasser: { label: "Abwasser", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
  sonstige: { label: "Sonstige Beteiligte", name: ["Rolle fehlt", "fehlt"], kontakt: ["Rolle fehlt", "fehlt"] },
};

const KONTAKTART = { tel: "Telefon", mobil: "Mobil", mail: "E-Mail", fax: "Fax", anschrift: "Anschrift" };

/** Feld einer Rolle: Name (aus dem Modell oder fehlend) oder eine Kontaktangabe. Mobil, Fax und Anschrift gibt es nirgends getrennt. */
function rolle(key, art) {
  const r = ROLLEN[key];
  if (art === "name") return { klasse: "vorbefuellbar", quelle: `${r.label}: ${r.name[0]}`, im_modell: r.name[1] };
  const [quelle, stand] = r.kontakt;
  const getrennt = art === "mobil" || art === "fax" || art === "anschrift";
  return { klasse: "vorbefuellbar", quelle: `${r.label} ${KONTAKTART[art]}: ${quelle}`, im_modell: stand === "fehlt" || (getrennt && stand !== "fehlt") ? "fehlt" : stand };
}

const BAUHERR = {
  name: { klasse: "vorbefuellbar", quelle: "Bauherr Name: bauherren.name (+ name2), sonst projects.bauherr_label", im_modell: "ja" },
  strasse: { klasse: "vorbefuellbar", quelle: "Bauherr Straße: Teil von bauherren.address (eine Zeile, wird aufgeteilt)", im_modell: "teilweise" },
  ort: { klasse: "vorbefuellbar", quelle: "Bauherr PLZ/Ort: Teil von bauherren.address", im_modell: "teilweise" },
  mobil: { klasse: "vorbefuellbar", quelle: "Bauherr Mobil: bauherren.phone (Telefon und Mobil nicht getrennt)", im_modell: "teilweise" },
  mail: { klasse: "vorbefuellbar", quelle: "Bauherr E-Mail: bauherren.email", im_modell: "ja" },
};
const BAUORT = {
  strasse: { klasse: "vorbefuellbar", quelle: "Bauort Straße/Baugebiet: Teil von bauherren.building_address", im_modell: "teilweise" },
  ort: { klasse: "vorbefuellbar", quelle: "Bauort PLZ/Ort: PLZ aus bauherren.building_address, Ort aus projects.location", im_modell: "teilweise" },
  plz: { klasse: "vorbefuellbar", quelle: "Bauort PLZ: Teil von bauherren.building_address", im_modell: "teilweise" },
  gemarkung: { klasse: "vorbefuellbar", quelle: "Gemarkung: projects.gemarkung", im_modell: "ja" },
  flurstueck: { klasse: "vorbefuellbar", quelle: "Flur/Flurstück: projects.flurstueck (Flur nicht getrennt)", im_modell: "teilweise" },
  ortsteil: { klasse: "vorbefuellbar", quelle: "Gemeindeteil/Ortsteil: fehlt", im_modell: "fehlt" },
  bundesland: { klasse: "vorbefuellbar", quelle: "Bundesland: fehlt (Annahme Baden-Württemberg, besser aus der PLZ)", im_modell: "fehlt" },
};
const PROJEKTNR = { klasse: "vorbefuellbar", quelle: "Projekt-/BV-Nr. der Hausbaufirma: projects.hausbau_nr (offene Frage: dieselbe Nummer?)", im_modell: "ja" };

/** Living Haus und Bien-Zenker: identische Feldnamen. Seite 1 (Kopfdaten und Beteiligte). */
const FB22 = {
  "Textfeld 1.01": PROJEKTNR,
  "Textfeld 1.02": BAUHERR.name,
  "Textfeld 1.03": BAUHERR.strasse,
  "Textfeld 1.05": BAUHERR.ort,
  "Textfeld 1.04": BAUHERR.mobil,
  "Textfeld 1.06": BAUHERR.mail,
  "Textfeld 1.07": BAUORT.strasse,
  "Textfeld 1.10": BAUORT.ort,
  "Textfeld 1.08": BAUORT.gemarkung,
  "Textfeld 1.11": BAUORT.ortsteil,
  "Textfeld 1.09": BAUORT.flurstueck,
  "Textfeld 1.12": BAUORT.bundesland,
};
const FB22_ROLLEN = [
  ["architekt", "1.13", "1.14", "1.15", "1.16"],
  ["vermesser", "1.17", "1.29", "1.28", "1.27"],
  ["keller", "1.18", "1.32", "1.31", "1.30"],
  ["erdbau", "1.19", "1.35", "1.34", "1.33"],
  ["bauamt", "1.20", "1.38", "1.37", "1.36"],
  ["schornsteinfeger", "1.21", "1.41", "1.40", "1.39"],
  ["strom", "1.22", "1.44", null, "1.43"],
  ["gas", "1.23", "1.42", null, "1.47"],
  ["fernwaerme", "1.24", "1.46", null, "1.45"],
  ["wasser", "1.25", "1.50", null, "1.49"],
  ["abwasser", "1.26", "1.48", null, "1.51"],
];
for (const [key, name, tel, mobil, mail] of FB22_ROLLEN) {
  FB22[`Textfeld ${name}`] = rolle(key, "name");
  FB22[`Textfeld ${tel}`] = rolle(key, "tel");
  if (mobil) FB22[`Textfeld ${mobil}`] = rolle(key, "mobil");
  FB22[`Textfeld ${mail}`] = rolle(key, "mail");
}

/** Schwabenhaus: sprechende Namen. Seiten 1 und 2 (Beteiligte) und dieselben Kopffelder auf späteren Seiten. */
const SH = {
  "BV-Nr": PROJEKTNR,
  BauherrName: BAUHERR.name,
  BauherrStraße: BAUHERR.strasse,
  BauherrOrt: BAUHERR.ort,
  BauherrMobil: BAUHERR.mobil,
  BauherrMail: BAUHERR.mail,
  BauortPLZ: BAUORT.ort,
  BauortStr: BAUORT.strasse,
  BauortGemarkung: BAUORT.gemarkung,
  BauortFlurstück: BAUORT.flurstueck,
  BauortOrtsteil: BAUORT.ortsteil,
  BauortBundesland: BAUORT.bundesland,
};
const SH_PREFIX = { Architekt: "architekt", Vermesser: "vermesser", BGGutachter: "bodengutachter", Erdbau: "erdbau", Keller: "keller", Gemeinde: "gemeinde", Bauamt: "bauamt", Strom: "strom", Wasser: "wasser", Abwasser: "abwasser", Schornstein: "schornsteinfeger", Gas: "gas", Fernwärme: "fernwaerme", Sonstige: "sonstige" };
const SH_SUFFIX = { "": "name", Name: "name", Tel: "tel", Mobil: "mobil", Mail: "mail", Fax: "fax", Anschrift: "anschrift" };
// Abwasser vor Wasser prüfen (gleiches Ende)
const SH_ORDER = Object.keys(SH_PREFIX).sort((a, b) => b.length - a.length);

export function klassifiziere(vorlage, f) {
  if (f.typ === "Checkbox" || f.typ === "Radio") return { klasse: "ankreuzen", quelle: null, im_modell: null };
  // FB-22 Flächenberechnung: Summenfelder, die Acrobat per Formular-JavaScript berechnet
  if (vorlage !== "schwabenhaus" && ["Textfeld 4.09", "Textfeld 4.14", "Textfeld 4.19", "Textfeld 4.24"].includes(f.name))
    return { klasse: "manuell", quelle: "berechnet: Summe der vier Felder darüber (Formular-JavaScript)", im_modell: null };
  if (f.typ === "Button") return { klasse: "manuell", quelle: "Bildfeld (Foto/Plan einfügen)", im_modell: null };
  if (vorlage === "schwabenhaus") {
    if (SH[f.name]) return { ...SH[f.name] };
    const p = SH_ORDER.find((x) => f.name.startsWith(x));
    if (p) {
      const art = SH_SUFFIX[f.name.slice(p.length)];
      if (art) return rolle(SH_PREFIX[p], art);
    }
  } else if (FB22[f.name]) return { ...FB22[f.name] };
  return { klasse: "manuell", quelle: null, im_modell: null };
}
