// Schlüsselwörter je Vorlagenordner. Helfen dem Agenten bei der Ordnerwahl (BUILD.md Abschnitt 7, Schritt 4).
// Kleinbuchstaben; Treffer im Betreff, Dateinamen oder Textauszug. Werden mit der Vorlage in folder_templates gespeichert.

const BG = "09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige";
const HA = "11 Baubegleitung/02 Hausanschlüsse";

export const FOLDER_KEYWORDS: Record<string, string[]> = {
  "01 Projektbeteiligte": ["projektbeteiligte", "beteiligtenliste", "abm-vertrag"],
  "02 Schriftverkehr/03 Schriftverkehr mit Amt/01 Überschrift {datum}": ["landratsamt", "baurechtsamt", "bauamt", "anhörung"],
  "02 Schriftverkehr/04 Schriftverkehr mit Vermesser/02 amtliche Lagepläne bestellt am {datum}": ["bestellung lageplan"],
  "03 Hausbaufirma": ["werkplanung", "hausbeschreibung", "bauleistungsbeschreibung"],
  "04 Vermesser/02 Vermesserunterlagen erhalten am {datum}": ["vermesserunterlagen", "bestandsplan", "höhenaufnahme", "vermessung"],
  "04 Vermesser/03 Geländeprofile/02 Geländeprofile erhalten am {datum}": ["geländeprofil", "geländeschnitt"],
  "05 Entwurf/01 Entwurf 1 Pläne": ["entwurf"],
  "06 Technische Prüfung": ["technische prüfung", "statik", "wärmeschutz"],
  "07 Vorabzug/02 Vorabzugspläne": ["vorabzug"],
  "07 Vorabzug/04 Formular Bodengutachten": ["formular bodengutachten"],
  "08 Bauantrag/01 Digitaler Bauantrag": ["digitaler bauantrag", "bauantragsformular"],
  "08 Bauantrag/02 Bauantragspläne/02 Unterzeichnet": ["bauantragspläne unterschrieben", "unterzeichnete pläne"],
  "08 Bauantrag/03 Wohnflächenberechnung": ["wohnflächenberechnung", "wohnfläche"],
  "08 Bauantrag/04 Amtliche Lagepläne": ["amtlicher lageplan", "lageplan"],
  "08 Bauantrag/05 Eingangsbestätigung/01 Eingangsbestätigung": ["eingangsbestätigung", "eingangsbescheinigung", "eingang ihres bauantrags"],
  "08 Bauantrag/05 Eingangsbestätigung/02 Unvollständigkeitsmitteilung": ["unvollständigkeit", "unvollständig"],
  "08 Bauantrag/06 Nachforderungen": ["nachforderung", "nachreichung", "fehlende unterlagen"],
  "08 Bauantrag/08 Entwässerungsantrag/01 Formular": ["entwässerungsantrag"],
  [`${BG}/01 Baugenehmigung/01 erhalten am {datum}`]: ["baugenehmigung", "genehmigungsbescheid", "baugenehmigungsbescheid"],
  [`${BG}/02 Baugenehmigung Entwässerung`]: ["entwässerungsgenehmigung", "genehmigung entwässerung"],
  [`${BG}/03 Baufreigabe/01 erhalten am {datum}`]: ["baufreigabe", "baufreigabeschein", "roter punkt"],
  [`${BG}/04 Baubeginnsanzeige`]: ["baubeginnsanzeige"],
  "10 Bodengutachten/Bodengutachten erhalten am {datum}": ["bodengutachten", "baugrundgutachten", "baugrund"],
  "11 Baubegleitung/01 Ausschreibung/03 Angebote erhalten": ["angebot erdarbeiten", "angebot tiefbau"],
  "11 Baubegleitung/01 Ausschreibung/04 Preisspiegel/01 Preisspiegel": ["preisspiegel"],
  [`${HA}/02 Strom/02 Angebot erhalten am {datum}`]: ["angebot strom", "netzanschluss", "stromanschluss", "angebot hausanschluss strom"],
  [`${HA}/02 Strom/03 Auftragsbestätigung`]: ["auftragsbestätigung strom"],
  [`${HA}/03 Baustrom/02 Auftragsbestätigung`]: ["baustrom"],
  [`${HA}/04 Wasser/01 Wasser beantragt am {datum}`]: ["wasseranschluss", "hausanschluss wasser"],
  [`${HA}/06 Medien/01 Medien beauftragt am {datum}`]: ["glasfaser", "telekom", "medienanschluss"],
  "11 Baubegleitung/04 Bauanlaufgespräch/02 Bauanlaufgespräch/01 Protokoll": ["bauanlaufgespräch", "protokoll bauanlauf"],
  "11 Baubegleitung/05 Vermesser/01 Grobabsteckung/02 erhalten am {datum}": ["grobabsteckung"],
  "11 Baubegleitung/05 Vermesser/02 Feineinmessung/02 erhalten am {datum}": ["feineinmessung", "schnurgerüst"],
  "11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus/03 Auftragsbestätigung": ["straßensperrung", "verkehrsrechtliche anordnung"],
  "11 Baubegleitung/07 BP-Kellerbaufirma/02 Zeitschiene": ["zeitschiene", "bauzeitenplan"],
};
