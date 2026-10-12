// Prüft die reine Logik der Edge Function extract-project (supabase/functions/extract-project/logic.ts)
// und dass ihre Feldliste zur App passt. Der Aufruf des KI-Dienstes selbst wird hier nicht ausgeführt.
import { describe, expect, it } from "vitest";
import {
  apiErrorInfo,
  base64Bytes,
  checkLimits,
  DEFAULT_LIMITS,
  DEFAULT_MODEL,
  estimateCostEur,
  extractJson,
  FIELDS,
  isEnabled,
  isSchemaRejection,
  imageDimensions,
  JSON_ONLY,
  limitsFromEnv,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE_PX,
  MAX_TOKENS,
  describeImages,
  normalizeLevel,
  outputConfig,
  outputSchema,
  supportsEffort,
  UNSUPPORTED_SCHEMA_KEYWORDS,
  parseRequest,
  periodStarts,
  repairMessage,
  strictEnabled,
  SYSTEM_PROMPT,
  TIMEOUT_MS,
  toResponse,
} from "../../../supabase/functions/extract-project/logic";
import source from "../../../supabase/functions/extract-project/index.ts?raw";
import { DRAFT_FIELDS, normalizeFields } from "./types";

import { JPEG_QUALITY, MAX_IMAGE_EDGE } from "./pageImage";

/** Kleinste Bilddateien mit echtem Kopf (Signatur und Pixelmaße), aufgefüllt auf `bytes`. */
function jpeg(width: number, height: number, bytes = 600): string {
  const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Buffer.concat([Buffer.from([...head, ...sof]), Buffer.alloc(Math.max(0, bytes - head.length - sof.length), 0x2a)]).toString("base64");
}
function png(width: number, height: number, bytes = 600): string {
  const b = Buffer.alloc(Math.max(bytes, 33), 0x2a);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b, 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b.toString("base64");
}
const img = (data = jpeg(1109, 1568), mediaType = "image/jpeg") => ({ mediaType, data });

describe("Edge Function: Feldliste und Schema", () => {
  it("nutzt genau die Felder der App", () => {
    expect([...FIELDS]).toEqual([...DRAFT_FIELDS]);
  });

  it("ist klein und flach: ein Array von Einträgen {feld, wert, quelle, seite, sicherheit}, ohne enum und ohne Objekt je Feldname", () => {
    const schema = outputSchema() as { additionalProperties: boolean; required: string[]; properties: { felder: { type: string; items: { type: string; required: string[]; additionalProperties: boolean; properties: Record<string, { type: string }> } }; hinweise: { type: string; items: { type: string } } } };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["felder", "hinweise"]);
    expect(schema.properties.felder.type).toBe("array");
    const item = schema.properties.felder.items;
    expect(item.required).toEqual(["feld", "wert", "quelle", "seite", "sicherheit"]);
    expect(item.additionalProperties).toBe(false);
    expect(Object.fromEntries(Object.entries(item.properties).map(([k, v]) => [k, v.type]))).toEqual({ feld: "string", wert: "string", quelle: "string", seite: "integer", sicherheit: "string" });
    expect(schema.properties.hinweise).toEqual({ type: "array", items: { type: "string" } });
    const text = JSON.stringify(schema);
    // Die frühere Form (ein Unterobjekt je Feld, mit enum) war dem KI-Dienst zu groß: "The compiled grammar is too large"
    expect(text).not.toMatch(/enum/);
    for (const k of DRAFT_FIELDS) expect(text, k).not.toContain(`"${k}"`);
    expect(text.length).toBeLessThan(500);
    expect((text.match(/"type":"object"/g) ?? []).length).toBe(2);
  });

  it("nennt Feldnamen und Sicherheitsstufen stattdessen in der Anweisung", () => {
    for (const k of DRAFT_FIELDS) expect(SYSTEM_PROMPT, k).toContain(k);
    expect(SYSTEM_PROMPT).toContain(`Erlaubte Werte für "feld" (genau diese Schreibweise, jedes höchstens einmal, keine anderen): ${DRAFT_FIELDS.join(", ")}.`);
    expect(SYSTEM_PROMPT).toMatch(/sicherheit: genau eines der Wörter hoch, mittel, niedrig/);
  });

  it("weist an: keine Bauadresse aus dem Werkvertrag, kein Geburtsdatum, kein Beruf", () => {
    expect(SYSTEM_PROMPT).toMatch(/Wohnanschrift ist nie die Bauadresse/);
    expect(SYSTEM_PROMPT).toMatch(/Nicht auslesen[^\n]*Geburtsdatum, Beruf/);
    expect(FIELDS.join(" ")).not.toMatch(/geburt|beruf|hausbau/i);
  });

  it("prüft die Antwort selbst und baut sie in die Form der App um", () => {
    const r = toResponse({
      felder: [
        { feld: "bauherrLabel", wert: " Hoffmann ", quelle: "1. Bauherr", seite: 1, sicherheit: "mittel" },
        { feld: "phone", wert: "0731", quelle: "", seite: 9, sicherheit: "HOCH " },
        { feld: "haustyp", wert: "Beispielhaus 140", quelle: "Haustyp", seite: 2, sicherheit: "high" },
        { feld: "email", wert: "a@example.com", quelle: "E-Mail", seite: 1, sicherheit: "sehr sicher" },
        // unbekannte Felder werden verworfen
        { feld: "geburtsdatum", wert: "01.01.1990", quelle: "geb.", seite: 1, sicherheit: "hoch" },
        { feld: "hausbauNr", wert: "HB-1", quelle: "", seite: 1, sicherheit: "hoch" },
        // doppelt: der erste Eintrag mit Wert zählt
        { feld: "bauherrLabel", wert: "Hofmann", quelle: "x", seite: 1, sicherheit: "hoch" },
        // leerer Wert und kaputte Einträge zählen nicht
        { feld: "address", wert: "  ", quelle: "Anschrift", seite: 1, sicherheit: "hoch" },
        { feld: "company", wert: 5 },
        null,
        "text",
      ],
      hinweise: ["a", " ", "b", "c", "d", 5],
    });
    if (!r.ok) throw new Error("erwartet ok");
    expect(Object.keys(r.felder).sort()).toEqual([...DRAFT_FIELDS].sort());
    expect(r.felder.bauherrLabel).toEqual({ wert: "Hoffmann", quelle: { text: "1. Bauherr", seite: 1 }, sicherheit: "mittel" });
    expect(r.felder.phone).toEqual({ wert: "0731", quelle: null, sicherheit: "hoch" });
    expect(r.felder.haustyp).toEqual({ wert: "Beispielhaus 140", quelle: { text: "Haustyp", seite: 2 }, sicherheit: "hoch" });
    expect(r.felder.email.sicherheit).toBe("niedrig");
    // fehlende Felder sind leer
    for (const k of ["address", "company", "vertragsdatum", "bauherr2Name"] as const) expect(r.felder[k], k).toEqual({ wert: null, quelle: null, sicherheit: "niedrig" });
    expect(JSON.stringify(r)).not.toMatch(/1990|HB-1|Hofmann/);
    expect(r.hinweise).toEqual(["a", "b", "c"]);
    // die App begrenzt Scans danach zusätzlich auf "mittel" (unverändert)
    expect(normalizeFields(r.felder, true).phone.sicherheit).toBe("mittel");
  });

  it("kommt mit leeren und falsch geformten Antworten zurecht", () => {
    const empty = toResponse({ felder: [], hinweise: [] });
    if (!empty.ok) throw new Error("erwartet ok");
    expect(DRAFT_FIELDS.every((k) => empty.felder[k].wert === null)).toBe(true);
    expect(toResponse({ felder: [] })).toMatchObject({ ok: true, hinweise: [] });
    // alte Form (Objekt je Feld), Text oder nichts: kein verwertbares Ergebnis
    expect(toResponse({ felder: { bauherrLabel: { wert: "Hoffmann" } }, hinweise: [] })).toMatchObject({ ok: false, code: "error" });
    expect(toResponse("kaputt")).toMatchObject({ ok: false, code: "error" });
    expect(toResponse(null)).toMatchObject({ ok: false, code: "error" });
  });

  it("vereinheitlicht die Sicherheitsstufe", () => {
    expect(["hoch", " Mittel", "NIEDRIG", "high", "medium", "low"].map(normalizeLevel)).toEqual(["hoch", "mittel", "niedrig", "hoch", "mittel", "niedrig"]);
    expect([undefined, 3, "", "sicher"].map(normalizeLevel)).toEqual(["niedrig", "niedrig", "niedrig", "niedrig"]);
  });
});

describe("Edge Function: Eingabe", () => {
  it("nimmt ein oder zwei Bilder und liest Typ, Pixelmaße und Größe aus dem Kopf der Datei", () => {
    const one = parseRequest({ images: [img()] });
    expect(one).toMatchObject({ ok: true, images: [{ mediaType: "image/jpeg", width: 1109, height: 1568, bytes: 600 }] });
    const two = parseRequest({ images: [img(), img(png(800, 1131, 900), "image/png")] });
    expect(two).toMatchObject({ ok: true, images: [{}, { mediaType: "image/png", width: 800, height: 1131, bytes: 900 }] });
    if (two.ok) expect(describeImages(two.images)).toBe("1109x1568 px, 1 kB, image/jpeg | 800x1131 px, 1 kB, image/png");
    expect(imageDimensions(jpeg(2, 3))).toEqual({ mediaType: "image/jpeg", width: 2, height: 3 });
    expect(imageDimensions(Buffer.alloc(300, 1).toString("base64"))).toBeNull();
    expect(base64Bytes("QUJD")).toBe(3);
    expect(base64Bytes("QUI=")).toBe(2);
  });

  it("die App verkleinert vor dem Senden auf 1568 px und JPEG-Qualität 85, deutlich unter den Grenzen der Funktion", () => {
    expect(MAX_IMAGE_EDGE).toBe(1568);
    expect(JPEG_QUALITY).toBe(0.85);
    expect(MAX_IMAGE_EDGE).toBeLessThanOrEqual(MAX_IMAGE_EDGE_PX);
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });

  it("lehnt Bilder über 5 MB, über 2576 px und mit falschem Typ ab, mit Zahlen in der Meldung", () => {
    expect(parseRequest({ images: [img(jpeg(1000, 1000, MAX_IMAGE_BYTES + 3))] })).toMatchObject({ ok: false, message: expect.stringMatching(/zu groß \(\d+ kB, erlaubt sind höchstens 5 MB\)/) });
    expect(parseRequest({ images: [img(jpeg(1000, 1000, MAX_IMAGE_BYTES))] })).toMatchObject({ ok: true });
    expect(parseRequest({ images: [img(jpeg(4000, 3000))] })).toMatchObject({ ok: false, message: expect.stringContaining("4000×3000 px") });
    expect(parseRequest({ images: [img(jpeg(MAX_IMAGE_EDGE_PX, 100))] })).toMatchObject({ ok: true });
    // PNG-Inhalt als JPEG angegeben: der KI-Dienst würde mit Fehler 400 ablehnen
    expect(parseRequest({ images: [img(png(800, 600), "image/jpeg")] })).toMatchObject({ ok: false, message: expect.stringContaining("passen nicht zusammen") });
    expect(parseRequest({ images: [img(Buffer.alloc(600, 7).toString("base64"))] })).toMatchObject({ ok: false, message: expect.stringContaining("weder JPEG noch PNG") });
  });

  it("lehnt mehr als zwei Bilder, fremde Typen, zu große und unlesbare Bilder ab", () => {
    expect(parseRequest({ images: [img(), img(), img()] })).toMatchObject({ ok: false, message: expect.stringContaining("Höchstens 2") });
    expect(parseRequest({ images: [] })).toMatchObject({ ok: false });
    expect(parseRequest({})).toMatchObject({ ok: false });
    expect(parseRequest(null)).toMatchObject({ ok: false });
    expect(parseRequest({ images: [img(jpeg(10, 10), "application/pdf")] })).toMatchObject({ ok: false });
    expect(parseRequest({ images: [img(jpeg(10, 10) + "A")] })).toMatchObject({ ok: false });
    expect(parseRequest({ images: [img("<script>".repeat(50))] })).toMatchObject({ ok: false });
    expect(parseRequest({ images: [img("kurz")] })).toMatchObject({ ok: false });
  });
});

describe("Edge Function: Parameter und Schema passen zum KI-Dienst", () => {
  it("sendet 'effort' nur an Modelle, die den Parameter kennen", () => {
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6"]) expect(supportsEffort(m), m).toBe(true);
    for (const m of ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-5-5-20260101", "irgendwas"]) expect(supportsEffort(m), m).toBe(false);
    expect(outputConfig(DEFAULT_MODEL)).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(Object.keys(outputConfig("claude-haiku-4-5")!)).toEqual(["format"]);
    // ohne Schema-Bindung: kein format; gibt es dann gar keinen Parameter, entfällt output_config ganz
    expect(outputConfig(DEFAULT_MODEL, false)).toEqual({ effort: "low" });
    expect(outputConfig("claude-haiku-4-5", false)).toBeUndefined();
  });

  it("sendet weder thinking noch temperature noch tool_choice (je nach Modell ungültig)", () => {
    const from = source.indexOf("client.messages.create(");
    const call = source.slice(from, source.indexOf("});", from));
    expect(call).not.toMatch(/thinking|temperature|top_p|top_k|tool_choice|budget_tokens|output_format|strict: true/);
    expect(call).toContain("...(config ? { output_config: config } : {})");
    expect(call).toContain("max_tokens: MAX_TOKENS");
    expect(source.match(/client\.messages\.create\(/g)).toHaveLength(1);
  });

  it("das Schema nutzt nur, was die strukturierte Ausgabe annimmt", () => {
    const seen: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      for (const k of Object.keys(n)) if (UNSUPPORTED_SCHEMA_KEYWORDS.includes(k) && path.split(".").pop() !== "properties") seen.push(`${path}.${k}`);
      if (n.type === "object") {
        // jedes Objekt: additionalProperties false und alle Eigenschaften als Pflicht (keine optionalen, keine null-Varianten)
        expect(n.additionalProperties, path).toBe(false);
        expect([...(n.required as string[])].sort(), path).toEqual(Object.keys(n.properties as object).sort());
      }
      expect(Array.isArray(n.type), `${path}: keine Typ-Listen`).toBe(false);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    const schema = outputSchema();
    walk(schema, "schema");
    expect(seen).toEqual([]);
    const text = JSON.stringify(schema);
    expect(text).not.toMatch(/\$ref|anyOf|allOf|"null"|"format"|enum/);
    // nur die Grundtypen object, array, string, integer
    expect([...new Set([...text.matchAll(/"type":"(\w+)"/g)].map((m) => m[1]))].sort()).toEqual(["array", "integer", "object", "string"]);
  });
});

describe("Edge Function: ohne Schema-Bindung (Ausweichweg)", () => {
  it("erkennt, wenn der Dienst das Schema selbst ablehnt, und nur dann", () => {
    const grammar = { type: "invalid_request_error", message: "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools." };
    expect(isSchemaRejection(grammar)).toBe(true);
    expect(isSchemaRejection({ type: "invalid_request_error", message: "output_config.format.schema: Unsupported keyword 'minimum'" })).toBe(true);
    // andere Fehler 400 würden ohne Schema genauso scheitern: kein zweiter Versuch
    expect(isSchemaRejection({ type: "invalid_request_error", message: "messages.0.content.0.image.source.base64: image exceeds 5 MB maximum" })).toBe(false);
    expect(isSchemaRejection({ type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." })).toBe(false);
    expect(isSchemaRejection({ type: "overloaded_error", message: "grammar" })).toBe(false);
  });

  it("lässt sich per Secret ganz abschalten (EXTRACTOR_STRICT=false), Standard ist an", () => {
    expect(strictEnabled(undefined)).toBe(true);
    expect(strictEnabled("true")).toBe(true);
    expect(strictEnabled("")).toBe(true);
    expect(strictEnabled(" FALSE ")).toBe(false);
  });

  it("verlangt dann in der Anweisung reines JSON in derselben Form", () => {
    expect(JSON_ONLY).toMatch(/ausschließlich mit einem einzigen JSON-Objekt/);
    const example = extractJson(JSON_ONLY.slice(JSON_ONLY.indexOf("{")));
    if (!example.ok) throw new Error("Beispiel muss gültiges JSON sein");
    expect(toResponse(example.value)).toMatchObject({ ok: true });
  });

  it("liest JSON auch aus Markdown-Zäunen und mit Text drumherum", () => {
    const obj = { felder: [{ feld: "bauherrLabel", wert: "Hoffmann", quelle: "x", seite: 1, sicherheit: "mittel" }], hinweise: [] };
    const j = JSON.stringify(obj);
    for (const text of [j, `\`\`\`json\n${j}\n\`\`\``, `Hier das Ergebnis:\n${j}\nFertig.`, `  ${j}  `]) expect(extractJson(text), text).toEqual({ ok: true, value: obj });
  });

  it("meldet bei ungültigem JSON nur die Fehlerart, nichts aus der Antwort", () => {
    expect(extractJson("Ich kann das nicht lesen.")).toEqual({ ok: false, problem: "kein JSON-Objekt gefunden" });
    expect(extractJson('{"felder": [{"feld": "bauherrLabel", "wert": "Hoffmann"')).toEqual({ ok: false, problem: "kein JSON-Objekt gefunden" });
    expect(extractJson("{'felder': []}")).toEqual({ ok: false, problem: "ungültiges JSON" });
    expect(extractJson("")).toMatchObject({ ok: false });
    const repair = repairMessage("ungültiges JSON");
    expect(repair).toContain("ungültiges JSON");
    expect(repair).toMatch(/ausschließlich mit dem JSON-Objekt/);
  });

  it("Ablauf im Quelltext: erst mit Schema, bei Schema-Ablehnung einmal ohne, bei ungültigem JSON genau eine Nachfrage", () => {
    const i = (needle: string) => {
      const at = source.indexOf(needle);
      expect(at, needle).toBeGreaterThan(-1);
      return at;
    };
    expect(i('strictEnabled(env("EXTRACTOR_STRICT"))')).toBeLessThan(i("response = await ask(strict, []);"));
    expect(i("response = await ask(strict, []);")).toBeLessThan(i("isSchemaRejection(info)"));
    expect(i("isSchemaRejection(info)")).toBeLessThan(i("response = await ask(false, []);"));
    expect(source).toContain("for (let attempt = 0; attempt < 2; attempt++)");
    expect(source).toContain('{ role: "assistant", content: response.content }');
    expect(source).toContain("repairMessage(read.problem)");
    // höchstens drei Aufrufe je Auslesung, der Verbrauch aller Versuche wird zusammengezählt
    expect(source.match(/await ask\(/g)).toHaveLength(3);
    expect(source).toContain("inputTokens += response.usage.input_tokens");
  });
});

describe("Edge Function: Fehler des KI-Dienstes im Log", () => {
  it("liest Typ und Meldung aus der Antwort des Dienstes", () => {
    const body = { type: "error", error: { type: "invalid_request_error", message: "output_config.format.schema: Unsupported keyword 'minimum'" }, request_id: "req_1" };
    expect(apiErrorInfo({ status: 400, error: body })).toEqual({ type: "invalid_request_error", message: "output_config.format.schema: Unsupported keyword 'minimum'" });
    expect(apiErrorInfo({ type: "billing_error", error: { error: { message: "Your credit balance is too low" } } })).toEqual({ type: "billing_error", message: "Your credit balance is too low" });
    expect(apiErrorInfo(new Error("kaputt"))).toEqual({ type: "unbekannt", message: "ohne Meldung" });
    expect(apiErrorInfo(null)).toEqual({ type: "unbekannt", message: "ohne Meldung" });
  });

  it("entfernt Bilddaten und Schlüssel aus der Meldung und kürzt sie", () => {
    const leak = { error: { error: { type: "invalid_request_error", message: `image ${"QUJD".repeat(40)} invalid, key sk-ant-api03-abcDEF_123 ${"wort ".repeat(200)}` } } };
    const info = apiErrorInfo(leak);
    expect(info.message).not.toMatch(/QUJDQUJD|sk-ant-/);
    expect(info.message).toContain("[…]");
    expect(info.message.length).toBeLessThanOrEqual(400);
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
    // Logs: feste Texte, Statuscode, Bildmaße und der bereinigte Fehlertyp samt Meldung des Dienstes (apiErrorInfo).
    // Nie die Anfrage, die Antwort, ein Bild oder ein rohes Fehlerobjekt.
    const logs = [...source.matchAll(/console\.(\w+)\((.*)\);/g)];
    expect(logs.length).toBeGreaterThan(5);
    for (const m of logs) {
      expect(["info", "error"], m[0]).toContain(m[1]);
      expect(m[2], m[0]).not.toMatch(/\bbody\b|\.data\b|response|raw|text\b|JSON\.stringify|\berror\)|error\.message|error\.error/);
      for (const v of m[2].matchAll(/\$\{([^}]*)\}/g)) expect(v[1], m[0]).toMatch(/^(model|parsed\.images\.length|describeImages\(parsed\.images\)|error\.status \?\? "ohne Status"|info\.type|info\.message|apiErrorInfo\(error\)\.(type|message))$/);
    }
  });
});
