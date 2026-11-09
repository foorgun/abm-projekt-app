// Einverständniserklärung / Vollmacht: aus Projekt, Bauherr, Architekt und Bürodaten die Werte bilden. Reine Funktionen.
// Fehlt etwas, bleibt der Wert null (im PDF steht dann eine leere Linie zum Ausfüllen von Hand); es gibt keinen Fehler.

import { bundeslandFromText } from "../bundesland";
import { formatDate } from "../format";
import type { BauherrContact, BueroDaten, Dataset, Project, TeamMember } from "../types";

/** Ordner im Projekt, in dem die Erklärung abgelegt wird (wie das Planungsprotokoll: gehört zum Bauantrag). */
export const EINVERSTAENDNIS_ORDNER = "08 Bauantrag";

/** Vorschläge für das Feld "Bauvorhaben" (frei änderbar). */
export const BAUVORHABEN_VORSCHLAEGE = [
  "Neubau Einfamilienhaus",
  "Neubau Einfamilienhaus mit Garage",
  "Neubau Einfamilienhaus mit Doppelgarage",
  "Neubau Einfamilienhaus mit Carport",
  "Neubau Doppelhaushälfte",
  "Neubau Zweifamilienhaus",
  "Neubau Mehrfamilienhaus",
] as const;

/** Die drei Punkte der Vollmacht (laut ABM immer gleich). */
export const VOLLMACHT_PUNKTE = [
  "Einreichung des Bauantrags",
  "Führung des Schriftverkehrs sowie mündliche Verhandlungen mit der zuständigen Baurechtsbehörde im Rahmen des Genehmigungsverfahrens",
  "Entgegennahme der Baugenehmigung",
] as const;

/**
 * Wer als Entwurfsverfasser und Vertreter in der Erklärung steht (Vorgabe von ABM, über die Kürzel der Architekten):
 * Mehmet (MC) nur, wenn er der Architekt des Projekts ist und der Bauort in Baden-Württemberg liegt. In allen anderen
 * Fällen Willi (BE), auch ohne eingetragenen Architekten.
 */
export const ENTWURFSVERFASSER_REGEL = { standard: "BE", nurInBW: "MC", bundesland: "BW" } as const;

export interface EntwurfsverfasserWahl {
  /** Gewähltes Teammitglied; undefined, wenn es das Kürzel im Team nicht gibt */
  mitglied: TeamMember | undefined;
  /** Kurze Begründung für die Anzeige */
  grund: string;
  /** Mehmet ist eingetragen, das Bundesland des Bauorts aber unbekannt: dann Willi, mit Hinweis */
  bundeslandFehlt: boolean;
}

/** Bundesland des Bauorts: Feld am Projekt, sonst der ausgeschriebene Name beim Bauort. Keine Vermutung aus der PLZ. */
export function bundeslandDesBauorts(project: Pick<Project, "bundesland">, contact: BauherrContact | null): string | null {
  return bundeslandFromText(project.bundesland) ?? bundeslandFromText(contact?.siteState);
}

export function entwurfsverfasserWaehlen(project: Pick<Project, "architectId" | "bundesland">, team: TeamMember[], contact: BauherrContact | null): EntwurfsverfasserWahl {
  const R = ENTWURFSVERFASSER_REGEL;
  const nachKuerzel = (code: string) => team.find((t) => t.code?.trim().toUpperCase() === code);
  const eingetragen = team.find((t) => t.id === project.architectId);
  const istAusnahme = eingetragen?.code?.trim().toUpperCase() === R.nurInBW;
  const land = bundeslandDesBauorts(project, contact);
  if (istAusnahme && land === R.bundesland) return { mitglied: eingetragen, grund: `Architekt ${R.nurInBW}, Bauort in Baden-Württemberg`, bundeslandFehlt: false };
  const grund = istAusnahme
    ? land
      ? `Architekt ${R.nurInBW}, aber Bauort nicht in Baden-Württemberg: immer ${R.standard}`
      : `Architekt ${R.nurInBW}, Bundesland des Bauorts fehlt: vorerst ${R.standard}`
    : `außer bei ${R.nurInBW} in Baden-Württemberg immer ${R.standard}`;
  return { mitglied: nachKuerzel(R.standard), grund, bundeslandFehlt: istAusnahme && !land };
}

export const BETREFF = "Einreichung Bauantrag, Führung Schriftverkehr und Entgegennahme der Baugenehmigung";

export interface EinverstaendnisDaten {
  bauherrschaft: { namen: string | null; strasse: string | null; plzOrt: string | null };
  bauvorhaben: string | null;
  grundstueck: { plzOrt: string | null; strasse: string | null; flurstueck: string | null };
  entwurfsverfasser: { name: string | null; anrede: "Herr" | "Frau" | null; titel: string | null; anschrift: string | null; tel: string | null; email: string | null };
  /** Einzelne Bauherren mit vollem Namen (Vertreter-Satz und Unterschriftszeilen). Leer, wenn keiner eingetragen ist. */
  personen: string[];
  /** Datum "Aufgestellt", TT.MM.JJJJ */
  datum: string;
  /** Wer Entwurfsverfasser ist und warum (siehe ENTWURFSVERFASSER_REGEL) */
  wahl: { teamMemberId: string | null; grund: string; bundeslandFehlt: boolean };
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};
const join = (parts: (string | null | undefined)[], sep: string): string | null => clean(parts.map(clean).filter(Boolean).join(sep));

/** "A", "A und B", "A, B und C" */
export function aufzaehlen(teile: string[]): string {
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

interface Person {
  vorname: string | null;
  nachname: string | null;
  voll: string;
}

/** Bauherren 1 bis 4 mit Vor- und Nachname; ältere Einträge haben nur den ganzen Namen. */
export function bauherrPersonen(contact: BauherrContact | null): Person[] {
  if (!contact) return [];
  const roh: [string | null | undefined, string | null | undefined, string | null | undefined][] = [
    [contact.vorname, contact.nachname, contact.name],
    [contact.vorname2, contact.nachname2, contact.name2],
    [contact.vorname3, contact.nachname3, contact.name3],
    [contact.vorname4, contact.nachname4, contact.name4],
  ];
  const out: Person[] = [];
  for (const [v, n, name] of roh) {
    const vorname = clean(v);
    const nachname = clean(n);
    const voll = join([vorname, nachname], " ") ?? clean(name);
    if (voll) out.push({ vorname, nachname, voll });
  }
  return out;
}

/**
 * Kopfzeile "Bauherrschaft": bei gleichem Nachnamen zusammengefasst ("Andre und Eva-Maria Jerke"), sonst alle Namen
 * ausgeschrieben ("Anna Huber und Ben Maier").
 */
export function bauherrschaftZeile(personen: Person[]): string | null {
  if (!personen.length) return null;
  const nachname = personen[0].nachname;
  const gemeinsam = personen.length > 1 && nachname && personen.every((p) => p.vorname && p.nachname === nachname);
  return gemeinsam ? `${aufzaehlen(personen.map((p) => p.vorname!))} ${nachname}` : aufzaehlen(personen.map((p) => p.voll));
}

/** "72401 Haigerloch-Owingen": Ortsteil mit Bindestrich an den Ort, wenn nicht einer schon im anderen steht. */
export function plzOrtMitOrtsteil(plz: string | null | undefined, ort: string | null | undefined, ortsteil: string | null | undefined): string | null {
  const o = clean(ort);
  const t = clean(ortsteil);
  const klein = (x: string) => x.toLocaleLowerCase("de");
  // Steht der Ort schon im Ortsteil ("Ehingen-Süd") oder der Ortsteil im Ort, nicht doppelt anhängen
  const ortVoll = o && t ? (klein(o).includes(klein(t)) ? o : klein(t).includes(klein(o)) ? t : `${o}-${t}`) : (o ?? t);
  return join([plz, ortVoll], " ");
}

/** Wohnanschrift: getrennte Felder vor der alten Zeile ("Straße 1, 12345 Ort"). */
function wohnanschrift(contact: BauherrContact | null): { strasse: string | null; plzOrt: string | null } {
  if (!contact) return { strasse: null, plzOrt: null };
  if (clean(contact.street) || clean(contact.postalCode) || clean(contact.city)) {
    return { strasse: clean(contact.street), plzOrt: join([contact.postalCode, contact.city], " ") };
  }
  const m = clean(contact.address)?.match(/^(?:(.*?)[,\s]+)?(\d{5})\s+(.+)$/);
  if (m) return { strasse: clean(m[1]?.replace(/,\s*$/, "")), plzOrt: `${m[2]} ${clean(m[3])}` };
  return { strasse: clean(contact.address), plzOrt: null };
}

function grundstueck(contact: BauherrContact | null, project: Project) {
  const getrennt = clean(contact?.siteStreet) || clean(contact?.sitePostalCode) || clean(contact?.siteCity);
  const m = getrennt ? null : clean(contact?.buildingAddress)?.match(/^(?:(.*?)[,\s]+)?(\d{5})\s+(.+)$/);
  const strasse = getrennt ? clean(contact?.siteStreet) : m ? clean(m[1]?.replace(/,\s*$/, "")) : clean(contact?.buildingAddress);
  const plz = getrennt ? clean(contact?.sitePostalCode) : (m?.[2] ?? null);
  const ort = (getrennt ? clean(contact?.siteCity) : clean(m?.[3])) ?? clean(project.location);
  const flst = clean(project.flurstueck)?.replace(/^(flst\.?(-nr\.?)?:?|flurstück(-nr\.?)?:?)\s*/i, "") ?? null;
  return { plzOrt: plzOrtMitOrtsteil(plz, ort, contact?.siteDistrict), strasse, flurstueck: clean(flst) };
}

/** Entwurfsverfasser: der Architekt des Projekts; Anschrift, Tel. und E-Mail ohne eigene Angabe aus den Bürodaten. */
export function entwurfsverfasser(architekt: TeamMember | undefined, buero: BueroDaten | null): EinverstaendnisDaten["entwurfsverfasser"] {
  return {
    name: clean(architekt?.name),
    anrede: architekt?.anrede ?? null,
    titel: clean(architekt?.titel),
    anschrift: clean(architekt?.anschrift) ?? clean(buero?.anschrift),
    tel: clean(architekt?.tel) ?? clean(buero?.tel),
    email: clean(architekt?.email) ?? clean(buero?.email),
  };
}

/** Alle Werte der Erklärung eines Projekts. `heute` als ISO-Datum (JJJJ-MM-TT). */
export function einverstaendnisDaten(data: Pick<Dataset, "projects" | "bauherren" | "team" | "buero">, projectId: string, heute: string): EinverstaendnisDaten {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Projekt nicht gefunden");
  const contact = data.bauherren.find((b) => b.projectId === projectId) ?? null;
  const personen = bauherrPersonen(contact);
  const wahl = entwurfsverfasserWaehlen(project, data.team, contact);
  return {
    bauherrschaft: { namen: bauherrschaftZeile(personen), ...wohnanschrift(contact) },
    bauvorhaben: clean(project.bauvorhaben),
    grundstueck: grundstueck(contact, project),
    entwurfsverfasser: entwurfsverfasser(wahl.mitglied, data.buero),
    personen: personen.map((p) => p.voll),
    datum: formatDate(heute),
    wahl: { teamMemberId: wahl.mitglied?.id ?? null, grund: wahl.grund, bundeslandFehlt: wahl.bundeslandFehlt },
  };
}

/** Bezeichnung jedes Werts, der noch fehlt (für den Hinweis vor dem Erzeugen). */
export function fehlendeAngaben(d: EinverstaendnisDaten): string[] {
  const out: string[] = [];
  const pruefe = (wert: string | null, label: string) => {
    if (!wert) out.push(label);
  };
  pruefe(d.bauherrschaft.namen, "Name der Bauherrschaft");
  pruefe(d.bauherrschaft.strasse, "Straße der Bauherrschaft");
  pruefe(d.bauherrschaft.plzOrt, "PLZ und Ort der Bauherrschaft");
  pruefe(d.bauvorhaben, "Bauvorhaben");
  pruefe(d.grundstueck.plzOrt, "PLZ und Ort des Baugrundstücks");
  pruefe(d.grundstueck.strasse, "Straße des Baugrundstücks");
  pruefe(d.grundstueck.flurstueck, "Flurstück");
  if (d.wahl.bundeslandFehlt) out.push("Bundesland des Bauorts (entscheidet über den Entwurfsverfasser)");
  pruefe(d.entwurfsverfasser.name, `Architekt ${ENTWURFSVERFASSER_REGEL.standard} im Team (Entwurfsverfasser)`);
  if (d.entwurfsverfasser.name) {
    pruefe(d.entwurfsverfasser.anrede, "Anrede des Architekten");
    pruefe(d.entwurfsverfasser.titel, "Berufsbezeichnung des Architekten");
  }
  pruefe(d.entwurfsverfasser.anschrift, "Anschrift des Architekten");
  pruefe(d.entwurfsverfasser.tel, "Tel. des Architekten");
  pruefe(d.entwurfsverfasser.email, "E-Mail des Architekten");
  return out;
}

/** "Herrn Willi Becker" / "Frau …" / ohne Anrede nur der Name. */
export function vertreterMitAnrede(e: EinverstaendnisDaten["entwurfsverfasser"]): string | null {
  if (!e.name) return null;
  return e.anrede === "Herr" ? `Herrn ${e.name}` : e.anrede === "Frau" ? `Frau ${e.name}` : e.name;
}

/** Fließtext der Vollmacht. Eine Person: "bevollmächtige ich", mehrere: "bevollmächtigen wir". Lücken als Linie. */
export function vollmachtText(d: EinverstaendnisDaten, luecke = "____________________"): string {
  const mehrere = d.personen.length !== 1;
  const vertreter = vertreterMitAnrede(d.entwurfsverfasser) ?? luecke;
  const bauherren = d.personen.length ? aufzaehlen(d.personen) : luecke;
  return `Hiermit ${mehrere ? "bevollmächtigen wir" : "bevollmächtige ich"} – als Bauherrschaft – ${vertreter} als Vertreter der Bauherrschaft ${bauherren}, folgende Handlungen in Bezug auf oben genanntes Bauvorhaben vorzunehmen:`;
}

/** Dateiname: "Einverstaendniserklaerung_<Bauherr>_<JJJJ-MM-TT_HHMM>.pdf" */
export function einverstaendnisDateiname(bauherr: string, stamp: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const datum = `${stamp.getFullYear()}-${p(stamp.getMonth() + 1)}-${p(stamp.getDate())}_${p(stamp.getHours())}${p(stamp.getMinutes())}`;
  const name = bauherr.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-") || "Projekt";
  return `Einverstaendniserklaerung_${name}_${datum}.pdf`;
}

/** Projekte ohne Erklärung, gefiltert für die Warnung (siehe alerts.ts). */
export function hatEinverstaendnis(projectId: string, liste: { projectId: string }[] | undefined): boolean {
  return !!liste?.some((e) => e.projectId === projectId);
}
