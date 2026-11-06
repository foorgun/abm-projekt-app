// Testet die KI-Auslesung mit dem erfundenen Dokument scripts/fixtures/demo-vertrag.png, angemeldet als Admin, genau wie die App.
// Erzeugt einen Aufruf beim KI-Dienst (Kosten im Cent-Bereich) und eine Zeile in extraction_log.
// Aufruf: npm run check:ki -- --ziel development|production [--mail]
//   --mail: statt des Bildes eine erfundene Anfrage-Mail (Modus Mail). Erwartet: Bauort, Bauadresse, Flurstück, kein Bauherr.
import { readFileSync } from "node:fs";
import { die, publicClient, readKonten, waehleZiel } from "./lib/server";

const MAIL = process.argv.includes("--mail");
// Erfunden, im Aufbau wie echte Anfragen (Anrede an ABM, Angaben im Fließtext, kein Bauherr); Signatur schon abgeschnitten wie in der App
const MAIL_TEXT = [
  "Hey Mehmet,",
  "",
  "anbei Prüfungsunterlagen zu Altheim. Wegen dem Preis von 250.000 Euro lässt es sich nur als Doppelhaus rechnen.",
  "Bekommen wir hier ein Typ 120 drauf?",
  "",
  "Baugrundstück Flurnummer ist die 1234 in der Lindenstraße 7 in Altheim.",
].join("\n");

await waehleZiel(MAIL ? "KI-Auslesung mit einer erfundenen Anfrage-Mail testen" : "KI-Auslesung mit dem erfundenen Demo-Dokument testen");
const konto = readKonten().find((k) => k.rolle === "admin" && k.passwort);
if (!konto) die("Gebraucht wird ein Admin-Konto mit Passwort in der Kontenliste.");
const sb = publicClient();
const login = await sb.auth.signInWithPassword({ email: konto.email, password: konto.passwort! });
if (login.error) die(`Anmeldung fehlgeschlagen: ${login.error.message}`);

const body = MAIL
  ? { mail: { subject: "Prüfung Bauplatz in Altheim", text: MAIL_TEXT } }
  : { images: [{ mediaType: "image/png", data: readFileSync("scripts/fixtures/demo-vertrag.png").toString("base64") }], pages: [1] };
const { data: answer, error } = await sb.functions.invoke("extract-project", { body });
await sb.auth.signOut();

const result = error ? await (error as { context?: Response }).context?.json().catch(() => null) : answer;
if (!result?.ok) die(`Auslesung fehlgeschlagen: ${result?.code ?? "?"} · ${result?.message ?? (error as Error | null)?.message}`);
const felder = Object.entries((result.felder ?? {}) as Record<string, { wert?: unknown }>).filter(([, f]) => f?.wert);
console.log(`Auslesung in Ordnung: Dokumentart ${result.dokumentart ?? "?"}, ${felder.length} Felder erkannt (erfundene Daten):`);
for (const [name, f] of felder) console.log(`  ${name}: ${String(f.wert)}`);
