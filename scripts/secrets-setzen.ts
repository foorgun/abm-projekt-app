// Setzt Secrets der Edge Functions im Ziel. Schlüssel kommen nur aus der Datei des Ziels, nie von der Kommandozeile.
//   npm run secrets:setzen -- --ziel <ziel> --liste                     zeigt nur die Namen
//   npm run secrets:setzen -- --ziel <ziel> ANTHROPIC_API_KEY           aus .env.ziel.<ziel>, vorher beim Dienst geprüft
//   npm run secrets:setzen -- --ziel <ziel> EXTRACTOR_ENABLED=true      Einstellungen (nur EXTRACTOR_*, keine Geheimnisse)
import { managementApi } from "./lib/management";
import { die, waehleZiel, zielWerte } from "./lib/server";

const raw = process.argv.slice(2).filter((a) => a !== "--");
const zielIndex = raw.indexOf("--ziel");
const args = raw.filter((a, i) => !a.startsWith("--") && i !== zielIndex + 1);
const liste = raw.includes("--liste");
if (!liste && !args.length) die("Nichts zu tun: --liste, ANTHROPIC_API_KEY oder EXTRACTOR_…=wert angeben.");
if (args.some((a) => a !== "ANTHROPIC_API_KEY" && !/^EXTRACTOR_[A-Z_]+=[^=]+$/.test(a))) die("Erlaubt sind nur ANTHROPIC_API_KEY und EXTRACTOR_…=wert.");

const setztSchluessel = args.includes("ANTHROPIC_API_KEY");
await waehleZiel(liste ? "Namen der Secrets lesen" : `Secrets setzen: ${args.map((a) => a.split("=")[0]).join(", ")}`, setztSchluessel ? ["token", "anthropic"] : ["token"]);

if (args.length) {
  const secrets = args.map((a) => (a === "ANTHROPIC_API_KEY" ? { name: a, value: zielWerte().env.ANTHROPIC_API_KEY } : { name: a.split("=")[0], value: a.split("=")[1] }));
  if (setztSchluessel) {
    const probe = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": zielWerte().env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } });
    if (!probe.ok) die(`Der Anthropic-Schlüssel wird abgelehnt (${probe.status}). Nichts gesetzt.`);
  }
  const { status } = await managementApi("/secrets", { method: "POST", body: JSON.stringify(secrets) });
  if (status >= 300) die(`Setzen fehlgeschlagen (${status}). Nichts ausgegeben, Details im Dashboard.`);
  console.log(`Gesetzt: ${secrets.map((s) => s.name).join(", ")}`);
}
const { status, body } = await managementApi("/secrets");
if (status >= 300) die(`Liste nicht lesbar (${status}).`);
console.log(`Secrets im Ziel: ${(body as { name: string }[]).map((s) => s.name).sort().join(", ") || "keine"}`);
