// Testet die KI-Auslesung mit dem erfundenen Dokument scripts/fixtures/demo-vertrag.png, angemeldet als Admin, genau wie die App.
// Erzeugt einen Aufruf beim KI-Dienst (Kosten im Cent-Bereich) und eine Zeile in extraction_log.
// Aufruf: npm run check:ki -- --ziel development|production
import { readFileSync } from "node:fs";
import { die, publicClient, readKonten, waehleZiel } from "./lib/server";

await waehleZiel("KI-Auslesung mit dem erfundenen Demo-Dokument testen");
const konto = readKonten().find((k) => k.rolle === "admin" && k.passwort);
if (!konto) die("Gebraucht wird ein Admin-Konto mit Passwort in der Kontenliste.");
const sb = publicClient();
const login = await sb.auth.signInWithPassword({ email: konto.email, password: konto.passwort! });
if (login.error) die(`Anmeldung fehlgeschlagen: ${login.error.message}`);

const data = readFileSync("scripts/fixtures/demo-vertrag.png").toString("base64");
const { data: answer, error } = await sb.functions.invoke("extract-project", { body: { images: [{ mediaType: "image/png", data }], pages: [1] } });
await sb.auth.signOut();

const result = error ? await (error as { context?: Response }).context?.json().catch(() => null) : answer;
if (!result?.ok) die(`Auslesung fehlgeschlagen: ${result?.code ?? "?"} · ${result?.message ?? (error as Error | null)?.message}`);
const felder = Object.entries((result.felder ?? {}) as Record<string, { wert?: unknown }>).filter(([, f]) => f?.wert);
console.log(`Auslesung in Ordnung: Dokumentart ${result.dokumentart ?? "?"}, ${felder.length} Felder erkannt (erfundene Daten):`);
for (const [name, f] of felder) console.log(`  ${name}: ${String(f.wert)}`);
