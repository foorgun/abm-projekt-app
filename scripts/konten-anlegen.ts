// Legt die Testkonten aus konten.local.json an und weist Rollen zu. Braucht den Secret key (.env.server).
//   * Gibt es ein Konto schon, bleibt sein Passwort unberührt; nur Rolle und Name werden gesetzt.
//   * Neue Konten bekommen ein zufälliges Passwort. Es wird NICHT angezeigt, sondern nur in konten.local.json
//     geschrieben (lokal, nicht eingecheckt), damit check:roles sich anmelden kann.
//   * Admins und Mitarbeiter bekommen den Urlaubsanspruch für das laufende Jahr (30 Tage), falls noch keiner eingetragen ist.
//   * Dem Freiberufler werden genau drei Projekte zugewiesen (Demo-Projekte; vorher npm run seed:demo).
// Aufruf: npm run konten:anlegen
import { randomBytes } from "node:crypto";
import { adminClient, die, KONTEN_DATEI, readKonten, table, writeKonten } from "./lib/server";

const FREELANCER_PROJECTS = 3;
const konten = readKonten();
const sb = adminClient();

const users = new Map<string, string>();
for (let page = 1; ; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) die(`Konten konnten nicht gelesen werden: ${error.message}`);
  for (const u of data.users) if (u.email) users.set(u.email.toLowerCase(), u.id);
  if (data.users.length < 200) break;
}

const report: string[][] = [];
for (const k of konten) {
  const email = k.email.trim().toLowerCase();
  let id = users.get(email);
  let konto = "vorhanden, Passwort unverändert";
  if (!id) {
    const passwort = randomBytes(18).toString("base64url");
    const { data, error } = await sb.auth.admin.createUser({ email, password: passwort, email_confirm: true });
    if (error || !data.user) die(`Konto ${email} konnte nicht angelegt werden: ${error?.message}`);
    id = data.user.id;
    k.passwort = passwort;
    konto = `neu, Passwort steht in ${KONTEN_DATEI}`;
  }
  const role = await sb.from("user_roles").upsert({ user_id: id, role: k.rolle, full_name: k.name.trim() }, { onConflict: "user_id" });
  if (role.error) die(`Rolle für ${email} konnte nicht gesetzt werden: ${role.error.message}`);

  // Urlaubsanspruch für das laufende Jahr (Standard 30 Tage aus der Tabelle). Ein vorhandener Eintrag bleibt unverändert.
  let urlaub = "–";
  if (k.rolle === "admin" || k.rolle === "mitarbeiter") {
    const jahr = new Date().getFullYear();
    const ins = await sb.from("urlaubs_anspruch").upsert({ user_id: id, jahr }, { onConflict: "user_id,jahr", ignoreDuplicates: true });
    if (ins.error) die(`Urlaubsanspruch für ${email} konnte nicht angelegt werden: ${ins.error.message}\nIst die Migration 0012 angewendet?`);
    const cur = await sb.from("urlaubs_anspruch").select("tage").eq("user_id", id).eq("jahr", jahr).maybeSingle();
    urlaub = cur.data ? `${Number(cur.data.tage)} Tage (${jahr})` : `angelegt (${jahr})`;
  }

  let projekte = "alle (über die Rolle)";
  if (k.rolle === "freiberufler") {
    const mine = await sb.from("project_members").select("project_id").eq("user_id", id);
    if (mine.error) die(mine.error.message);
    if ((mine.data ?? []).length === FREELANCER_PROJECTS) projekte = `${FREELANCER_PROJECTS} zugewiesen (unverändert)`;
    else {
      const pick = await sb.from("projects").select("id, abm_nr, bauherr_label").eq("is_demo", true).eq("status", "aktiv").order("abm_nr").limit(FREELANCER_PROJECTS);
      if (pick.error) die(pick.error.message);
      if ((pick.data ?? []).length < FREELANCER_PROJECTS) projekte = "KEINE: zu wenige Demo-Projekte, erst npm run seed:demo, dann dieses Skript noch einmal";
      else {
        const del = await sb.from("project_members").delete().eq("user_id", id);
        if (del.error) die(del.error.message);
        const ins = await sb.from("project_members").insert(pick.data!.map((p) => ({ project_id: p.id, user_id: id })));
        if (ins.error) die(ins.error.message);
        projekte = pick.data!.map((p) => `${p.abm_nr ?? "ohne Nr."} ${p.bauherr_label}`).join(", ");
      }
    }
  }
  report.push([email, k.name, k.rolle, konto, urlaub, projekte]);
}
writeKonten(konten);
console.log(table(["E-Mail", "Name", "Rolle", "Konto", "Urlaubsanspruch", "Projekte"], report));
console.log(`\nPasswörter neuer Konten stehen nur in ${KONTEN_DATEI}. Bitte den Personen auf sicherem Weg geben und danach im Dashboard ändern lassen.`);
