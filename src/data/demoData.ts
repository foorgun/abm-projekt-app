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
  "Bühler", "Frank", "Lutz", "Mayer", "Reiß",
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
  { stage: 8, lastAgo: 56, name: "Beispiel", town: "Ulm", companyId: "c-bz", planerId: "t-sk" },
  // 1: Vertrag seit 26 Tagen draußen, nicht zurück → Hinweis
  { stage: 2, lastAgo: 26, name: "Muster", town: "Neu-Ulm", companyId: "c-lh" },
  // 2: Baugesuch vor 131 Tagen übergeben, Genehmigung fehlt → Info
  { stage: 7, lastAgo: 131, name: "Probst", town: "Ehningen", companyId: "c-sh", planerId: "t-sk" },
  // 3: Bauvoranfrage
  { stage: 3, lastAgo: 9, name: "Winter", town: "Ulm", kind: "bauvoranfrage", companyId: null },
  // 4: Storno
  { stage: 1, lastAgo: 160, name: "Storno-Beispiel", town: "Tübingen", status: "storno", companyId: "c-bz" },
  // 5: Schritt übersprungen: Vertrag zurück fehlt, obwohl Vermesser schon beauftragt
  { stage: 4, lastAgo: 4, skip: ["vertrag_zurueck"], name: "Hartmann", town: "Langenau", companyId: "c-bz", planerId: "t-sk" },
  // 6: Genehmigung vor 3 Tagen, geplante Rechnung wird fällig → Hinweis
  { stage: 8, lastAgo: 3, name: "Kessler", town: "Erbach", companyId: "c-lh" },
  // 7: zweite dringende Rechnung (kleiner, kürzer überfällig)
  { stage: 9, lastAgo: 30, name: "Lorenz", town: "Senden", companyId: "c-sh" },
  // 8, 9: abgeschlossen
  { stage: 12, lastAgo: 38, status: "abgeschlossen", name: "Brandner", town: "Blaustein", companyId: "c-bz" },
  { stage: 12, lastAgo: 96, status: "abgeschlossen", name: "Gruber", town: "Laupheim", companyId: "c-lh" },
];

const RANDOM_COUNT = 34;

function pad(n: number, w = 3) {
  return String(n).padStart(w, "0");
}

function iso(today: string, ago: number, hour: number, minute: number) {
  return `${addDays(today, -ago)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function buildDemoDataset(today: string, seed = DEMO_SEED): Dataset {
  const r = rng(seed);
  const steps = allStepDefinitions();
  const folderTemplates = buildFolderTemplates();

  // ---------------------------------------------------------------- Projekte
  const specs: ProjectSpec[] = [...SPECIAL];
  for (let i = 0; i < RANDOM_COUNT; i++) {
    const roll = r.next();
    // Verteilung: viele in frühen und mittleren Phasen, einige abgeschlossen
    const stage = roll < 0.12 ? 0 : roll < 0.22 ? 1 : roll < 0.62 ? r.int(3, 7) : roll < 0.84 ? r.int(8, 11) : 12;
    // Kein Zufallsprojekt soll unbeabsichtigt Warnungen erzeugen: Wartezeiten unter den Schwellen halten
    const maxAgo = stage === 2 ? 12 : stage === 7 ? 80 : 40;
    specs.push({
      stage,
      lastAgo: r.int(1, maxAgo),
      status: stage === 12 && r.chance(0.8) ? "abgeschlossen" : r.chance(0.04) ? "storno" : "aktiv",
      kind: r.chance(0.05) ? "bauvoranfrage" : "neubau",
    });
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

    // Schrittdaten rückwärts vom letzten erledigten Schritt
    const done = steps.slice(0, spec.stage);
    const dates: Record<string, string> = {};
    let cursor = -spec.lastAgo;
    for (let i = done.length - 1; i >= 0; i--) {
      const key = done[i].key;
      dates[key] = addDays(today, cursor);
      const gap = GAPS[key] ?? 10;
      cursor -= Math.max(1, Math.round(gap * (0.7 + r.next() * 0.6)));
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
      status: spec.status ?? "aktiv",
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

  projects.forEach((p, idx) => {
    if (p.kind === "bauvoranfrage") {
      if (p.steps.vertrag_zurueck) inv(p, "Bauvoranfrage pauschal", 1800, "vertrag_zurueck", "versendet", addDays(p.steps.vertrag_zurueck, 14), addDays(p.steps.vertrag_zurueck, 5), null);
      return;
    }
    const back = p.steps.vertrag_zurueck;
    if (back) inv(p, "Abschlag Vorplanung", 3500, "vertrag_zurueck", "bezahlt", addDays(back, 14), addDays(back, 3), addDays(back, 17));
    else if (p.status === "aktiv" && p.steps.vertrag_versendet) inv(p, "Abschlag Vorplanung", 3500, "vertrag_zurueck", "geplant", null, null, null);

    const permit = p.steps.baugenehmigung;
    if (idx === 0) {
      // Der Fall aus dem Büroalltag: Genehmigung erteilt, Rechnung nie verschickt
      inv(p, "Abschlag Genehmigungsplanung", 10000, "baugenehmigung", "faellig", addDays(today, -42), null, null);
    } else if (idx === 6) {
      inv(p, "Abschlag Genehmigungsplanung", 8500, "baugenehmigung", "geplant", null, null, null);
    } else if (permit) {
      const sent = addDays(permit, r.int(2, 9));
      const paid = r.chance(0.7) ? addDays(sent, r.int(10, 25)) : null;
      inv(p, "Abschlag Genehmigungsplanung", r.pick([8500, 9500, 10000, 12000]), "baugenehmigung", paid && paid <= today ? "bezahlt" : "versendet", addDays(permit, 14), sent, paid && paid <= today ? paid : null);
    } else if (p.status === "aktiv") {
      inv(p, "Abschlag Genehmigungsplanung", r.pick([8500, 9500, 10000]), "baugenehmigung", "geplant", null, null, null);
    }

    if (idx === 7) {
      inv(p, "Abschlag Baubegleitung", 2400, "baufreigabe", "faellig", addDays(today, -12), null, null);
    } else if (p.steps.hausaufstellung) {
      inv(p, "Schlussrechnung", r.pick([2500, 3200, 4000]), "hausaufstellung", "bezahlt", addDays(p.steps.hausaufstellung, 14), addDays(p.steps.hausaufstellung, 4), addDays(p.steps.hausaufstellung, 20));
    } else if (p.status === "aktiv" && p.steps.baufreigabe) {
      inv(p, "Schlussrechnung", r.pick([2500, 3200]), "hausaufstellung", "geplant", null, null, null);
    }
  });
  // Bezahlt nie in der Zukunft
  for (const i of invoices) {
    if (i.paidOn && i.paidOn > today) {
      i.paidOn = null;
      i.status = "versendet";
    }
    if (i.sentOn && i.sentOn > today) {
      i.sentOn = null;
      i.status = "geplant";
    }
  }

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
      createdAt: `${date}T${pad(r.int(8, 17), 2)}:${pad(r.int(0, 59), 2)}:00`,
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
  const active = projects.filter((p) => p.status === "aktiv");
  const TASKS: [string, number | null, number | null, boolean][] = [
    // Titel, fällig in Tagen (negativ = überfällig), Projekt-Index in `active`, erledigt
    ["Vorabzug an Bauherrschaft senden", -3, 2, false],
    ["Rückfrage Landratsamt zu Stellplätzen beantworten", -1, 1, false],
    ["Unterschriften Bauantragspläne einholen", -6, 5, false],
    ["Bauanlaufgespräch terminieren", 0, 8, false],
    ["Wohnflächenberechnung prüfen", 0, 10, false],
    ["Entwässerungsantrag vorbereiten", 2, 11, false],
    ["Statik beim Tragwerksplaner anfragen", 3, 12, false],
    ["Hausanschlüsse Strom und Wasser beantragen", 4, 13, false],
    ["Amtlichen Lageplan beim Vermesser bestellen", 6, 14, false],
    ["Baustellentermin mit Kellerbaufirma abstimmen", 12, 15, false],
    ["Preisspiegel Erdarbeiten erstellen", 18, 16, false],
    ["Team-Besprechung Projektliste", 5, null, false],
    ["Eingangsbestätigung ablegen", -8, 3, true],
    ["Entwurf 2 an Verkäufer senden", -4, 6, true],
    ["Geländeprofile anfordern", -2, 9, true],
  ];
  const tasks: Task[] = TASKS.map(([title, due, pIdx, done], i) => ({
    id: `task-${pad(i + 1)}`,
    projectId: pIdx == null ? null : active[pIdx % active.length].id,
    title,
    dueOn: due == null ? null : addDays(today, due),
    assigneeId: TEAM[i % TEAM.length].id,
    status: done ? "erledigt" : "offen",
    source: "manuell",
    sourceKey: null,
    createdAt: iso(today, 14 - (i % 7), 9, 0),
    doneAt: done ? iso(today, 1, 15, 30) : null,
  }));

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
      act({ projectId: p.id, kind: "schritt", text: `${label(k)} erledigt`, actor: r.pick(TEAM).name, at: `${d}T${pad(r.int(8, 17), 2)}:${pad(r.int(0, 59), 2)}:00` });
    }
  }
  for (const d of documents) {
    if ((d.receivedOn ?? "") < addDays(today, -21)) continue;
    act({ projectId: d.projectId, kind: d.source === "agent" ? "agent" : "datei", text: `${d.name} abgelegt`, actor: d.source === "agent" ? "Agent" : d.uploadedBy ?? "–", at: d.createdAt });
  }
  for (const i of invoices) {
    if (!i.sentOn || i.sentOn < addDays(today, -60)) continue;
    act({ projectId: i.projectId, kind: "rechnung", text: `Rechnung versendet: ${i.label}`, actor: "Mehmet Cetin", at: `${i.sentOn}T10:15:00` });
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
  for (let day = 6; day >= 0; day--) {
    const date = addDays(today, -day);
    const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
    const count = weekend ? r.int(0, 1) : r.int(2, 5);
    let filed = 0;
    let review = 0;
    let ignored = 0;
    for (let k = 0; k < count; k++) {
      let p = r.pick(active);
      const roll = r.next();
      const itemId = `in-${pad(itemNo++)}`;
      const attId = `att-${pad(attNo++)}`;
      const at = `${date}T${pad(r.int(7, 17), 2)}:${pad(r.int(0, 59), 2)}:00`;
      const mailbox = r.pick(mailboxes.slice(0, 2));
      if (roll < 0.62) {
        const [from, subj, file, folder, needs] = r.pick(FILED);
        const fitting = active.filter((x) => x.steps[needs] && x.steps[needs]! <= date);
        if (fitting.length) p = r.pick(fitting);
        const [fromName, fromEmail] = splitFrom(from);
        const subject = subj.replace("{nr}", p.abmNr!).replace("{name}", p.bauherrLabel).replace("{n}", String(r.int(100, 999)));
        const conf = 0.9 + r.int(0, 9) / 100;
        inboxItems.push({ id: itemId, mailboxId: mailbox.id, messageId: `<demo-${itemId}@abm-demo.example>`, receivedAt: at, fromName, fromEmail, subject, bodyExcerpt: `Anbei erhalten Sie die Unterlagen zu ${subject}.`, status: "abgelegt", projectId: p.id, confidence: conf, reason: `ABM-Nr. ${p.abmNr} im Betreff`, createdAt: at });
        inboxAttachments.push({ id: attId, itemId, fileName: file, mime: "application/pdf", sizeBytes: r.int(120, 2400) * 1024, storagePath: null, projectId: p.id, folderPath: folder, confidence: conf, status: "abgelegt", documentId: null, corrected: r.chance(0.06) });
        agentDocs.push({ projectId: p.id, folder, date, name: file, attachmentId: attId });
        filed++;
      } else if (roll < 0.85) {
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
    }
    if (count > 0) {
      agentRuns.push({ id: `run-${date}`, mailboxId: "mb-1", startedAt: `${date}T07:45:00`, finishedAt: `${date}T07:45:08`, fetched: count, filed, toReview: review, ignored, errors: 0, note: null });
    }
  }
  // Offene Prüfungen von heute (unsichere Zuordnungen)
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
    const at = `${today}T${pad(7 + i, 2)}:${pad(12 + i * 9, 2)}:00`;
    const [fromName, fromEmail] = splitFrom(from);
    inboxItems.push({ id: itemId, mailboxId: "mb-1", messageId: `<demo-${itemId}@abm-demo.example>`, receivedAt: at, fromName, fromEmail, subject, bodyExcerpt: excerpt, status: "pruefen", projectId, confidence: conf, reason, createdAt: at });
    inboxAttachments.push({ id: `att-${pad(attNo++)}`, itemId, fileName: file, mime, sizeBytes: r.int(300, 3800) * 1024, storagePath: null, projectId, folderPath: folder, confidence: conf, status: "pruefen", documentId: null, corrected: false });
  });
  const run = agentRuns.find((x) => x.id === `run-${today}`);
  if (run) {
    run.fetched += PENDING.length;
    run.toReview += PENDING.length;
  } else {
    agentRuns.push({ id: `run-${today}`, mailboxId: "mb-1", startedAt: `${today}T07:45:00`, finishedAt: `${today}T07:45:06`, fetched: PENDING.length, filed: 0, toReview: PENDING.length, ignored: 0, errors: 0, note: null });
  }

  return { inboxItems, inboxAttachments, agentRuns, agentDocs };
}

function splitFrom(from: string): [string, string] {
  const m = from.match(/^(.*?)\s*<(.+)>$/);
  return m ? [m[1], m[2]] : [from, from];
}
