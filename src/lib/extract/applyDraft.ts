// Vom Entwurf zum Formular "Neues Projekt" und Duplikatprüfung. Reine Funktionen.

import { compactText } from "../projectFilters";
import type { NewProject } from "../repo";
import type { BauherrContact, Company, Project, Salesperson } from "../types";
import type { DraftFieldKey, ProjectDraft } from "./types";

/** Formularfelder, zu denen der Entwurf eine Herkunft liefern kann. */
export type FormKey = "bauherrLabel" | "bauherrName" | "phone" | "email" | "address" | "buildingAddress" | "location" | "companyId" | "salespersonId" | "hausbauNr" | "abmNr" | "vermesser";

/** Welches Entwurfsfeld ein Formularfeld speist. */
export const FORM_SOURCE: Record<FormKey, DraftFieldKey> = {
  bauherrLabel: "bauherrLabel",
  bauherrName: "bauherrName",
  phone: "phone",
  email: "email",
  address: "address",
  buildingAddress: "buildingAddress",
  location: "location",
  companyId: "company",
  salespersonId: "salesperson",
  hausbauNr: "hausbauNr",
  abmNr: "abmNr",
  vermesser: "vermesser",
};

const same = (a: string, b: string) => compactText(a) === compactText(b);
const contains = (a: string, b: string) => compactText(a).includes(compactText(b)) || compactText(b).includes(compactText(a));

export interface AppliedDraft {
  form: NewProject;
  /** Erkannt, aber in den Stammdaten nicht gefunden: der Mensch wählt oder legt an. */
  unmatched: { company?: string; salesperson?: string };
}

/**
 * Trägt die erkannten Werte in das Formular ein. Firma und Verkäufer werden gegen die Stammdaten abgeglichen
 * (nichts wird automatisch angelegt). Ein Flurstück wird an die Bauadresse angehängt, weil es dafür kein eigenes Feld gibt.
 */
export function applyDraft(draft: ProjectDraft, base: NewProject, ctx: { companies: Company[]; salespeople: Salesperson[] }): AppliedDraft {
  const f = draft.felder;
  const v = (k: DraftFieldKey) => f[k].wert?.trim() || null;
  const unmatched: AppliedDraft["unmatched"] = {};

  const companyName = v("company");
  const company = companyName ? (ctx.companies.find((c) => same(c.name, companyName)) ?? ctx.companies.find((c) => contains(c.name, companyName))) : undefined;
  if (companyName && !company) unmatched.company = companyName;
  const salesName = v("salesperson")?.replace(/^(Herr|Frau)\s+/, "") ?? null;
  const sales = salesName && company ? ctx.salespeople.find((s) => s.companyId === company.id && same(s.name, salesName)) : undefined;
  if (salesName && !sales) unmatched.salesperson = salesName;

  const flurstueck = v("flurstueck");
  const street = v("buildingAddress");
  const buildingAddress = street && flurstueck ? `${street} (${flurstueck})` : (street ?? flurstueck);

  const form: NewProject = {
    ...base,
    bauherrLabel: v("bauherrLabel") ?? base.bauherrLabel,
    abmNr: v("abmNr") ?? base.abmNr,
    hausbauNr: v("hausbauNr") ?? base.hausbauNr,
    location: v("location") ?? base.location,
    companyId: company?.id ?? base.companyId,
    salespersonId: sales?.id ?? base.salespersonId,
    vermesser: v("vermesser") ?? base.vermesser ?? null,
    bauherr: {
      name: v("bauherrName"),
      phone: v("phone"),
      email: v("email"),
      address: v("address"),
      buildingAddress,
    },
  };
  return { form, unmatched };
}

export interface SimilarProject {
  project: Project;
  /** Warum das Projekt ähnlich ist, für die Anzeige. */
  grund: "bauherr" | "adresse" | "beides";
}

/** Adresse vergleichbar machen: ohne Zusätze in Klammern, "Straße" und "Str." gleich. */
function addressKey(s: string | null | undefined): string {
  if (!s) return "";
  return compactText(s.replace(/\(.*?\)/g, "").replace(/stra(ß|ss)e/gi, "str"));
}

const flurKey = (s: string | null | undefined) => s?.match(/Flurst(?:ü|ue)ck\s*(\d+(?:\/\d+)?)/i)?.[1] ?? "";

/**
 * Ähnliche Projekte vor dem Speichern: gleicher Bauherr (Nachname) oder gleiche Bauadresse bzw. gleiches Flurstück.
 * Stornierte Projekte zählen nicht. `bauherren` ist für Freiberufler leer; dann greift nur der Name.
 */
export function similarProjects(input: { bauherrLabel: string; buildingAddress: string | null }, projects: Project[], bauherren: BauherrContact[]): SimilarProject[] {
  const name = compactText(input.bauherrLabel);
  const addr = addressKey(input.buildingAddress);
  const flur = flurKey(input.buildingAddress);
  const contact = new Map(bauherren.map((b) => [b.projectId, b]));
  const out: SimilarProject[] = [];
  for (const p of projects) {
    if (p.status === "storno") continue;
    const sameName = name.length >= 2 && compactText(p.bauherrLabel) === name;
    const other = contact.get(p.id)?.buildingAddress;
    const sameAddr = Boolean((addr && addressKey(other) === addr) || (flur && flurKey(other) === flur));
    if (sameName || sameAddr) out.push({ project: p, grund: sameName && sameAddr ? "beides" : sameName ? "bauherr" : "adresse" });
  }
  return out;
}
