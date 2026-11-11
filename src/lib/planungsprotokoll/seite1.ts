// „Seite 1 ausfüllen“ (Absprache ABM 11.11.2026: ein Knopf, alles automatisch). Startet die drei Suchen zugleich:
//   * Standortangaben (amtliche Daten): Gemeinde aus dem Anschriftenverzeichnis, dazu die vorgewählten Standortwerte,
//   * Behörden und Versorger (KI-Websuche): Bauamt, Wasser, Abwasser, Strom,
//   * Schornsteinfeger (Fegersuche BW).
// Eingetragen wird nur in leere Rollen; was schon im Projekt steht, bleibt unverändert. Unsichere Treffer („niedrig“ bei
// den Versorgern, mehrere Kehrbezirke beim Schornsteinfeger) werden nicht übernommen, sondern als offen gemeldet.
// Die Funktion speichert nichts; das macht der Aufrufer mit dem Ergebnis (ein Speichervorgang).

import type { PartyInput, Repo } from "../repo";
import type { Dataset, PartyRole, StandortWert } from "../types";
import { protokollDaten } from "./daten";
import { bauadresseFuerSuche, kontaktAusDetails } from "./schornsteinfeger";
import { gemeindeAusVerwaltung, uebernahme, zeilenAus } from "./standort";
import { kontaktAusVorschlag, ROLLE_TEXT, VERSORGER_ROLLEN, versorgerAnfrage } from "./versorger";

export interface Seite1Ergebnis {
  /** Neue Beteiligte je Rolle (nur bisher leere Rollen) */
  parties: Partial<Record<PartyRole, PartyInput>>;
  /** Standortangaben zum Speichern; null: nichts Neues (schon übernommen oder nicht ermittelt) */
  standort: Record<string, StandortWert> | null;
  /** Was eingetragen wird, lesbar („Gemeinde: Stadt Ulm“) */
  eingetragen: string[];
  /** Was offen bleibt, mit Grund */
  offen: string[];
}

const LABEL: Partial<Record<PartyRole, string>> = { gemeinde: "Gemeinde", schornsteinfeger: "Schornsteinfeger", ...ROLLE_TEXT };

/** Leere Zeichenketten als null (nichts in die Datenbank, was nur leer ist). */
const ohneLeer = (k: { name: string } & Record<string, string>): PartyInput => {
  const out: Record<string, string | null> = {};
  for (const [key, v] of Object.entries(k)) out[key] = v.trim() ? v.trim() : null;
  return { ...out, name: k.name.trim() } as PartyInput;
};

const meldung = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function seite1Ermitteln(repo: Repo, data: Dataset, projectId: string): Promise<Seite1Ergebnis> {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Projekt nicht gefunden");
  const contact = data.bauherren.find((b) => b.projectId === projectId) ?? null;
  const leer = (r: PartyRole) => !data.parties.some((p) => p.projectId === projectId && p.role === r && p.name.trim());
  const ergebnis: Seite1Ergebnis = { parties: {}, standort: null, eingetragen: [], offen: [] };
  const eintragen = (r: PartyRole, k: PartyInput) => {
    ergebnis.parties[r] = k;
    ergebnis.eingetragen.push(`${LABEL[r] ?? r}: ${k.name}`);
  };
  const offen = (r: PartyRole, grund: string) => ergebnis.offen.push(`${LABEL[r] ?? r}: ${grund}`);

  // --- Standortangaben und Gemeinde ---------------------------------------------------------------------
  async function standort() {
    const bisher = data.standortAngaben.find((x) => x.projectId === projectId)?.angaben ?? {};
    const mitGemeinde = leer("gemeinde");
    if (!mitGemeinde && Object.keys(bisher).length) return;
    try {
      const res = await repo.standortAnalyse(projectId);
      if (!res.ok) {
        if (mitGemeinde) offen("gemeinde", [res.message, ...(res.fehlt ?? [])].join(" "));
        return;
      }
      if (mitGemeinde) {
        if (res.verwaltung) eintragen("gemeinde", gemeindeAusVerwaltung(res.verwaltung, undefined));
        else offen("gemeinde", "im Anschriftenverzeichnis nicht gefunden, bitte von Hand eintragen.");
      }
      // Nur, solange noch nichts übernommen ist; vorgewählt sind nur sichere Werte (wie „Alle übernehmen“ im Kasten)
      if (!Object.keys(bisher).length) {
        const neu = uebernahme(res.ergebnisse, zeilenAus(res.ergebnisse), {});
        if (Object.keys(neu).length) {
          ergebnis.standort = neu;
          ergebnis.eingetragen.push(`Standortangaben: ${Object.keys(neu).length} ${Object.keys(neu).length === 1 ? "Wert" : "Werte"}`);
        }
      }
    } catch (e) {
      if (mitGemeinde) offen("gemeinde", meldung(e));
    }
  }

  // --- Bauamt, Wasser, Abwasser, Strom ------------------------------------------------------------------
  async function versorger() {
    const rollen = VERSORGER_ROLLEN.filter(leer);
    if (!rollen.length) return;
    const { anfrage, fehlt } = versorgerAnfrage(protokollDaten(data, projectId).bauort);
    if (!anfrage) return rollen.forEach((r) => offen(r, fehlt ?? "Bauort unvollständig."));
    try {
      const res = await repo.versorgerSuchen(anfrage);
      if (!res.ok) return rollen.forEach((r) => offen(r, res.message));
      for (const r of rollen) {
        const v = res.vorschlaege[r];
        if (!v) offen(r, "nicht gefunden, bitte von Hand eintragen.");
        else if (v.sicherheit === "niedrig") offen(r, `unsicherer Treffer („${v.name}“), bitte unten mit „Behörden und Versorger ermitteln“ prüfen.`);
        else eintragen(r, ohneLeer(kontaktAusVorschlag(v)));
      }
    } catch (e) {
      rollen.forEach((r) => offen(r, meldung(e)));
    }
  }

  // --- Schornsteinfeger ---------------------------------------------------------------------------------
  async function schornsteinfeger() {
    if (!leer("schornsteinfeger")) return;
    const { anfrage, fehlt } = bauadresseFuerSuche({ siteStreet: contact?.siteStreet, sitePostalCode: contact?.sitePostalCode, buildingAddress: contact?.buildingAddress, location: project!.location });
    if (!anfrage) return offen("schornsteinfeger", fehlt.map((f) => f.text).join(" "));
    try {
      const res = await repo.schornsteinfegerSuchen(anfrage);
      if (!res.ok) return offen("schornsteinfeger", res.message);
      if (res.status !== "eindeutig") return offen("schornsteinfeger", res.meldung ?? "kein eindeutiger Kehrbezirk, bitte unten beim Schornsteinfeger auswählen.");
      const k = res.kandidaten[0];
      const d = await repo.schornsteinfegerDetails(k.bsmId);
      eintragen("schornsteinfeger", d.ok ? ohneLeer(kontaktAusDetails(d.details)) : { name: k.name });
    } catch (e) {
      offen("schornsteinfeger", meldung(e));
    }
  }

  await Promise.all([standort(), versorger(), schornsteinfeger()]);
  return ergebnis;
}

/** Ist im Ergebnis etwas zu speichern? */
export const seite1Neu = (e: Seite1Ergebnis) => Object.keys(e.parties).length > 0 || !!e.standort;
