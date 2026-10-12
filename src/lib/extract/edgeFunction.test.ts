// Prüft die reine Logik der Edge Function extract-project (supabase/functions/extract-project/logic.ts)
// und dass ihre Feldliste zur App passt. Der Aufruf des KI-Dienstes selbst wird hier nicht ausgeführt.
import { describe, expect, it } from "vitest";
import {
  checkLimits,
  DEFAULT_LIMITS,
  DEFAULT_MODEL,
  estimateCostEur,
  FIELDS,
  isEnabled,
  limitsFromEnv,
  MAX_IMAGE_BASE64,
  MAX_TOKENS,
  outputSchema,
  parseRequest,
  periodStarts,
  SYSTEM_PROMPT,
  TIMEOUT_MS,
  toResponse,
} from "../../../supabase/functions/extract-project/logic";
import source from "../../../supabase/functions/extract-project/index.ts?raw";
import { DRAFT_FIELDS, normalizeFields } from "./types";

const img = (data = "A".repeat(400), mediaType = "image/jpeg") => ({ mediaType, data });

describe("Edge Function: Feldliste und Schema", () => {
  it("nutzt genau die Felder der App", () => {
    expect([...FIELDS]).toEqual([...DRAFT_FIELDS]);
  });

  it("gibt je Feld wert, quelle, seite und sicherheit vor und erlaubt keinen Freitext daneben", () => {
    const schema = outputSchema() as { additionalProperties: boolean; required: string[]; properties: { felder: { required: string[]; additionalProperties: boolean; properties: Record<string, { required: string[]; additionalProperties: boolean; properties: { sicherheit: { enum: string[] } } }> } } };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["felder", "hinweise"]);
    expect(schema.properties.felder.required).toEqual([...DRAFT_FIELDS]);
    expect(schema.properties.felder.additionalProperties).toBe(false);
    for (const k of DRAFT_FIELDS) {
      const f = schema.properties.felder.properties[k];
      expect(f.required, k).toEqual(["wert", "quelle", "seite", "sicherheit"]);
      expect(f.additionalProperties).toBe(false);
      expect(f.properties.sicherheit.enum).toEqual(["hoch", "mittel", "niedrig"]);
    }
  });

  it("weist an: keine Bauadresse aus dem Werkvertrag, kein Geburtsdatum, kein Beruf", () => {
    expect(SYSTEM_PROMPT).toMatch(/Wohnanschrift ist nie die Bauadresse/);
    expect(SYSTEM_PROMPT).toMatch(/Nicht auslesen[^\n]*Geburtsdatum, Beruf/);
    expect(FIELDS.join(" ")).not.toMatch(/geburt|beruf|hausbau/i);
  });

  it("bringt die Antwort in die Form der App", () => {
    const felder = Object.fromEntries(FIELDS.map((k) => [k, { wert: "", quelle: "", seite: 0, sicherheit: "niedrig" }]));
    const r = toResponse({ felder: { ...felder, bauherrLabel: { wert: " Hoffmann ", quelle: "1. Bauherr", seite: 1, sicherheit: "mittel" }, phone: { wert: "0731", quelle: "", seite: 9, sicherheit: "hoch" } }, hinweise: ["a", "b", "c", "d", 5] });
    if (!r.ok) throw new Error("erwartet ok");
    expect(r.felder.bauherrLabel).toEqual({ wert: "Hoffmann", quelle: { text: "1. Bauherr", seite: 1 }, sicherheit: "mittel" });
    expect(r.felder.phone).toEqual({ wert: "0731", quelle: null, sicherheit: "hoch" });
    expect(r.felder.email).toEqual({ wert: null, quelle: null, sicherheit: "niedrig" });
    expect(r.hinweise).toEqual(["a", "b", "c"]);
    // die App begrenzt Scans danach zusätzlich auf "mittel"
    expect(normalizeFields(r.felder, true).phone.sicherheit).toBe("mittel");
    expect(toResponse("kaputt")).toMatchObject({ ok: false, code: "error" });
  });
});

describe("Edge Function: Eingabe", () => {
  it("nimmt ein oder zwei Bilder", () => {
    expect(parseRequest({ images: [img()] })).toMatchObject({ ok: true });
    expect(parseRequest({ images: [img(), img("B".repeat(400), "image/png")] })).toMatchObject({ ok: true });
  });

  it("lehnt mehr als zwei Bilder, fremde Typen, zu große und unlesbare Bilder ab", () => {
    expect(parseRequest({ images: [img(), img(), img()] })).toMatchObject({ ok: false, message: expect.stringContaining("Höchstens 2") });
    expect(parseRequest({ images: [] })).toMatchObject({ ok: false });
    expect(parseRequest({})).toMatchObject({ ok: false });
    expect(parseRequest(null)).toMatchObject({ ok: false });
    expect(parseRequest({ images: [img("A".repeat(400), "application/pdf")] })).toMatchObject({ ok: false });
    expect(parseRequest({ images: [img("A".repeat(MAX_IMAGE_BASE64 + 4))] })).toMatchObject({ ok: false, message: expect.stringContaining("zu groß") });
    expect(parseRequest({ images: [img("<script>".repeat(50))] })).toMatchObject({ ok: false });
    expect(parseRequest({ images: [img("kurz")] })).toMatchObject({ ok: false });
  });
});

describe("Edge Function: Schalter und Kostenbremse", () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];

  it("ist nur mit EXTRACTOR_ENABLED=true freigeschaltet", () => {
    expect(isEnabled(undefined)).toBe(false);
    expect(isEnabled("")).toBe(false);
    expect(isEnabled("false")).toBe(false);
    expect(isEnabled("1")).toBe(false);
    expect(isEnabled(" TRUE ")).toBe(true);
  });

  it("hat die vereinbarten Standards: 20 je Person, 100 je Tag, 20 € im Monat, Sonnet, 2000 Tokens, 60 s", () => {
    expect(limitsFromEnv(env({}))).toEqual({ perUserPerDay: 20, totalPerDay: 100, monthlyBudgetEur: 20 });
    expect(limitsFromEnv(env({ EXTRACTOR_LIMIT_USER_PER_DAY: "5", EXTRACTOR_LIMIT_TOTAL_PER_DAY: "x", EXTRACTOR_MONTHLY_BUDGET_EUR: " " }))).toEqual({ perUserPerDay: 5, totalPerDay: 100, monthlyBudgetEur: 20 });
    expect(DEFAULT_MODEL).toBe("claude-sonnet-5-5");
    expect(MAX_TOKENS).toBe(2000);
    expect(TIMEOUT_MS).toBe(60_000);
  });

  it("sperrt bei erreichtem Limit mit klarer Meldung, sonst nicht", () => {
    const ok = { userToday: 19, totalToday: 99, monthCostEur: 19.99 };
    expect(checkLimits(ok, DEFAULT_LIMITS)).toBeNull();
    expect(checkLimits({ ...ok, userToday: 20 }, DEFAULT_LIMITS)).toMatchObject({ ok: false, code: "limit", message: expect.stringContaining("Tageslimit erreicht") });
    expect(checkLimits({ ...ok, totalToday: 100 }, DEFAULT_LIMITS)).toMatchObject({ code: "limit", message: expect.stringContaining("Tageslimit erreicht") });
    expect(checkLimits({ ...ok, monthCostEur: 20 }, DEFAULT_LIMITS)).toMatchObject({ code: "limit", message: expect.stringContaining("Monatsbudget") });
    expect(checkLimits({ userToday: 0, totalToday: 0, monthCostEur: 0 }, { ...DEFAULT_LIMITS, perUserPerDay: 0 })).toMatchObject({ code: "limit" });
  });

  it("schätzt die Kosten aus Tokens und Listenpreis; unbekannte Modelle teuer", () => {
    expect(estimateCostEur("claude-sonnet-5-5", 2000, 1000)).toBe(0.014);
    expect(estimateCostEur("claude-sonnet-5-5", 2000, 1000, 0.9)).toBe(0.0126);
    expect(estimateCostEur("unbekannt", 1_000_000, 0)).toBe(10);
  });

  it("zählt ab Tages- und Monatsbeginn (UTC)", () => {
    expect(periodStarts(new Date("2026-10-12T15:30:00Z"))).toEqual({ day: "2026-10-12T00:00:00.000Z", month: "2026-10-01T00:00:00.000Z" });
  });
});

describe("Edge Function: Ablauf im Quelltext", () => {
  const at = (needle: string) => {
    const i = source.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it("prüft Anmeldung, Rolle, Schalter und Limits, bevor der KI-Dienst aufgerufen wird", () => {
    const call = at("client.messages.create(");
    for (const step of ["admin.auth.getUser(token)", 'from("user_roles")', 'isEnabled(env("EXTRACTOR_ENABLED"))', "parseRequest(body)", "checkLimits("]) expect(at(step), step).toBeLessThan(call);
  });

  it("liest den Schlüssel nur aus dem Secret und protokolliert keine Inhalte", () => {
    expect(source).toContain('env("ANTHROPIC_API_KEY")');
    expect(source).not.toMatch(/sk-ant-/);
    // Logs: nur feste Texte oder der Statuscode, nie Anfrage, Antwort oder Fehlertext
    for (const m of source.matchAll(/console\.(?:log|error|warn)\(([^)]*)\)/g)) expect(m[1], m[0]).not.toMatch(/body|parsed|response|images|text|message|error\)/);
    expect(source).not.toMatch(/console\.log/);
  });
});
