// Vertrag nachträglich auslesen: ausgelesene Werte mit dem bestehenden Projekt vergleichen und daraus eine Änderung bilden.
// Reine Funktionen. Regeln: leere Projektfelder sind vorgewählt, abweichende vorhandene Werte nicht (Konflikt),
// gleiche Werte werden nur als "gleich" gezeigt und nie geschrieben.

import { splitAnschrift } from "../planungsprotokoll/daten";
import { compactText } from "../projectFilters";
import type { BauherrInput, PartyInput, ProjectPatch } from "../repo";
import type { BauherrContact, PartyRole, Project, ProjectParty } from "../types";
import { teileName } from "../weitereBauherren";
import { formPatchFor } from "./applyDraft";
import type { DraftField, DraftFieldKey, ProjectDraft } from "./types";

/**
 * Name des Kellerbauers, wenn der Bauherr ohne Keller/Bodenplatte gekauft hat. Gleicher Text wie BAUSEITS in
 * src/lib/planungsprotokoll/daten.ts (kommt dort mit den festen Feldregeln für Seite 1); beim Zusammenführen dorthin verweisen.
 */
export const KELLER_BAUSEITS = "Bauseits";

/** Felder, die der Vergleich zeigt, in dieser Reihenfolge. Wichtig fürs Planungsprotokoll: Bauadresse, Flur, Flurstück, Gemarkung. */
export const VERGLEICH_FELDER = [
  "buildingAddress",
  "location",
  "flur",
  "flurstueck",
  "gemarkung",
  "vermesser",
  "kellerBauseits",
  "bauherrName",
  "phone",
  "email",
  "address",
  "bauherr2Name",
  "bauherr2Phone",
  "bauherr2Email",
] as const satisfies readonly DraftFieldKey[];

export type VergleichKey = (typeof VERGLEICH_FELDER)[number];

export const VERGLEICH_LABEL: Record<VergleichKey, string> = {
  buildingAddress: "Bauadresse",
  location: "Bauort",
  flur: "Flur",
  flurstueck: "Flurstück",
  gemarkung: "Gemarkung",
  vermesser: "Vermesser",
  kellerBauseits: "Kellerbauer/Bodenplatte",
  bauherrName: "Bauherr 1",
  phone: "Telefon",
  email: "E-Mail",
  address: "Anschrift",
  bauherr2Name: "Bauherr 2",
  bauherr2Phone: "Telefon (Bauherr 2)",
  bauherr2Email: "E-Mail (Bauherr 2)",
};

/** neu: im Projekt leer (bzw. nur ergänzt); gleich: steht schon so da; abweichend: anderer Wert im Projekt. */
export type VergleichStatus = "neu" | "gleich" | "abweichend";

export interface VergleichZeile {
  key: VergleichKey;
  label: string;
  /** Wert im Projekt, wie er angezeigt wird (null = leer) */
  aktuell: string | null;
  /** Ausgelesener Wert, wie er gespeichert würde */
  neu: string;
  /** Zusatz zum ausgelesenen Wert (Kontakt des Vermessers) */
  zusatz: string | null;
  status: VergleichStatus;
  /** Leere Felder ja, abweichende nein, gleiche nie (werden nicht geschrieben). */
  vorgewaehlt: boolean;
  feld: DraftField;
}

export interface VergleichKontext {
  project: Project;
  contact: BauherrContact | null;
  parties: ProjectParty[];
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};
const joinNonEmpty = (parts: (string | null | undefined)[], sep: string) => clean(parts.map(clean).filter(Boolean).join(sep));

/** Adresse vergleichbar: ohne Klammerzusätze, "Straße" = "Str.", ohne Satzzeichen. */
const adressKey = (s: string | null | undefined) => compactText((s ?? "").replace(/\(.*?\)/g, "").replace(/stra(ß|ss)e/gi, "str"));
/** Flur und Flurstück vergleichbar: ohne Vorsatz ("Flur 3" = "3", "Flst. 412/3" = "412/3"). */
const nummerKey = (s: string | null | undefined) => compactText((s ?? "").replace(/^\s*(flur(st(ü|ue)ck)?|flst)\.?\s*(nr\.?)?/i, ""));

/** Bauadresse im Projekt: die getrennten Felder, wenn gesetzt, sonst die eine Zeile. */
export function bauadresseImProjekt(c: BauherrContact | null): string | null {
  const getrennt = joinNonEmpty([c?.siteStreet, joinNonEmpty([c?.sitePostalCode, c?.siteCity], " ")], ", ");
  return getrennt ?? clean(c?.buildingAddress);
}

function wohnanschriftImProjekt(c: BauherrContact | null): string | null {
  return clean(c?.address) ?? joinNonEmpty([c?.street, joinNonEmpty([c?.postalCode, c?.city], " ")], ", ");
}

function istGleich(key: VergleichKey, aktuell: string, neu: string, ctx: VergleichKontext): boolean {
  switch (key) {
    case "buildingAddress":
      return [ctx.contact?.buildingAddress, bauadresseImProjekt(ctx.contact)].some((a) => a && adressKey(a) === adressKey(neu));
    case "address":
      return [ctx.contact?.address, wohnanschriftImProjekt(ctx.contact)].some((a) => a && adressKey(a) === adressKey(neu));
    case "location":
      // "89134 Blaustein" im Projekt, "Blaustein" im Vertrag: gleich
      return compactText(aktuell) === compactText(neu) || compactText(aktuell).endsWith(compactText(neu)) || compactText(neu).endsWith(compactText(aktuell));
    case "flur":
    case "flurstueck":
      return nummerKey(aktuell) === nummerKey(neu);
    case "phone":
    case "bauherr2Phone":
      return aktuell.replace(/\D/g, "") === neu.replace(/\D/g, "");
    default:
      return compactText(aktuell) === compactText(neu);
  }
}

const party = (ctx: VergleichKontext, role: PartyRole) => ctx.parties.find((p) => p.projectId === ctx.project.id && p.role === role);

/** Kontakt des Vermessers aus dem Entwurf (nur was ausgelesen ist). */
function vermesserKontakt(draft: ProjectDraft): { address: string | null; phone: string | null; email: string | null } {
  const f = draft.felder;
  return { address: clean(f.vermesserAnschrift?.wert), phone: clean(f.vermesserTelefon?.wert), email: clean(f.vermesserEmail?.wert) };
}

/** Aktueller Wert im Projekt je Feld (zur Anzeige). */
function aktuellerWert(key: VergleichKey, ctx: VergleichKontext): string | null {
  const c = ctx.contact;
  switch (key) {
    case "buildingAddress":
      return bauadresseImProjekt(c);
    case "location":
      return clean(ctx.project.location);
    case "flur":
      return clean(ctx.project.flur);
    case "flurstueck":
      return clean(ctx.project.flurstueck);
    case "gemarkung":
      return clean(ctx.project.gemarkung);
    case "vermesser":
      return clean(party(ctx, "vermesser")?.name);
    case "kellerBauseits":
      return clean(party(ctx, "kellerbauer")?.name);
    case "bauherrName":
      return clean(c?.name);
    case "phone":
      return clean(c?.phone);
    case "email":
      return clean(c?.email);
    case "address":
      return wohnanschriftImProjekt(c);
    case "bauherr2Name":
      return clean(c?.name2);
    case "bauherr2Phone":
      return clean(c?.phone2);
    case "bauherr2Email":
      return clean(c?.email2);
  }
}

/**
 * Vergleich je Feld: aktueller Wert im Projekt gegen den ausgelesenen. Felder ohne ausgelesenen Wert fehlen.
 * Sonderfälle: Kellerbauer (aus "kellerBauseits = ja" wird „Bauseits“), Vermesser (gleicher Name, aber Kontakt ergänzt =
 * "neu"), Bauherr 1 (im Projekt nur der Nachname, im Vertrag Vor- und Nachname = "neu", wird ergänzt).
 */
export function vergleichZeilen(draft: ProjectDraft, ctx: VergleichKontext): VergleichZeile[] {
  const out: VergleichZeile[] = [];
  for (const key of VERGLEICH_FELDER) {
    const feld = draft.felder[key];
    const roh = clean(feld?.wert);
    if (!roh) continue;
    if (key === "kellerBauseits" && roh.toLowerCase() !== "ja") continue;
    const neu = key === "kellerBauseits" ? KELLER_BAUSEITS : roh;
    const aktuell = aktuellerWert(key, ctx);
    let status: VergleichStatus = !aktuell ? "neu" : istGleich(key, aktuell, neu, ctx) ? "gleich" : "abweichend";
    let zusatz: string | null = null;

    if (key === "vermesser") {
      const k = vermesserKontakt(draft);
      zusatz = joinNonEmpty([k.address, k.phone, k.email], " · ");
      // gleicher Vermesser, aber der Vertrag kennt Kontaktangaben, die im Projekt fehlen: ergänzen
      const p = party(ctx, "vermesser");
      if (status === "gleich" && p && ((k.address && !clean(p.address)) || (k.phone && !clean(p.phone)) || (k.email && !clean(p.email)))) status = "neu";
    }
    if (key === "bauherrName" && status === "abweichend" && aktuell && compactText(aktuell) === compactText(ctx.project.bauherrLabel) && compactText(neu).endsWith(compactText(aktuell))) {
      // im Projekt steht nur der Nachname (Projektname): der Vorname kommt dazu
      status = "neu";
    }
    out.push({ key, label: VERGLEICH_LABEL[key], aktuell, neu, zusatz, status, vorgewaehlt: status === "neu", feld });
  }
  return out;
}

/** Felder, die standardmäßig gewählt sind. */
export const vorauswahl = (zeilen: VergleichZeile[]): Set<VergleichKey> => new Set(zeilen.filter((z) => z.vorgewaehlt).map((z) => z.key));

/**
 * Die Änderung für repo.updateProject aus den gewählten Zeilen. Gleiche Werte werden nie geschrieben.
 * Kontaktfelder des Bauherrn: es werden nur die gewählten Felder geändert, die übrigen bleiben wie im Projekt.
 * Liefert null, wenn nichts zu ändern ist.
 */
export function patchAusVergleich(zeilen: VergleichZeile[], gewaehlt: ReadonlySet<VergleichKey>, draft: ProjectDraft, ctx: VergleichKontext): ProjectPatch | null {
  const project: NonNullable<ProjectPatch["project"]> = {};
  const parties: NonNullable<ProjectPatch["parties"]> = {};
  let bauherr: Partial<BauherrInput> | null = null;
  const addBauherr = (b: Partial<BauherrInput> | undefined) => {
    if (b) bauherr = { ...(bauherr ?? {}), ...b };
  };

  for (const z of zeilen) {
    if (!gewaehlt.has(z.key) || z.status === "gleich") continue;
    switch (z.key) {
      case "location":
      case "flur":
      case "flurstueck":
      case "gemarkung":
        project[z.key] = z.neu;
        break;
      case "vermesser": {
        const k = vermesserKontakt(draft);
        const cur = party(ctx, "vermesser");
        // gleicher Vermesser: nur leere Kontaktfelder füllen; anderer Vermesser: Kontakt ganz ersetzen (nichts vom alten mitnehmen)
        const input: PartyInput = cur && compactText(cur.name) === compactText(z.neu)
          ? { name: cur.name, ...(k.address && !clean(cur.address) ? { address: k.address } : {}), ...(k.phone && !clean(cur.phone) ? { phone: k.phone } : {}), ...(k.email && !clean(cur.email) ? { email: k.email } : {}) }
          : { name: z.neu, contact: null, address: k.address, phone: k.phone, mobile: null, email: k.email, fax: null };
        parties.vermesser = input;
        break;
      }
      case "kellerBauseits":
        parties.kellerbauer = { name: KELLER_BAUSEITS, contact: null, address: null, phone: null, mobile: null, email: null, fax: null };
        break;
      case "bauherrName": {
        const t = teileName(z.neu, ctx.project.bauherrLabel);
        addBauherr({ vorname: t.vorname, nachname: t.nachname ?? ctx.project.bauherrLabel });
        break;
      }
      case "buildingAddress": {
        const a = splitAnschrift(z.neu);
        // aufteilbar: getrennte Felder neu; sonst die Zeile, und alte getrennte Felder dürfen nicht stehen bleiben
        addBauherr({ buildingAddress: z.neu, siteStreet: a.strasse, sitePostalCode: a.plz, siteCity: a.ort });
        break;
      }
      default:
        addBauherr(formPatchFor(z.key, z.neu, []).bauherr);
    }
  }

  const patch: ProjectPatch = {};
  if (Object.keys(project).length) patch.project = project;
  if (Object.keys(parties).length) patch.parties = parties;
  if (bauherr) {
    const c = ctx.contact;
    // Pflichtteile der Kachel: unverändert aus dem Projekt, außer sie sind gewählt
    patch.bauherr = { phone: c?.phone ?? null, email: c?.email ?? null, address: c?.address ?? null, buildingAddress: c?.buildingAddress ?? null, ...(bauherr as Partial<BauherrInput>) };
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Beim Anlegen aus einem Vertrag: Beteiligte, die das Formular "Neues Projekt" nicht kennt. Kellerbauer „Bauseits“,
 * wenn der Werkvertrag Keller/Bodenplatte als bauseits nennt; Kontakt des Vermessers, wenn der Vermesser im Formular
 * noch der ausgelesene ist. Ein neues Projekt hat noch keinen Kellerbauer, es wird also nichts überschrieben.
 */
export function beteiligteNachAnlage(draft: ProjectDraft | null, vermesserImFormular: string | null | undefined): ProjectPatch["parties"] | null {
  if (!draft) return null;
  const out: NonNullable<ProjectPatch["parties"]> = {};
  if (draft.felder.kellerBauseits?.wert?.toLowerCase() === "ja") out.kellerbauer = { name: KELLER_BAUSEITS };
  const k = vermesserKontakt(draft);
  const name = clean(vermesserImFormular);
  if (name && compactText(name) === compactText(draft.felder.vermesser?.wert ?? "") && (k.address || k.phone || k.email)) out.vermesser = { name, ...k };
  return Object.keys(out).length ? out : null;
}
