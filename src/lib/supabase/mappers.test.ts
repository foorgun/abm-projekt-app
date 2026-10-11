import { describe, expect, it } from "vitest";
import { COLS, dbErrorMessage, groupSteps, localStamp, storageSafeName, toBauherrContacts, toDocument, toInboxAttachment, toInvoice, toProject, toTask } from "./mappers";

describe("Zuordnung Datenbankzeile → App", () => {
  it("Projekt mit Schritten", () => {
    const steps = groupSteps([
      { project_id: "p1", step_key: "plangespraech", occurred_on: "2026-01-12" },
      { project_id: "p1", step_key: "baugenehmigung", occurred_on: "2026-08-14" },
      { project_id: "p2", step_key: "plangespraech", occurred_on: "2026-02-05" },
    ]);
    const p = toProject({ id: "p1", abm_nr: "8161-9001", kind: "neubau", status: "aktiv", bauherr_label: "Reinhardt", company_id: null, intake_month: "2026-01-01" }, steps.get("p1"));
    expect(p.abmNr).toBe("8161-9001");
    expect(p.steps).toEqual({ plangespraech: "2026-01-12", baugenehmigung: "2026-08-14" });
    expect(p.companyId).toBeNull();
    expect(p.hausbauNr).toBeNull();
    expect(toProject({ id: "p3", kind: "neubau", status: "aktiv", bauherr_label: "X" }).steps).toEqual({});
  });

  it("Rechnung: Betrag als Zahl, Auslöser umbenannt", () => {
    const inv = toInvoice({ id: "i", project_id: "p", label: "Abschlag", amount_cents: "1000000", trigger_step_key: "baugenehmigung", status: "faellig", due_on: null });
    expect(inv.amountCents).toBe(1000000);
    expect(inv.triggerStep).toBe("baugenehmigung");
    expect(inv.sentOn).toBeNull();
  });

  it("Kontaktdaten je Projekt; ohne Bauherren-Zeilen (Freiberufler) leer", () => {
    const projects = [
      { id: "p1", bauherr_id: "b1" },
      { id: "p2", bauherr_id: null },
      { id: "p3", bauherr_id: "b1" },
    ];
    const b = [{ id: "b1", name: "Familie Reinhardt", phone: "0731 000000" }];
    expect(toBauherrContacts(b, projects).map((c) => c.projectId)).toEqual(["p1", "p3"]);
    expect(toBauherrContacts([], projects)).toEqual([]);
  });

  it("Dokument: Name statt Benutzer-ID, Eingangsdatum fällt auf das Anlagedatum zurück", () => {
    const names = new Map([["u1", "Mira Mitarbeiter"]]);
    const d = toDocument({ id: "d", project_id: "p", name: "a.pdf", storage_path: "p/x/a.pdf", size_bytes: "412000", source: "upload", uploaded_by: "u1", created_at: "2026-10-08T10:00:00+00:00", received_on: null }, names);
    expect(d.uploadedBy).toBe("Mira Mitarbeiter");
    expect(d.sizeBytes).toBe(412000);
    expect(d.receivedOn).toBe(d.createdAt.slice(0, 10));
    expect(toDocument({ id: "d", project_id: "p", name: "a.pdf", storage_path: "x", source: "agent", uploaded_by: "fremd", created_at: "2026-10-08T10:00:00Z" }).uploadedBy).toBeNull();
  });

  it("Aufgabe und Anhang: Zahlen und leere Werte", () => {
    const t = toTask({ id: "t", title: "X", status: "offen", source: "manuell", created_at: "2026-10-08T10:00:00Z", done_at: null });
    expect(t.doneAt).toBeNull();
    expect(t.projectId).toBeNull();
    const a = toInboxAttachment({ id: "a", item_id: "i", file_name: "f.pdf", mime: "application/pdf", size_bytes: "230000", confidence: "0.720", status: "pruefen", corrected: false });
    expect(a.confidence).toBe(0.72);
    expect(a.sizeBytes).toBe(230000);
    expect(a.documentId).toBeNull();
  });

  it("Zeitstempel werden zu Ortszeit ohne Zone (wie im Demo-Modus)", () => {
    const s = localStamp("2026-10-08T10:15:30+00:00")!;
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    // dieselbe Uhrzeit, egal in welcher Zeitzone der Test läuft
    expect(new Date(s).getTime()).toBe(new Date("2026-10-08T10:15:30Z").getTime());
    expect(localStamp(null)).toBeNull();
    expect(localStamp("kein Datum")).toBeNull();
  });

  it("Speichername: nur ASCII, keine Pfade", () => {
    expect(storageSafeName("Wohnflächenberechnung (neu).pdf")).toBe("Wohnflaechenberechnung_neu_.pdf");
    expect(storageSafeName("../../etc/passwd")).toBe("etc_passwd");
    expect(storageSafeName("Straße & Größe.PDF")).toBe("Strasse_Groesse.PDF");
    expect(storageSafeName("日本語")).toBe("datei");
    expect(storageSafeName("a/b\\c.pdf")).not.toMatch(/[\\/]/);
  });

  it("Spaltenlisten nennen nie * und nie secret_ref", () => {
    for (const cols of Object.values(COLS)) {
      expect(cols).not.toContain("*");
      expect(cols).not.toContain("secret_ref");
    }
  });

  it("Fehlermeldungen der Datenbank werden verständlich", () => {
    expect(dbErrorMessage({ code: "42501", message: "permission denied for table invoices" })).toBe("Keine Berechtigung für diese Aktion");
    expect(dbErrorMessage({ message: 'new row violates row-level security policy for table "tasks"' })).toBe("Keine Berechtigung für diese Aktion");
    expect(dbErrorMessage({ code: "PGRST205", message: "Could not find the table 'public.projects' in the schema cache" })).toContain("Migrationen fehlen");
    expect(dbErrorMessage({ message: "Für diesen Ordner fehlt das Datum" })).toBe("Für diesen Ordner fehlt das Datum");
    expect(dbErrorMessage(null, "Ersatz")).toBe("Ersatz");
  });
});
