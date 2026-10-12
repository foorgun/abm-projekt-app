// Erfundener Demo-Datenbestand. Keine echten Bauherren, Adressen oder Mails.
// Alle Daten sind relativ zu `today` erzeugt, damit Warnungen und Fristen an jedem Tag gleich aussehen.
// Deterministisch über einen festen Seed: gleicher Tag → gleiche Daten.

import { concretePath } from "../lib/folders";
import { addDays, monthStart } from "../lib/format";
import { rng, type Rng } from "../lib/random";
import type {
  Activity,
  AgentRun,
  BauherrContact,
  Company,
  Dataset,
  InboxAttachment,
  InboxItem,
  Invoice,
  Mailbox,
  Project,
  ProjectDocument,
  ProjectParty,
  Salesperson,
  Task,
  TeamMember,
} from "../lib/types";
import { allStepDefinitions, buildFolderTemplates } from "./templates";

export const DEMO_SEED = 20261009;

const BG = "09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige";

export const COMPANIES: Company[] = [
  { id: "c-bz", name: "Bien-Zenker", numberPrefix: "8161" },
  { id: "c-lh", name: "Living Haus", numberPrefix: "8260" },
  { id: "c-sh", name: "Schwabenhaus", numberPrefix: "8185" },
];

export const SALESPEOPLE: Salesperson[] = [
  { id: "s-1", companyId: "c-bz", name: "Jonas Reiter", email: "j.reiter@bien-zenker.example" },
  { id: "s-2", companyId: "c-bz", name: "Petra Lang", email: "p.lang@bien-zenker.example" },
  { id: "s-3", companyId: "c-lh", name: "Marco Brandt", email: "m.brandt@livinghaus.example" },
  { id: "s-4", companyId: "c-sh", name: "Ralf Kunze", email: "r.kunze@schwabenhaus.example" },
];

export const TEAM: TeamMember[] = [
  { id: "t-be", code: "BE", name: "Architekt BE", role: "architekt" },
  { id: "t-mc", code: "MC", name: "Architekt MC", role: "architekt" },
  { id: "t-tb", code: null, name: "T. Brandl", role: "planer" },
  { id: "t-sk", code: null, name: "S. Kohler", role: "planer" },
];

/** Im Demo-Modus ist der Freiberufler diesem Planer zugeordnet und sieht nur dessen Projekte. */
export const DEMO_FREELANCER_TEAM_ID = "t-sk";

const SURNAMES = [
  "Albrecht", "Baumann", "Brenner", "Dietrich", "Eberle", "Fischer", "Graf", "Haas", "Hofmann", "Huber", "Jäger",
  "Kaiser", "Keller", "Kraus", "Lehmann", "Maier", "Moser", "Neumann", "Ott", "Pfeiffer", "Rapp", "Roth", "Sauter",
  "Schäfer", "Schmid", "Seitz", "Sommer", "Stark", "Vogt", "Wagner", "Walter", "Weber", "Winkler", "Wolf", "Zeller",
  "Bühler", "Frank", "Lutz", "Mayer", "Reiß", "Arnold", "Beck", "Dreher", "Ernst", "Geiger", "Haug", "Jung", "Kurz",
  "Lang", "Metzger", "Nagel", "Pfister", "Rieger", "Schuler", "Thoma", "Ulmer", "Veit", "Wieland", "Ziegler", "Gebhardt",
];

const TOWNS: [string, string][] = [
  ["Ulm", "89075"], ["Neu-Ulm", "89231"], ["Blaubeuren", "89143"], ["Dornstadt", "89160"], ["Erbach", "89155"],
  ["Langenau", "89129"], ["Laupheim", "88471"], ["Senden", "89250"], ["Ehingen", "89584"], ["Illertissen", "89257"],
  ["Weißenhorn", "89264"], ["Blaustein", "89134"], ["Ehningen", "71139"], ["Tübingen", "72070"],
];

const STREETS = ["Ahornweg", "Birkenstraße", "Lindenweg", "Am Kirchberg", "Wiesenstraße", "Gartenweg", "Eichenring", "Talstraße", "Sonnenhalde", "Mühlweg"];

const VERMESSER = ["Vermessungsbüro Albrecht & Partner", "Ingenieurbüro Kessler Vermessung", "Vermessung Donautal"];
const ERDBAU = ["Erdbau Hummel GmbH", "Tiefbau Gerber", "Baggerbetrieb Rösch"];
const STROM = ["Stromnetz Alb-Donau", "Netzgesellschaft Iller"];
const WASSER = ["Wasserversorgung Lonetal", "Zweckverband Wasser Blau"];
const ELEKTRO = ["Elektro Fink", "Elektrotechnik Sailer", "Strom & Licht Maurer"];

/** Typische Abstände (Tage) zwischen aufeinanderfolgenden Schritten, in Reihenfolge der Schrittdefinitionen. */
const GAPS: Record<string, number> = {
  plangespraech: 0,
  vertrag_versendet: 5,
  vertrag_zurueck: 12,
  vermesser_beauftragt: 6,
  entwurf_freigegeben: 24,
  vorabzug_versendet: 12,
  baugesuch_uebergabe: 16,
  baugenehmigung: 85,
  baufreigabe: 14,
  bauanlaufgespraech: 20,
  hausanschluesse_beantragt: 12,
  hausaufstellung: 55,
};

interface ProjectSpec {
  /** Anzahl erledigter Schritte (in Reihenfolge). */
  stage: number;
  /** Tage seit dem letzten erledigten Schritt. */
  lastAgo: number;
  /** Alternativ: Eingang vor so vielen Tagen; Schritte laufen dann vorwärts bis heute (Zufallsprojekte). */
  intakeAgo?: number;
  status?: Project["status"];
  kind?: Project["kind"];
  /** Schritt-Keys, die trotz späterer Schritte fehlen ("fehlt noch"). */
  skip?: string[];
  name?: string;
  town?: string;
  companyId?: string | null;
  planerId?: string | null;
}

/**
 * Bewusst gesetzte Fälle, die die Oberfläche zeigen soll. Reihenfolge = Projektindex.
 * Alle anderen Projekte werden zufällig (aber stabil) erzeugt.
 */
const SPECIAL: ProjectSpec[] = [
  // 0: der 10.000-€-Fall: Genehmigung vor 56 Tagen, Rechnung seit 42 Tagen fällig, nie versendet
  { stage: 8, lastAgo: 56, name: "Reinhardt", town: "Ulm", companyId: "c-bz", planerId: "t-sk" },
  // 1: Vertrag seit 26 Tagen draußen, nicht zurück → Hinweis
  { stage: 2, lastAgo: 26, name: "Engelhardt", town: "Neu-Ulm", companyId: "c-lh" },
  // 2: Baugesuch vor 131 Tagen übergeben, Genehmigung fehlt → Info
  { stage: 7, lastAgo: 131, name: "Scholz", town: "Ehningen", companyId: "c-sh", planerId: "t-sk" },
  // 3: Bauvoranfrage
  { stage: 3, lastAgo: 9, name: "Winter", town: "Ulm", kind: "bauvoranfrage", companyId: null },
  // 4: Storno
  { stage: 1, lastAgo: 160, name: "Fuchs", town: "Tübingen", status: "storno", companyId: "c-bz" },
  // 5: Schritt übersprungen: Vertrag zurück fehlt, obwohl Vermesser schon beauftragt
  { stage: 4, lastAgo: 4, skip: ["vertrag_zurueck"], name: "Hartmann", town: "Langenau", companyId: "c-bz", planerId: "t-sk" },
  // 6: Genehmigung vor 3 Tagen, geplante Rechnung wird fällig → Hinweis
  { stage: 8, lastAgo: 3, name: "Kessler", town: "Erbach", companyId: "c-lh" },
  // 7: zweite dringende Rechnung (kleiner, kürzer überfällig)
  { stage: 9, lastAgo: 30, name: "Lorenz", town: "Senden", companyId: "c-sh" },
  // 8, 9: abgeschlossen
  { stage: 12, lastAgo: 38, status: "abgeschlossen", name: "Brandner", town: "Blaustein", companyId: "c-bz" },
  { stage: 12, lastAgo: 96, status: "abgeschlossen", name: "Gruber", town: "Laupheim", companyId: "c-lh" },
  // 10, 11: gleicher Nachname in zwei Orten (für mehrdeutige Mails an den Agenten)
  { stage: 5, lastAgo: 6, name: "Vogel", town: "Ulm", companyId: "c-bz" },
  { stage: 4, lastAgo: 3, name: "Vogel", town: "Senden", companyId: "c-lh" },
];

const RANDOM_COUNT = 34;
/** Ältere Projekte (Eingang vor 13 bis 24 Monaten), inzwischen abgeschlossen: liefern Rechnungen für die 12-Monats-Verläufe. */
const OLD_COUNT = 14;

function daysAgo(today: string, iso: string) {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, "0");
}

function iso(today: string, ago: number, hour: number, minute: number) {
  return `${addDays(today, -ago)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

const has = (p: Project, k: string) => Boolean(p.steps[k]);

export interface TaskTemplate {
  title: string;
  /** Fällig in Tagen ab heute (negativ = überfällig), null = ohne Termin */
  due: number | null;
  done?: boolean;
  /** Projekt muss in dieser Phase sein; ohne Bedingung: Aufgabe ohne Projekt. */
  fits?: (p: Project) => boolean;
}

/** Erfundene Aufgaben, jeweils nur bei Projekten in passender Phase (keine Behördenrückfrage vor dem Baugesuch usw.). */
export const TASK_TEMPLATES: TaskTemplate[] = [
  { title: "Vorabzug an Bauherrschaft senden", due: -3, fits: (p) => has(p, "entwurf_freigegeben") && !has(p, "vorabzug_versendet") },
  { title: "Rückfrage Landratsamt zu Stellplätzen beantworten", due: -1, fits: (p) => has(p, "baugesuch_uebergabe") && !has(p, "baugenehmigung") },
  { title: "Unterschriften Bauantragspläne einholen", due: -6, fits: (p) => has(p, "vorabzug_versendet") && !has(p, "baugesuch_uebergabe") },
  { title: "Bauanlaufgespräch terminieren", due: 0, fits: (p) => has(p, "baufreigabe") && !has(p, "bauanlaufgespraech") },
  { title: "Wohnflächenberechnung prüfen", due: 0, fits: (p) => has(p, "entwurf_freigegeben") && !has(p, "baugesuch_uebergabe") },
  { title: "Entwässerungsantrag vorbereiten", due: 2, fits: (p) => has(p, "vorabzug_versendet") && !has(p, "baugesuch_uebergabe") },
  { title: "Statik beim Tragwerksplaner anfragen", due: 3, fits: (p) => has(p, "entwurf_freigegeben") && !has(p, "baugesuch_uebergabe") },
  { title: "Hausanschlüsse Strom und Wasser beantragen", due: 4, fits: (p) => has(p, "baufreigabe") && !has(p, "hausanschluesse_beantragt") },
  { title: "Amtlichen Lageplan beim Vermesser bestellen", due: 6, fits: (p) => has(p, "vermesser_beauftragt") && !has(p, "baugesuch_uebergabe") },
  { title: "Baustellentermin mit Kellerbaufirma abstimmen", due: 12, fits: (p) => has(p, "bauanlaufgespraech") && !has(p, "hausaufstellung") },
  { title: "Preisspiegel Erdarbeiten erstellen", due: 18, fits: (p) => has(p, "baufreigabe") && !has(p, "hausaufstellung") },
  { title: "Entwurf mit Bauherrschaft besprechen", due: 5, fits: (p) => has(p, "vertrag_zurueck") && !has(p, "entwurf_freigegeben") },
  { title: "Team-Besprechung Projektliste", due: 5 },
  { title: "Eingangsbestätigung ablegen", due: -8, done: true, fits: (p) => has(p, "baugesuch_uebergabe") },
  { title: "Entwurf 2 an Verkäufer senden", due: -4, done: true, fits: (p) => has(p, "entwurf_freigegeben") },
  { title: "Geländeprofile anfordern", due: -2, done: true, fits: (p) => has(p, "vermesser_beauftragt") },
];

export function buildDemoDataset(today: string, seed = DEMO_SEED): Dataset {
  const r = rng(seed);
  const steps = allStepDefinitions();
  const folderTemplates = buildFolderTemplates();

  /** Uhrzeit für Demo-Einträge: heute nur früh (6 bis 8 Uhr), damit nichts "in der Zukunft" liegt, wenn die Demo morgens läuft. */
  const clock = (date: string) => {
    const hour = r.int(8, 17);
    const minute = r.int(0, 59);
    return `${date}T${pad(date === today ? 6 + (hour % 2) : hour, 2)}:${pad(minute, 2)}:00`;
  };

  // ---------------------------------------------------------------- Projekte
  const specs: ProjectSpec[] = [...SPECIAL];
  for (let i = 0; i < RANDOM_COUNT; i++) {
    // Eingang gleichmäßig über die letzten 12 Monate verteilt; die Schritte laufen vorwärts bis heute.
    // Weil die Abstände unter den Warnschwellen bleiben, erzeugen Zufallsprojekte keine ungeplanten Warnungen.
    specs.push({
      stage: 0,
      lastAgo: 0,
      intakeAgo: Math.round(((i + r.next()) / RANDOM_COUNT) * 360),
      status: r.chance(0.04) ? "storno" : undefined,
      kind: r.chance(0.05) ? "bauvoranfrage" : "neubau",
    });
  }

  for (let i = 0; i < OLD_COUNT; i++) {
    specs.push({ stage: 0, lastAgo: 0, intakeAgo: 385 + Math.round(((i + r.next()) / OLD_COUNT) * 330), kind: "neubau" });
  }

  const usedNames = new Set(SPECIAL.map((s) => s.name));
  const projects: Project[] = [];
  const parties: ProjectParty[] = [];
  const bauherren: BauherrContact[] = [];
  const numberCounters: Record<string, number> = { "8161": 101, "8260": 41, "8185": 23 };

  specs.forEach((spec, idx) => {
    const id = `p-${pad(idx + 1)}`;
    let name = spec.name;
    while (!name || (usedNames.has(name) && !spec.name)) name = r.pick(SURNAMES);
    usedNames.add(name);
    const [town, plz] = spec.town ? (TOWNS.find((t) => t[0] === spec.town) ?? [spec.town, "89000"]) : r.pick(TOWNS);
    const kind = spec.kind ?? "neubau";
    const companyId = spec.companyId !== undefined ? spec.companyId : kind === "bauvoranfrage" ? null : r.pick(COMPANIES).id;
    const company = COMPANIES.find((c) => c.id === companyId);
    const sales = company ? SALESPEOPLE.filter((s) => s.companyId === company.id) : [];

    const dates: Record<string, string> = {};
    let done = steps.slice(0, spec.stage);
    let cursor = -spec.lastAgo;
    if (spec.intakeAgo !== undefined) {
      // Vorwärts: ab Eingang, solange der nächste Schritt nicht in der Zukunft liegt
      cursor = -spec.intakeAgo;
      done = [];
      for (const s of steps) {
        const next = cursor + Math.max(1, Math.round((GAPS[s.key] ?? 10) * (0.7 + r.next() * 0.5))) + (s.key === "plangespraech" ? r.int(3, 12) : 0);
        if (next > 0) break;
        cursor = next;
        dates[s.key] = addDays(today, cursor);
        done.push(s);
      }
      cursor = -spec.intakeAgo;
    } else {
      // Rückwärts vom letzten erledigten Schritt (bewusst gesetzte Fälle)
      for (let i = done.length - 1; i >= 0; i--) {
        const key = done[i].key;
        dates[key] = addDays(today, cursor);
        const gap = GAPS[key] ?? 10;
        cursor -= Math.max(1, Math.round(gap * (0.7 + r.next() * 0.6)));
      }
    }
    for (const k of spec.skip ?? []) delete dates[k];
    const firstDate = done.length ? dates[done[0].key] ?? addDays(today, cursor) : addDays(today, -spec.lastAgo);

    const abmNr =
      kind === "bauvoranfrage"
        ? "Bauvoranfrage"
        : company?.numberPrefix
          ? `${company.numberPrefix}-${pad(numberCounters[company.numberPrefix]++)}`
          : null;

    projects.push({
      id,
      abmNr,
      hausbauNr: company ? `HB-${firstDate.slice(2, 4)}${pad(r.int(100, 999))}` : null,
      kind,
      status: spec.status ?? (dates.hausaufstellung && daysAgo(today, dates.hausaufstellung) > 21 ? "abgeschlossen" : "aktiv"),
      companyId,
      salespersonId: sales.length ? r.pick(sales).id : null,
      bauherrLabel: name!,
      location: town,
      architectId: r.pick(["t-be", "t-mc"]),
      planerId: spec.planerId !== undefined ? spec.planerId : r.pick(["t-tb", "t-sk", null]),
      baubetreuung: r.chance(0.3) ? "3.1+3.2" : null,
      intakeMonth: monthStart(firstDate),
      notes: null,
      steps: dates,
    });

    const street = `${r.pick(STREETS)} ${r.int(1, 48)}`;
    bauherren.push({
      projectId: id,
      name: `Familie ${name}`,
      address: `${r.pick(STREETS)} ${r.int(1, 60)}, ${plz} ${town}`,
      phone: "0731 000000",
      email: `${name!.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
      buildingAddress: `${street}, ${plz} ${town}`,
    });

    parties.push(
      { projectId: id, role: "vermesser", name: r.pick(VERMESSER), contact: "vermessung@example.com" },
      { projectId: id, role: "erdbauer", name: r.pick(ERDBAU), contact: null },
      { projectId: id, role: "strom", name: r.pick(STROM), contact: "netzanschluss@example.com" },
      { projectId: id, role: "wasser", name: r.pick(WASSER), contact: null },
      { projectId: id, role: "elektriker_baustrom", name: r.pick(ELEKTRO), contact: null },
    );
  });

  // ---------------------------------------------------------------- Rechnungen
  const invoices: Invoice[] = [];
  let invNo = 1;
  const inv = (p: Project, label: string, euros: number, trigger: string, status: Invoice["status"], dueOn: string | null, sentOn: string | null, paidOn: string | null) =>
    invoices.push({ id: `i-${pad(invNo++)}`, projectId: p.id, label, amountCents: euros * 100, triggerStep: trigger, status, dueOn, sentOn, paidOn });

  // Annahmen für die Demo (mit ABM abzustimmen, docs/offene-fragen.md):
  // fällig 7 Tage nach dem auslösenden Schritt, versendet meist wenige Tage um die Fälligkeit, bezahlt 8 bis 28 Tage nach Versand.
  const DUE_AFTER = 7;
  function billed(p: Project, label: string, euros: number, trigger: string, stepDate: string, alwaysPaid = false) {
    const due = addDays(stepDate, DUE_AFTER);
    if (due > today) return inv(p, label, euros, trigger, "geplant", due, null, null);
    let sent = addDays(due, r.int(-4, 9));
    if (sent < stepDate) sent = stepDate;
    if (sent > today) sent = today; // keine ungeplanten "nicht versendet"-Warnungen
    const paid = alwaysPaid || r.chance(0.78) ? addDays(sent, r.int(8, 28)) : null;
    const isPaid = paid != null && paid <= today;
    inv(p, label, euros, trigger, isPaid ? "bezahlt" : "versendet", due, sent, isPaid ? paid : null);
  }

  projects.forEach((p, idx) => {
    if (p.kind === "bauvoranfrage") {
      if (p.steps.vertrag_zurueck) billed(p, "Bauvoranfrage pauschal", 1800, "vertrag_zurueck", p.steps.vertrag_zurueck);
      return;
    }
    const back = p.steps.vertrag_zurueck;
    if (back) billed(p, "Abschlag Vorplanung", r.pick([2800, 3500, 3500, 4200]), "vertrag_zurueck", back, true);
    else if (p.status === "aktiv" && p.steps.vertrag_versendet) inv(p, "Abschlag Vorplanung", 3500, "vertrag_zurueck", "geplant", null, null, null);

    const permit = p.steps.baugenehmigung;
    if (idx === 0) {
      // Der Fall aus dem Büroalltag: Genehmigung erteilt, Rechnung nie verschickt
      inv(p, "Abschlag Genehmigungsplanung", 10000, "baugenehmigung", "faellig", addDays(today, -42), null, null);
    } else if (idx === 6) {
      inv(p, "Abschlag Genehmigungsplanung", 8500, "baugenehmigung", "geplant", null, null, null);
    } else if (permit) {
      billed(p, "Abschlag Genehmigungsplanung", r.pick([8500, 9500, 10000, 12000]), "baugenehmigung", permit, p.status === "abgeschlossen");
    } else if (p.status === "aktiv") {
      inv(p, "Abschlag Genehmigungsplanung", r.pick([8500, 9500, 10000]), "baugenehmigung", "geplant", null, null, null);
    }

    if (idx === 7) {
      inv(p, "Abschlag Baubegleitung", 2400, "baufreigabe", "faellig", addDays(today, -12), null, null);
    } else if (p.steps.hausaufstellung) {
      billed(p, "Schlussrechnung", r.pick([2500, 3200, 4000]), "hausaufstellung", p.steps.hausaufstellung, p.status === "abgeschlossen");
    } else if (p.status === "aktiv" && p.steps.baufreigabe) {
      inv(p, "Schlussrechnung", r.pick([2500, 3200]), "hausaufstellung", "geplant", null, null, null);
    }
  });

  // Zwei weitere fällige, nicht versendete Rechnungen (für die Verteilung nach Alter): 5 und 18 Tage überfällig
  const lateCandidates = projects.filter((p, idx) => idx >= SPECIAL.length && p.status === "aktiv" && p.kind === "neubau" && p.steps.baufreigabe && p.steps.baufreigabe < addDays(today, -30));
  [
    { days: 5, euros: 4200 },
    { days: 18, euros: 3600 },
  ].forEach((x, i) => {
    const p = lateCandidates[i];
    if (p) inv(p, "Abschlag Ausführungsplanung", x.euros, "baufreigabe", "faellig", addDays(today, -x.days), null, null);
  });

  // ---------------------------------------------------------------- Dokumente
  const documents: ProjectDocument[] = [];
  let docNo = 1;
  const addDoc = (p: Project, folder: string, date: string, name: string, source: ProjectDocument["source"] = "upload", sourceItemId: string | null = null) => {
    const folderPath = concretePath(folder, date);
    const fileName = `${date}_${name}`;
    documents.push({
      id: `d-${pad(docNo++, 4)}`,
      projectId: p.id,
      name,
      folderPath,
      storagePath: `${p.id}/${folderPath}/${fileName}`,
      mime: name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream",
      sizeBytes: r.int(80, 4200) * 1024,
      source,
      sourceItemId,
      receivedOn: date,
      uploadedBy: source === "upload" ? r.pick(TEAM).name : null,
      createdAt: clock(date),
    });
  };

  const DOCS: Record<string, [string, string, ProjectDocument["source"]?][]> = {
    plangespraech: [["02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft/01 Überschrift {datum}", "Protokoll_Plangespraech.pdf"]],
    vertrag_zurueck: [["01 Projektbeteiligte", "ABM-Vertrag_unterschrieben.pdf"]],
    vermesser_beauftragt: [["04 Vermesser/01 Vermesser beauftragt am {datum}", "Auftrag_Vermessung.pdf"]],
    entwurf_freigegeben: [
      ["05 Entwurf/01 Entwurf 1 Pläne", "Entwurf_1_Grundrisse.pdf"],
      ["05 Entwurf/02 Entwurf 2 Pläne", "Entwurf_2_Ansichten.pdf"],
    ],
    vorabzug_versendet: [["07 Vorabzug/02 Vorabzugspläne", "Vorabzug_Plaene.pdf"]],
    baugesuch_uebergabe: [
      ["08 Bauantrag/03 Wohnflächenberechnung", "Wohnflaechenberechnung.pdf"],
      ["08 Bauantrag/04 Amtliche Lagepläne", "Amtlicher_Lageplan.pdf"],
      ["08 Bauantrag/05 Eingangsbestätigung/01 Eingangsbestätigung", "Eingangsbestaetigung_Bauantrag.pdf", "agent"],
    ],
    baugenehmigung: [[`${BG}/01 Baugenehmigung/01 erhalten am {datum}`, "Baugenehmigung.pdf", "agent"]],
    baufreigabe: [[`${BG}/03 Baufreigabe/01 erhalten am {datum}`, "Baufreigabeschein.pdf", "agent"]],
    bauanlaufgespraech: [["11 Baubegleitung/04 Bauanlaufgespräch/02 Bauanlaufgespräch/01 Protokoll", "Protokoll_Bauanlaufgespraech.pdf"]],
    hausanschluesse_beantragt: [["11 Baubegleitung/02 Hausanschlüsse/02 Strom/01 beantragt am {datum}", "Antrag_Netzanschluss_Strom.pdf"]],
    hausaufstellung: [["11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung/05 Baustellenfotos", "Baustelle_Hausaufstellung.jpg"]],
  };
  for (const p of projects) {
    if (p.status === "storno") continue;
    for (const s of steps) {
      const date = p.steps[s.key];
      if (!date) continue;
      for (const [folder, name, source] of DOCS[s.key] ?? []) addDoc(p, folder, date, name, source ?? "upload");
    }
  }

  // ---------------------------------------------------------------- Aufgaben
  // Jede Aufgabe passt zur Phase ihres Projekts (TASK_TEMPLATES.fits); verschiedene Projekte, stabil per Seed.
  const active = projects.filter((p) => p.status === "aktiv");
  const used = new Set<string>();
  const tasks: Task[] = [];
  TASK_TEMPLATES.forEach((tpl, i) => {
    let projectId: string | null = null;
    if (tpl.fits) {
      const candidates = active.filter((p) => tpl.fits!(p) && !used.has(p.id));
      const pool = candidates.length ? candidates : active.filter((p) => tpl.fits!(p));
      if (!pool.length) return; // keine passende Phase im Datenbestand: Aufgabe entfällt
      projectId = r.pick(pool).id;
      used.add(projectId);
    }
    tasks.push({
      id: `task-${pad(i + 1)}`,
      projectId,
      title: tpl.title,
      dueOn: tpl.due == null ? null : addDays(today, tpl.due),
      assigneeId: TEAM[i % TEAM.length].id,
      status: tpl.done ? "erledigt" : "offen",
      source: "manuell",
      sourceKey: null,
      createdAt: iso(today, 14 - (i % 7), 9, 0),
      doneAt: tpl.done ? iso(today, 1, 15, 30) : null,
    });
  });

  // ---------------------------------------------------------------- Postfächer und Agent-Historie
  const mailboxes: Mailbox[] = [
    { id: "mb-1", label: "Sammelpostfach", address: "info@abm-demo.example", provider: "demo", status: "verbunden", lastCheckedAt: iso(today, 0, 7, 45), watchFolder: "Posteingang" },
    { id: "mb-2", label: "Bauanträge", address: "bauantrag@abm-demo.example", provider: "demo", status: "verbunden", lastCheckedAt: iso(today, 0, 7, 45), watchFolder: "Posteingang" },
    { id: "mb-3", label: "Projektleitung", address: "projekte@abm-demo.example", provider: "demo", status: "pausiert", lastCheckedAt: iso(today, 3, 17, 10), watchFolder: "Posteingang/ABM" },
  ];

  const { inboxItems, inboxAttachments, agentRuns, agentDocs } = buildAgentHistory(r, today, projects, mailboxes);
  for (const d of agentDocs) {
    const p = projects.find((x) => x.id === d.projectId)!;
    addDoc(p, d.folder, d.date, d.name, "agent", d.attachmentId);
    const att = inboxAttachments.find((a) => a.id === d.attachmentId)!;
    att.documentId = documents[documents.length - 1].id;
    att.folderPath = documents[documents.length - 1].folderPath;
    att.storagePath = documents[documents.length - 1].storagePath;
  }

  // ---------------------------------------------------------------- Aktivitäten
  const activities: Activity[] = [];
  let actNo = 1;
  const act = (a: Omit<Activity, "id">) => activities.push({ id: `a-${pad(actNo++, 4)}`, ...a });
  const label = (k: string) => steps.find((s) => s.key === k)?.label ?? k;
  for (const p of projects) {
    for (const [k, d] of Object.entries(p.steps)) {
      if (!d || d < addDays(today, -60)) continue;
      act({ projectId: p.id, kind: "schritt", text: `${label(k)} erledigt`, actor: r.pick(TEAM).name, at: clock(d) });
    }
  }
  for (const d of documents) {
    if ((d.receivedOn ?? "") < addDays(today, -21)) continue;
    act({ projectId: d.projectId, kind: d.source === "agent" ? "agent" : "datei", text: `${d.name} abgelegt`, actor: d.source === "agent" ? "Agent" : d.uploadedBy ?? "–", at: d.createdAt });
  }
  for (const i of invoices) {
    if (!i.sentOn || i.sentOn < addDays(today, -60)) continue;
    act({ projectId: i.projectId, kind: "rechnung", text: `Rechnung versendet: ${i.label}`, actor: "Mehmet Cetin", at: i.sentOn === today ? `${i.sentOn}T07:50:00` : `${i.sentOn}T10:15:00` });
  }
  activities.sort((a, b) => b.at.localeCompare(a.at));

  return {
    companies: COMPANIES,
    salespeople: SALESPEOPLE,
    team: TEAM,
    projects,
    invoices,
    stepDefinitions: steps,
    folderTemplates,
    parties,
    bauherren,
    documents,
    tasks,
    activities,
    mailboxes,
    inboxItems,
    inboxAttachments,
    agentRuns,
    agentRules: [
      { id: "rule-1", kind: "ignorieren", match: "@newsletter.baustoffe.example", projectId: null, folderPath: null, createdBy: "Mehmet Cetin", createdAt: iso(today, 20, 9, 0) },
      { id: "rule-2", kind: "absender_ordner", match: "eingang@lra-demo.example", projectId: null, folderPath: "08 Bauantrag/05 Eingangsbestätigung/01 Eingangsbestätigung", createdBy: "Mehmet Cetin", createdAt: iso(today, 12, 11, 0) },
    ],
    agentSettings: { autoFileThreshold: 0.9, suggestThreshold: 0.6 },
    agentFeedback: [],
    projectDrafts: [],
  };
}

// ---------------------------------------------------------------------------
// Agent-Historie der letzten 7 Tage (bereits verarbeitete Mails)
// ---------------------------------------------------------------------------

interface AgentDoc {
  projectId: string;
  folder: string;
  date: string;
  name: string;
  attachmentId: string;
}

function buildAgentHistory(r: Rng, today: string, projects: Project[], mailboxes: Mailbox[]) {
  const inboxItems: InboxItem[] = [];
  const inboxAttachments: InboxAttachment[] = [];
  const agentRuns: AgentRun[] = [];
  const agentDocs: AgentDoc[] = [];
  const active = projects.filter((p) => p.status === "aktiv" && p.abmNr && p.abmNr !== "Bauvoranfrage");

  const FILED: [string, string, string, string, string][] = [
    // Absender, Betreff-Vorlage, Datei, Ordner, Schritt, der beim Projekt erledigt sein muss
    ["Landratsamt Alb-Donau <eingang@lra-demo.example>", "Eingangsbestätigung Bauantrag {nr}", "Eingangsbestaetigung.pdf", "08 Bauantrag/05 Eingangsbestätigung/01 Eingangsbestätigung", "baugesuch_uebergabe"],
    ["Vermessungsbüro Albrecht <info@vermessung-albrecht.example>", "Lageplan {nr} {name}", "Amtlicher_Lageplan.pdf", "08 Bauantrag/04 Amtliche Lagepläne", "vermesser_beauftragt"],
    ["Stromnetz Alb-Donau <netzanschluss@strom-alb.example>", "Angebot Netzanschluss {nr}", "Angebot_Hausanschluss_Strom.pdf", "11 Baubegleitung/02 Hausanschlüsse/02 Strom/02 Angebot erhalten am {datum}", "hausanschluesse_beantragt"],
    ["Stadt Ulm Baurecht <baurecht@stadt-demo.example>", "Baugenehmigung Az. 2026-{n} – {nr}", "Baugenehmigung.pdf", `${BG}/01 Baugenehmigung/01 erhalten am {datum}`, "baugenehmigung"],
    ["Bodenlabor Süd <labor@boden-sued.example>", "Bodengutachten BV {name}, {nr}", "Baugrundgutachten.pdf", "10 Bodengutachten/Bodengutachten erhalten am {datum}", "vorabzug_versendet"],
  ];

  let itemNo = 1;
  let attNo = 1;
  let correctedOnce = false;
  const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
  // Offene Prüfungen liegen auf dem letzten Werktag (heute, wenn heute ein Werktag ist)
  let pendingDate = today;
  while (isWeekend(pendingDate)) pendingDate = addDays(pendingDate, -1);

  for (let day = 6; day >= 0; day--) {
    const date = addDays(today, -day);
    if (isWeekend(date)) continue; // am Wochenende kommt nichts
    // 3 bis 8 Anhänge je Werktag (abgelegt + Prüfung), überwiegend automatisch; dazu 0–2 Newsletter (ignoriert)
    const relevant = date === pendingDate ? r.int(1, 4) : r.int(3, 8);
    const kinds: ("auto" | "hand" | "news")[] = [];
    for (let k = 0; k < relevant; k++) kinds.push(date === pendingDate || r.next() < 0.82 ? "auto" : "hand");
    for (let k = r.int(0, 2); k > 0; k--) kinds.splice(r.int(0, kinds.length), 0, "news");
    let filed = 0;
    let review = 0;
    let ignored = 0;
    kinds.forEach((kind, k) => {
      let p = r.pick(active);
      const itemId = `in-${pad(itemNo++)}`;
      const attId = `att-${pad(attNo++)}`;
      // Heute nur frühe Uhrzeiten, damit nichts "in der Zukunft" liegt, wenn die Demo morgens geöffnet wird
      const at = day === 0 ? `${date}T06:${pad(5 + k * 5, 2)}:00` : `${date}T${pad(7 + Math.floor((k * 10) / kinds.length), 2)}:${pad(r.int(0, 59), 2)}:00`;
      const mailbox = r.pick(mailboxes.slice(0, 2));
      if (kind === "auto") {
        const [from, subj, file, folder, needs] = r.pick(FILED);
        const fitting = active.filter((x) => x.steps[needs] && x.steps[needs]! <= date);
        if (fitting.length) p = r.pick(fitting);
        const [fromName, fromEmail] = splitFrom(from);
        const subject = subj.replace("{nr}", p.abmNr!).replace("{name}", p.bauherrLabel).replace("{n}", String(r.int(100, 999)));
        const conf = 0.9 + r.int(0, 9) / 100;
        inboxItems.push({ id: itemId, mailboxId: mailbox.id, messageId: `<demo-${itemId}@abm-demo.example>`, receivedAt: at, fromName, fromEmail, subject, bodyExcerpt: `Anbei erhalten Sie die Unterlagen zu ${subject}.`, status: "abgelegt", projectId: p.id, confidence: conf, reason: `ABM-Nr. ${p.abmNr} im Betreff`, createdAt: at });
        inboxAttachments.push({ id: attId, itemId, fileName: file, mime: "application/pdf", sizeBytes: r.int(120, 2400) * 1024, storagePath: null, projectId: p.id, folderPath: folder, confidence: conf, status: "abgelegt", documentId: null, corrected: false });
        agentDocs.push({ projectId: p.id, folder, date, name: file, attachmentId: attId });
        // Genau eine automatische Ablage wurde später korrigiert (realistische Trefferquote in der Demo)
        if (!correctedOnce && day >= 2) {
          inboxAttachments[inboxAttachments.length - 1].corrected = true;
          correctedOnce = true;
        }
        filed++;
      } else if (kind === "news") {
        const [fromName, fromEmail] = splitFrom("Newsletter Baustoffe Süd <news@newsletter.baustoffe.example>");
        inboxItems.push({ id: itemId, mailboxId: mailbox.id, messageId: `<demo-${itemId}@abm-demo.example>`, receivedAt: at, fromName, fromEmail, subject: "Neuheiten im Fachhandel", bodyExcerpt: "Unsere Angebote der Woche …", status: "ignoriert", projectId: null, confidence: null, reason: "Absender auf Ignorier-Liste", createdAt: at });
        inboxAttachments.push({ id: attId, itemId, fileName: "angebote.jpg", mime: "image/jpeg", sizeBytes: 9 * 1024, storagePath: null, projectId: null, folderPath: null, confidence: null, status: "ignoriert", documentId: null, corrected: false });
        ignored++;
      } else {
        // Bereits von Hand geprüfte, früher unsichere Zuordnung
        const [fromName, fromEmail] = splitFrom(`${p.bauherrLabel} <${p.bauherrLabel.toLowerCase().replace(/[^a-z]/g, "")}@example.com>`);
        inboxItems.push({ id: itemId, mailboxId: mailbox.id, messageId: `<demo-${itemId}@abm-demo.example>`, receivedAt: at, fromName, fromEmail, subject: "Unterlagen für den Bauantrag", bodyExcerpt: "Hallo, anbei die gewünschten Unterlagen.", status: "abgelegt", projectId: p.id, confidence: 0.72, reason: "Bauherr-Nachname und Ort im Text; von Hand bestätigt", createdAt: at });
        inboxAttachments.push({ id: attId, itemId, fileName: "Unterlagen_Bauantrag.pdf", mime: "application/pdf", sizeBytes: r.int(200, 900) * 1024, storagePath: null, projectId: p.id, folderPath: "02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft/01 Überschrift {datum}", confidence: 0.72, status: "abgelegt", documentId: null, corrected: false });
        agentDocs.push({ projectId: p.id, folder: "02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft/01 Überschrift {datum}", date, name: "Unterlagen_Bauantrag.pdf", attachmentId: attId });
        review++;
      }
    });
    agentRuns.push({ id: `run-${date}`, mailboxId: "mb-1", startedAt: `${date}T07:45:00`, finishedAt: `${date}T07:45:08`, fetched: kinds.length, filed, toReview: review, ignored, errors: 0, note: null });
  }
  // Offene Prüfungen vom letzten Werktag (unsichere Zuordnungen)
  const byStep = (k: string) => active.find((x) => x.steps[k] && !x.steps.baugenehmigung) ?? active[0];
  const pA = byStep("baugesuch_uebergabe");
  const pB = byStep("vermesser_beauftragt");
  const PENDING: [string, string, string, string, string, number | null, string | null, string, string | null][] = [
    // Absender, Betreff, Auszug, Datei, MIME, Sicherheit, Ordner-Vorschlag, Begründung, Projekt
    [
      "Landratsamt Alb-Donau <baurecht@lra-demo.example>",
      `Ihr Bauantrag – Anhörung Angrenzer`,
      `Sehr geehrte Damen und Herren, zum Bauvorhaben ${pA.bauherrLabel} in ${pA.location} bitten wir um Stellungnahme …`,
      "Anhoerung_Angrenzer.pdf", "application/pdf", 0.74,
      "02 Schriftverkehr/03 Schriftverkehr mit Amt/01 Überschrift {datum}",
      `Bauherr-Nachname "${pA.bauherrLabel}" und Ort ${pA.location} im Text; Ordner nur über Absender (Amt) bestimmt`,
      pA.id,
    ],
    [
      "Vermessung Donautal <buero@vermessung-donautal.example>",
      "Unterlagen Höhenaufnahme",
      "Anbei die Höhenaufnahme wie besprochen. Mit freundlichen Grüßen",
      "Hoehenaufnahme.pdf", "application/pdf", 0.66,
      "04 Vermesser/02 Vermesserunterlagen erhalten am {datum}",
      `Absender ist Vermesser von ${pB.bauherrLabel} (einziges aktives Projekt mit diesem Vermesser), keine ABM-Nr. im Betreff`,
      pB.id,
    ],
    [
      "k.weiss@example.com <k.weiss@example.com>",
      "Fotos Grundstück",
      "Hallo, hier wie versprochen die Fotos vom Grundstück. Viele Grüße",
      "IMG_2041.jpg", "image/jpeg", null, null,
      "Unbekannter Absender, keine ABM-Nr., kein Bauherr-Name im Text: kein sicherer Vorschlag",
      null,
    ],
  ];
  PENDING.forEach(([from, subject, excerpt, file, mime, conf, folder, reason, projectId], i) => {
    const itemId = `in-${pad(itemNo++)}`;
    const at = `${pendingDate}T${pendingDate === today ? "07" : "16"}:${pad(12 + i * 14, 2)}:00`;
    const [fromName, fromEmail] = splitFrom(from);
    inboxItems.push({ id: itemId, mailboxId: "mb-1", messageId: `<demo-${itemId}@abm-demo.example>`, receivedAt: at, fromName, fromEmail, subject, bodyExcerpt: excerpt, status: "pruefen", projectId, confidence: conf, reason, createdAt: at });
    // Vorschlag wie vom Agenten: Datumsordner mit dem Maildatum
    inboxAttachments.push({ id: `att-${pad(attNo++)}`, itemId, fileName: file, mime, sizeBytes: r.int(300, 3800) * 1024, storagePath: null, projectId, folderPath: folder ? concretePath(folder, pendingDate) : null, confidence: conf, status: "pruefen", documentId: null, corrected: false });
  });
  const run = agentRuns.find((x) => x.id === `run-${pendingDate}`)!;
  run.fetched += PENDING.length;
  run.toReview += PENDING.length;

  return { inboxItems, inboxAttachments, agentRuns, agentDocs };
}

function splitFrom(from: string): [string, string] {
  const m = from.match(/^(.*?)\s*<(.+)>$/);
  return m ? [m[1], m[2]] : [from, from];
}
