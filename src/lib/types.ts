// Domänentypen der App. Spiegeln das Schema in supabase/migrations (snake_case → camelCase).

export type ProjectKind = "neubau" | "bauvoranfrage";
export type ProjectStatus = "aktiv" | "storno" | "abgeschlossen";
export type InvoiceStatus = "geplant" | "faellig" | "versendet" | "bezahlt";

/** Schritt-Key → Datum (YYYY-MM-DD). Fehlender Key = Schritt noch offen. */
export type StepDates = Partial<Record<string, string>>;

export interface Company {
  id: string;
  name: string;
  numberPrefix: string | null;
}

export interface Salesperson {
  id: string;
  companyId: string;
  name: string;
}

export interface TeamMember {
  id: string;
  code: string | null;
  name: string;
  role: "architekt" | "planer";
}

export interface Project {
  id: string;
  abmNr: string | null;
  kind: ProjectKind;
  status: ProjectStatus;
  companyId: string | null;
  salespersonId: string | null;
  bauherrLabel: string;
  location: string | null;
  architectId: string | null;
  planerId: string | null;
  baubetreuung: string | null;
  intakeMonth: string | null;
  notes: string | null;
  steps: StepDates;
}

export interface Invoice {
  id: string;
  projectId: string;
  label: string;
  amountCents: number;
  triggerStep: string | null;
  status: InvoiceStatus;
  dueOn: string | null;
  sentOn: string | null;
  paidOn: string | null;
}

/** Alles, was die Warnlogik braucht. */
export interface Snapshot {
  companies: Company[];
  salespeople: Salesperson[];
  team: TeamMember[];
  projects: Project[];
  invoices: Invoice[];
}
