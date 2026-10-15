// Vom Entwurf zum Formular "Neues Projekt" und Duplikatprüfung. Reine Funktionen.

import { splitAnschrift } from "../planungsprotokoll/daten";
import { compactText } from "../projectFilters";
import type { NewProject } from "../repo";
import type { BauherrContact, Company, ContractMeta, Project } from "../types";
import type { DraftFieldKey, ProjectDraft } from "./types";

/** Formularfelder, zu denen der Entwurf eine Herkunft liefern kann. */
export type FormKey =
  | "bauherrLabel"
  | "bauherrName"
  | "phone"
  | "email"
  | "address"
  | "name2"
  | "phone2"
  | "email2"
  | "companyId"
  | "buildingAddress"
  | "location"
  | "flurstueck"
  | "gemarkung"
  | "vermesser"
  | "vertragsart"
  | "vertragsdatum"
  | "vertragspreis"
  | "angebotsnummer"
  | "haustyp";

/** Welches Entwurfsfeld ein Formularfeld speist. */
export const FORM_SOURCE: Record<FormKey, DraftFieldKey> = {
  bauherrLabel: "bauherrLabel",
  bauherrName: "bauherrName",
  phone: "phone",
  email: "email",
  address: "address",
  name2: "bauherr2Name",
  phone2: "bauherr2Phone",
  email2: "bauherr2Email",
  companyId: "company",
  buildingAddress: "buildingAddress",
  location: "location",
  flurstueck: "flurstueck",
  gemarkung: "gemarkung",
  vermesser: "vermesser",
  vertragsart: "vertragsart",
  vertragsdatum: "vertragsdatum",
  vertragspreis: "vertragspreis",
  angebotsnummer: "angebotsnummer",
  haustyp: "haustyp",
};

/** Telefon und E-Mail: bei Scans und Handschrift immer zur Kontrolle hervorheben, egal wie sicher der Extractor ist. */
export const ALWAYS_CHECK: FormKey[] = ["phone", "email", "phone2", "email2"];

const same = (a: string, b: string) => compactText(a) === compactText(b);
const contains = (a: string, b: string) => compactText(a).includes(compactText(b)) || compactText(b).includes(compactText(a));

export interface AppliedDraft {
  form: NewProject;
  meta: ContractMeta;
  /** Erkannt, aber in den Stammdaten nicht gefunden: der Mensch wählt oder legt an. */
  unmatched: { company?: string };
}

/**
 * Trägt die erkannten Werte in das Formular ein. Die Hausbaufirma wird gegen die Stammdaten abgeglichen
 * (nichts wird automatisch angelegt). Vertragsdatum, Vertragspreis, Angebotsnummer und Haustyp sind Metadaten
 * des Dokuments und keine Projektfelder. Die Hausbau-Nr. wird nie aus dem Vertrag übernommen.
 */
export function applyDraft(draft: ProjectDraft, base: NewProject, ctx: { companies: Company[] }): AppliedDraft {
  const f = draft.felder;
  const v = (k: DraftFieldKey) => f[k].wert?.trim() || null;
  const unmatched: AppliedDraft["unmatched"] = {};

  const companyName = v("company");
  const company = companyName ? (ctx.companies.find((c) => same(c.name, companyName)) ?? ctx.companies.find((c) => contains(c.name, companyName))) : undefined;
  if (companyName && !company) unmatched.company = companyName;

  // Getrennte Anschrift und Bauort fürs Planungsprotokoll: aus der erkannten Zeile, wenn sie eindeutig aufteilbar ist
  const wohn = splitAnschrift(v("address"));
  const bau = splitAnschrift(v("buildingAddress"));
  const form: NewProject = {
    ...base,
    bauherrLabel: v("bauherrLabel") ?? base.bauherrLabel,
    location: v("location") ?? base.location,
    companyId: company?.id ?? base.companyId,
    // andere Firma als im leeren Formular: ein vorgewählter Verkäufer passt nicht mehr
    salespersonId: company && company.id !== base.companyId ? null : base.salespersonId,
    vermesser: v("vermesser") ?? base.vermesser ?? null,
    flurstueck: v("flurstueck"),
    gemarkung: v("gemarkung"),
    bauherr: {
      name: v("bauherrName"),
      phone: v("phone"),
      email: v("email"),
      address: v("address"),
      buildingAddress: v("buildingAddress"),
      name2: v("bauherr2Name"),
      phone2: v("bauherr2Phone"),
      email2: v("bauherr2Email"),
      street: wohn.strasse,
      postalCode: wohn.plz,
      city: wohn.ort,
      siteStreet: bau.strasse,
      sitePostalCode: bau.plz,
      siteCity: bau.ort,
    },
  };
  const meta: ContractMeta = {};
  for (const k of ["vertragsdatum", "vertragspreis", "angebotsnummer", "haustyp"] as const) {
    const value = v(k);
    if (value) meta[k] = value;
  }
  return { form, meta, unmatched };
}

/** Metadaten für die Ablage: nur gefüllte Werte, ohne Rand-Leerzeichen. */
export function cleanMeta(meta: ContractMeta): ContractMeta {
  const out: ContractMeta = {};
  for (const k of ["vertragsdatum", "vertragspreis", "angebotsnummer", "haustyp"] as const) {
    const value = meta[k]?.trim();
    if (value) out[k] = value.slice(0, 200);
  }
  return out;
}

export type SimilarReason = "bauherr" | "adresse" | "flurstueck";

export interface SimilarProject {
  project: Project;
  /** Warum das Projekt ähnlich ist, für die Anzeige. */
  gruende: SimilarReason[];
}

export const SIMILAR_LABEL: Record<SimilarReason, string> = { bauherr: "gleicher Bauherr", adresse: "gleiche Bauadresse", flurstueck: "gleiches Flurstück" };

/** Adresse vergleichbar machen: ohne Zusätze in Klammern, "Straße" und "Str." gleich. */
function addressKey(s: string | null | undefined): string {
  if (!s) return "";
  return compactText(s.replace(/\(.*?\)/g, "").replace(/stra(ß|ss)e/gi, "str"));
}

/** Flurstück vergleichbar machen: nur Ziffern und Schrägstrich ("Flst. 412/3" = "412/3"). */
function parcelKey(s: string | null | undefined): string {
  return s?.match(/\d+(?:\s*\/\s*\d+)?/)?.[0].replace(/\s/g, "") ?? "";
}

/**
 * Ähnliche Projekte vor dem Speichern: gleicher Bauherr (Nachname), gleiche Bauadresse oder gleiches Flurstück.
 * Beim Flurstück muss die Gemarkung passen, wenn beide Seiten eine nennen (dieselbe Nummer gibt es in jeder Gemarkung).
 * Stornierte Projekte zählen nicht. `bauherren` ist für Freiberufler leer; dann greifen nur Name und Flurstück.
 */
export function similarProjects(
  input: { bauherrLabel: string; buildingAddress: string | null; flurstueck?: string | null; gemarkung?: string | null },
  projects: Project[],
  bauherren: BauherrContact[],
): SimilarProject[] {
  const name = compactText(input.bauherrLabel);
  const addr = addressKey(input.buildingAddress);
  const parcel = parcelKey(input.flurstueck);
  const district = compactText(input.gemarkung ?? "");
  const contact = new Map(bauherren.map((b) => [b.projectId, b]));
  const out: SimilarProject[] = [];
  for (const p of projects) {
    if (p.status === "storno") continue;
    const gruende: SimilarReason[] = [];
    if (name.length >= 2 && compactText(p.bauherrLabel) === name) gruende.push("bauherr");
    if (addr && addressKey(contact.get(p.id)?.buildingAddress) === addr) gruende.push("adresse");
    const otherDistrict = compactText(p.gemarkung ?? "");
    if (parcel && parcelKey(p.flurstueck) === parcel && (!district || !otherDistrict || district === otherDistrict)) gruende.push("flurstueck");
    if (gruende.length) out.push({ project: p, gruende });
  }
  return out;
}
