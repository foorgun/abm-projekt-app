// Standortangaben speichern ohne upsert: project_id darf nie im Änderungsteil stehen (Spaltenrechte, Migration 0020).
import { describe, expect, it } from "vitest";
import { standortAngabenSpeichern } from "./supabaseRepo";

function fake(vorhanden: boolean) {
  const calls: { op: string; values: Record<string, unknown> }[] = [];
  const kette = (op: string, values: Record<string, unknown>) => {
    calls.push({ op, values });
    const res = { data: op === "update" ? (vorhanden ? [{ project_id: "p" }] : []) : null, error: null };
    const c: Record<string, unknown> = { eq: () => c, select: () => Promise.resolve(res), then: (f: (r: typeof res) => unknown) => Promise.resolve(res).then(f) };
    return c;
  };
  const sb = { from: () => ({ update: (v: Record<string, unknown>) => kette("update", v), insert: (v: Record<string, unknown>) => kette("insert", v), upsert: () => { throw new Error("kein upsert"); } }) };
  return { sb: sb as never, calls };
}

describe("standortAngabenSpeichern", () => {
  const angaben = { radon: { wert: "nein", anzeige: "Kein Radonvorsorgegebiet", quelle: null, abgerufenAm: null, geaendert: false } };

  it("ändert eine vorhandene Zeile ohne project_id im Änderungsteil", async () => {
    const { sb, calls } = fake(true);
    await standortAngabenSpeichern(sb, "p", angaben, "u", "2026-11-11T00:00:00Z");
    expect(calls.map((c) => c.op)).toEqual(["update"]);
    expect(Object.keys(calls[0].values)).not.toContain("project_id");
  });

  it("legt ohne vorhandene Zeile neu an", async () => {
    const { sb, calls } = fake(false);
    await standortAngabenSpeichern(sb, "p", angaben, "u", "2026-11-11T00:00:00Z");
    expect(calls.map((c) => c.op)).toEqual(["update", "insert"]);
    expect(calls[1].values.project_id).toBe("p");
  });
});
