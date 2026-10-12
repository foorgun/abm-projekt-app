// Smoke-Test: ruft jede Methode des supabaseRepo einmal gegen das ECHTE Projekt auf, als angemeldeter Admin
// (bzw. Mitarbeiter) aus konten.local.json, also genau so, wie die App es tut.
// Alle Testdaten heißen "Zzsmoke…" bzw. "ZZ-Smoketest …" und werden am Ende wieder entfernt.
// Braucht den Secret key (.env.server) für zwei Dinge, die ein angemeldeter Benutzer absichtlich nicht darf:
//   * Vorbereiten: eine Testmail im Posteingang und eine Testrechnung anlegen (schreibt sonst nur der Agent)
//   * Aufräumen: Testprojekt, Testfirma usw. löschen (die App kann nichts löschen)
// Aufruf: npm run check:repo
import { todayIso } from "../src/lib/format";
import { followupKey } from "../src/lib/projectForm";
import type { Repo } from "../src/lib/repo";
import type { SessionUser } from "../src/lib/session";
import { getSupabase } from "../src/lib/supabase/client";
import { BUCKET, createSupabaseRepo } from "../src/lib/supabaseRepo";
import type { Dataset } from "../src/lib/types";
import { adminClient, die, readKonten, table } from "./lib/server";

const konto = readKonten().find((k) => k.passwort && k.rolle === "admin") ?? readKonten().find((k) => k.passwort && k.rolle === "mitarbeiter");
if (!konto) die("Gebraucht wird ein Admin- oder Mitarbeiter-Konto mit Passwort in konten.local.json.");
const admin = adminClient();
const sb = getSupabase();
const login = await sb.auth.signInWithPassword({ email: konto.email, password: konto.passwort! });
if (login.error || !login.data.user) die(`Anmeldung als ${konto.email} fehlgeschlagen: ${login.error?.message}`);
const user: SessionUser = { id: login.data.user.id, name: konto.name, role: konto.rolle, email: konto.email };
const repo: Repo = createSupabaseRepo();

const run = Date.now().toString(36);
const letters = run.replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const LABEL = `Zzsmoke${letters}`; // Bauherr: nur Buchstaben erlaubt
const TAG = `ZZ-Smoketest ${run}`;
const today = todayIso();
const results: string[][] = [];
let failed = 0;
/** IDs alles Angelegten, zum Aufräumen */
const made = { projects: [] as string[], companies: [] as string[], salespeople: [] as string[], team: [] as string[], mailboxes: [] as string[], rules: [] as string[], tasks: [] as string[], files: [] as string[] };

async function step(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const note = await fn();
    results.push([name, "ok", note ?? ""]);
    return true;
  } catch (e) {
    failed++;
    results.push([name, "FEHLER", e instanceof Error ? e.message : String(e)]);
    return false;
  }
}
function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
let d: Dataset;
const reload = async () => (d = await repo.load(user));

try {
  await step("load", async () => {
    await reload();
    expect(d.stepDefinitions.length >= 12, "Schritte fehlen");
    expect(d.folderTemplates.length === 127, `Ordnervorlage hat ${d.folderTemplates.length} statt 127 Ordner`);
    return `${d.projects.length} Projekte, ${d.companies.length} Hausbaufirmen, ${d.folderTemplates.length} Ordner`;
  });

  let companyId = "";
  let salesId = "";
  let architectId = "";
  await step("createCompany", async () => {
    const c = await repo.createCompany(`${TAG} Firma`);
    made.companies.push(c.id);
    companyId = c.id;
  });
  await step("createSalesperson", async () => {
    const s = await repo.createSalesperson(companyId, `${TAG} Verkäufer`);
    made.salespeople.push(s.id);
    salesId = s.id;
  });
  await step("createTeamMember", async () => {
    const t = await repo.createTeamMember(`${TAG} Architekt`, "architekt");
    made.team.push(t.id);
    architectId = t.id;
  });
  await reload();

  let projectId = "";
  const hasProject = await step("createProject (Bauadresse fehlt → Aufgabe)", async () => {
    const p = await repo.createProject({
      kind: "neubau", bauherrLabel: LABEL, abmNr: null, hausbauNr: null, companyId, salespersonId: salesId, location: "Smoketest", architectId, planerId: null,
      intakeMonth: `${today.slice(0, 7)}-01`, vermesser: `${TAG} Vermessung`, bauherr: { phone: "0000 000000", email: null, address: null, buildingAddress: null }, createFolders: true,
    });
    made.projects.push(p.id);
    projectId = p.id;
    await reload();
    const task = d.tasks.find((t) => t.sourceKey === followupKey(p.id));
    expect(task?.status === "offen", "Aufgabe „Fehlende Angaben nachfragen“ fehlt");
    expect(task.title.endsWith("Bauadresse"), `Titel der Aufgabe unerwartet: ${task.title}`);
    expect(d.bauherren.find((b) => b.projectId === p.id)?.phone === "0000 000000", "Kontaktdaten nicht gespeichert");
    expect(d.parties.some((x) => x.projectId === p.id && x.role === "vermesser"), "Vermesser nicht gespeichert");
    return task.title;
  });
  if (!hasProject) throw new Error("Ohne Testprojekt lassen sich die übrigen Methoden nicht prüfen.");

  await step("updateProject (Bauadresse nachtragen → Aufgabe erledigt)", async () => {
    await repo.updateProject(projectId, { project: { location: "Smoketest-Ort" }, bauherr: { phone: "0000 000000", email: null, address: null, buildingAddress: "Testweg 1" } });
    await reload();
    expect(d.projects.find((p) => p.id === projectId)?.location === "Smoketest-Ort", "Bauort nicht geändert");
    expect(d.tasks.find((t) => t.sourceKey === followupKey(projectId))?.status === "erledigt", "Aufgabe hat sich nicht geschlossen");
    expect(d.activities.some((a) => a.projectId === projectId && a.text === "Projektdaten geändert: Bauort, Bauadresse"), "Protokolleintrag fehlt");
  });

  await step("setStepDate (setzen und zurücksetzen)", async () => {
    await repo.setStepDate(projectId, "plangespraech", today);
    await reload();
    expect(d.projects.find((p) => p.id === projectId)?.steps.plangespraech === today, "Datum nicht gesetzt");
    await repo.setStepDate(projectId, "plangespraech", null);
    await reload();
    expect(!d.projects.find((p) => p.id === projectId)?.steps.plangespraech, "Datum nicht zurückgesetzt");
  });

  await step("setProjectStatus", async () => {
    await repo.setProjectStatus(projectId, "abgeschlossen");
    await reload();
    expect(d.projects.find((p) => p.id === projectId)?.status === "abgeschlossen", "Status nicht geändert");
    await repo.setProjectStatus(projectId, "aktiv");
  });

  await step("markInvoiceSent", async () => {
    const inv = await admin.from("invoices").insert({ project_id: projectId, label: `${TAG} Rechnung`, amount_cents: 100, status: "faellig", due_on: today }).select("id").single();
    if (inv.error) throw new Error(`Testrechnung: ${inv.error.message}`);
    await repo.markInvoiceSent(inv.data.id, today);
    await reload();
    const got = d.invoices.find((i) => i.id === inv.data.id);
    expect(got?.status === "versendet" && got.sentOn === today, "Rechnung nicht als versendet gespeichert");
  });

  let docId = "";
  await step("uploadDocument", async () => {
    const blob = new Blob(["Smoketest der ABM Projekt-App. Diese Datei wird wieder gelöscht."], { type: "application/pdf" });
    const doc = await repo.uploadDocument({ projectId, folderPath: "05 Entwurf/01 Entwurf 1 Pläne", file: { name: "Smoketest äöü.pdf", size: blob.size, type: blob.type }, blob });
    made.files.push(doc.storagePath);
    docId = doc.id;
    return doc.storagePath.split("/").pop();
  });
  await step("documentUrl (Datei lässt sich öffnen)", async () => {
    await reload();
    const doc = d.documents.find((x) => x.id === docId);
    expect(doc, "Dokument nicht in den geladenen Daten");
    const url = await repo.documentUrl!(doc);
    const res = await fetch(url);
    expect(res.ok, `Link liefert HTTP ${res.status}`);
    expect((await res.text()).startsWith("Smoketest"), "Inhalt der Datei stimmt nicht");
  });
  await step("listDocuments", async () => {
    const res = await repo.listDocuments({ projectId, q: "Smoketest" });
    expect(res.total === 1 && res.rows[0].doc.id === docId, `erwartet 1 Treffer, erhalten ${res.total}`);
    expect(res.rows[0].doc.uploadedBy, "„abgelegt von“ ist leer (Name des Kontos fehlt in user_roles?)");
  });

  let taskId = "";
  await step("createTask", async () => {
    const t = await repo.createTask({ title: `${TAG} Aufgabe`, projectId, dueOn: today, assigneeId: architectId });
    made.tasks.push(t.id);
    taskId = t.id;
    const again = await repo.createTask({ title: `${TAG} Warnung`, projectId, dueOn: today, assigneeId: null, source: "warnung", sourceKey: `smoketest:${run}` });
    const dup = await repo.createTask({ title: `${TAG} Warnung doppelt`, projectId, dueOn: today, assigneeId: null, source: "warnung", sourceKey: `smoketest:${run}` });
    made.tasks.push(again.id);
    expect(again.id === dup.id, "Aufgabe mit gleichem Schlüssel wurde doppelt angelegt");
  });
  await step("updateTask", async () => {
    const t = await repo.updateTask(taskId, { status: "erledigt" });
    expect(t.status === "erledigt" && t.doneAt, "Aufgabe nicht erledigt");
  });

  let mailboxId = "";
  await step("saveMailbox", async () => {
    const m = await repo.saveMailbox({ label: `${TAG} Postfach`, address: `smoke-${run}@abm-smoketest.example`, provider: "imap", watchFolder: "Posteingang" });
    made.mailboxes.push(m.id);
    mailboxId = m.id;
    expect(m.status === "pausiert", "neues Postfach sollte pausiert starten");
  });
  await step("setMailboxStatus", async () => {
    await repo.setMailboxStatus(mailboxId, "verbunden");
    await repo.setMailboxStatus(mailboxId, "pausiert");
  });

  await step("saveAgentRule / removeAgentRule", async () => {
    const r = await repo.saveAgentRule({ kind: "ignorieren", match: `@smoke-${run}.example`, projectId: null, folderPath: null });
    made.rules.push(r.id);
    await repo.removeAgentRule(r.id);
    await reload();
    expect(!d.agentRules.some((x) => x.id === r.id), "Regel nicht gelöscht");
  });

  await step("saveAgentSettings", async () => {
    // dieselben Werte zurückschreiben: prüft den Weg, ändert nichts
    if (user.role === "admin") {
      await repo.saveAgentSettings(d.agentSettings);
      return "als Admin gespeichert (Werte unverändert)";
    }
    try {
      await repo.saveAgentSettings(d.agentSettings);
    } catch {
      return "als Mitarbeiter abgelehnt (richtig: nur Admin)";
    }
    throw new Error("Mitarbeiter durfte die Schwellen ändern");
  });

  // Prüfliste: eine Testmail mit zwei Anhängen (legt sonst nur der Agent an)
  const att: string[] = [];
  await step("Vorbereitung: Testmail im Posteingang", async () => {
    const item = await admin.from("inbox_items").insert({ mailbox_id: mailboxId, message_id: `<smoke-${run}@abm-smoketest.example>`, received_at: new Date().toISOString(), from_name: "Smoketest", from_email: `absender@smoke-${run}.example`, subject: `${TAG} Mail`, status: "pruefen", project_id: projectId, confidence: 0.7, reason: "Smoketest" }).select("id").single();
    if (item.error) throw new Error(item.error.message);
    const rows = ["a.pdf", "b.pdf"].map((file_name) => ({ item_id: item.data.id, file_name, mime: "application/pdf", size_bytes: 10, project_id: projectId, folder_path: "03 Hausbaufirma", confidence: 0.7, status: "pruefen" }));
    const a = await admin.from("inbox_attachments").insert(rows).select("id");
    if (a.error) throw new Error(a.error.message);
    att.push(...a.data.map((x) => x.id));
    await reload();
  });
  await step("resolveReview (bestätigen, mit Regel)", async () => {
    await repo.resolveReview(att[0], { action: "bestaetigen", rememberRule: "absender_projekt" });
    await reload();
    const a = d.inboxAttachments.find((x) => x.id === att[0]);
    expect(a?.status === "abgelegt" && a.documentId, "Anhang nicht abgelegt");
    expect(d.documents.some((x) => x.id === a.documentId && x.source === "agent"), "Dokument fehlt");
    const rule = d.agentRules.find((r) => r.match === `absender@smoke-${run}.example`);
    expect(rule, "Regel nicht gemerkt");
    made.rules.push(rule.id);
  });
  await step("reportWrongFiling", async () => {
    await repo.reportWrongFiling(att[0]);
    await reload();
    const a = d.inboxAttachments.find((x) => x.id === att[0]);
    expect(a?.status === "pruefen" && a.corrected, "Anhang nicht zurück in der Prüfliste");
  });
  await step("resolveReview (ändern)", async () => {
    await repo.resolveReview(att[0], { action: "aendern", projectId, folderPath: "06 Technische Prüfung" });
    await reload();
    const docs = d.documents.filter((x) => x.sourceItemId === att[0]);
    expect(docs.length === 1 && docs[0].folderPath === "06 Technische Prüfung", "Dokument nicht verschoben oder doppelt");
  });
  await step("resolveReview (ignorieren)", async () => {
    await repo.resolveReview(att[1], { action: "ignorieren" });
    await reload();
    expect(d.inboxAttachments.find((x) => x.id === att[1])?.status === "ignoriert", "Anhang nicht ignoriert");
    expect(d.inboxItems.find((i) => i.subject === `${TAG} Mail`)?.status === "abgelegt", "Status der Mail stimmt nicht");
  });

  await step("runAgent (im Pilotbetrieb gesperrt)", async () => {
    try {
      await repo.runAgent();
    } catch (e) {
      if (e instanceof Error && e.message.includes("noch nicht angeschlossen")) return "meldet wie erwartet: noch nicht angeschlossen";
      throw e;
    }
    throw new Error("runAgent hätte ablehnen müssen");
  });
} catch (e) {
  failed++;
  results.push(["Abbruch", "FEHLER", e instanceof Error ? e.message : String(e)]);
} finally {
  // ---- Aufräumen (immer, auch nach einem Fehler). Nur Zeilen, die dieser Lauf angelegt hat.
  const problems: string[] = [];
  const del = async (name: string, q: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await q;
    if (error) problems.push(`${name}: ${error.message}`);
  };
  if (made.files.length) await del("Dateien", admin.storage.from(BUCKET).remove(made.files));
  const bauherren = made.projects.length ? ((await admin.from("projects").select("bauherr_id").in("id", made.projects)).data ?? []).map((p) => p.bauherr_id).filter(Boolean) : [];
  if (made.mailboxes.length) await del("Postfächer", admin.from("mailboxes").delete().in("id", made.mailboxes)); // nimmt Mail, Anhänge, Lernbeispiele mit
  if (made.projects.length) await del("Projekte", admin.from("projects").delete().in("id", made.projects)); // nimmt Schritte, Rechnung, Dokumente, Aufgaben, Aktivitäten, Beteiligte mit
  if (bauherren.length) await del("Bauherren", admin.from("bauherren").delete().in("id", bauherren));
  if (made.tasks.length) await del("Aufgaben", admin.from("tasks").delete().in("id", made.tasks));
  if (made.rules.length) await del("Regeln", admin.from("agent_rules").delete().in("id", made.rules));
  if (made.salespeople.length) await del("Verkäufer", admin.from("salespeople").delete().in("id", made.salespeople));
  if (made.team.length) await del("Team", admin.from("team_members").delete().in("id", made.team));
  if (made.companies.length) await del("Hausbaufirmen", admin.from("companies").delete().in("id", made.companies));

  // Nachzählen: bleibt irgendwo etwas mit dem Testnamen?
  const left: string[] = [];
  const leftover = async (t: string, col: string, pattern: string) => {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true }).ilike(col, pattern);
    if (count) left.push(`${t}: ${count}`);
  };
  await leftover("projects", "bauherr_label", `${LABEL}%`);
  await leftover("bauherren", "name", `${LABEL}%`);
  for (const [t, col] of [["companies", "name"], ["salespeople", "name"], ["team_members", "name"], ["tasks", "title"], ["mailboxes", "label"], ["inbox_items", "subject"], ["activities", "text"], ["invoices", "label"]] as const) await leftover(t, col, `%${TAG}%`);
  await leftover("agent_rules", "match", `%smoke-${run}%`);
  await leftover("documents", "name", "Smoketest%");
  results.push(["Aufräumen", problems.length || left.length ? "FEHLER" : "ok", problems.length || left.length ? [...problems, ...left.map((l) => `übrig in ${l}`)].join("; ") : "alle Testdaten entfernt, nichts übrig"]);
  if (problems.length || left.length) failed++;
  await sb.auth.signOut();
}

console.log(`Angemeldet als ${konto.rolle}. Testdaten dieses Laufs: „${LABEL}“ / „${TAG}“\n`);
console.log(table(["Methode", "Ergebnis", "Hinweis"], results));
console.log(failed ? `\n${failed} Schritt(e) FEHLGESCHLAGEN.` : `\nAlle ${results.length} Schritte bestanden.`);
process.exit(failed ? 1 : 0);
