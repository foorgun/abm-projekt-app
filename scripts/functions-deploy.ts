// Deployt Edge Functions in das Ziel, mit verify_jwt aus supabase/config.toml. Die Ref kommt aus dem Ziel, nie aus "supabase link".
// Aufruf: npm run functions:deploy -- --ziel development|production [extract-project …]   (ohne Namen: alle)
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { die, waehleZiel, zielWerte } from "./lib/server";

const alle = readdirSync("supabase/functions", { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name);
const raw = process.argv.slice(2).filter((a) => a !== "--");
const zielIndex = raw.indexOf("--ziel");
const namen = raw.filter((a, i) => !a.startsWith("--") && i !== zielIndex + 1);
const unbekannt = namen.filter((n) => !alle.includes(n));
if (unbekannt.length) die(`Unbekannte Funktion: ${unbekannt.join(", ")}. Vorhanden: ${alle.join(", ")}`);
const auswahl = namen.length ? namen : alle;

await waehleZiel(`Edge Functions deployen: ${auswahl.join(", ")}`, ["token"]);
const { ref, env } = zielWerte();
for (const name of auswahl) {
  console.log(`Deploy ${name} …`);
  // Das Token nur über die Umgebung des Kindprozesses, nie als Argument. --yes beantwortet die Rückfrage der CLI:
  // Das Ziel ist hier schon geprüft, bei production mit eingetipptem abm-prod (waehleZiel).
  const r = spawnSync("npx", ["--yes", "supabase", "functions", "deploy", name, `--remote=${ref}`, "--use-api", "--yes"], {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN },
  });
  if (r.status !== 0) die(`Deploy von ${name} fehlgeschlagen.`);
}
console.log(`Fertig: ${auswahl.join(", ")}`);
