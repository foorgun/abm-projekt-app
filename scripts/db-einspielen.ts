// Spielt eine mit db:bundle erzeugte Datei über die Management API in das Ziel ein (eine Transaktion, alles oder nichts).
// Ersetzt "supabase db query --linked": die Ref kommt aus dem Ziel, nicht aus einer Verknüpfung. Nie "supabase db push".
// Aufruf: npm run db:einspielen -- --ziel development|production --datei supabase/.out/<ziel>/migrationen-ab-0021.sql
import { existsSync, readFileSync } from "node:fs";
import { managementApi } from "./lib/management";
import { die, waehleZiel } from "./lib/server";
import { parseZiel } from "./lib/ziele";

const i = process.argv.indexOf("--datei");
const datei = i >= 0 ? process.argv[i + 1] : undefined;
if (!datei || !existsSync(datei)) die("--datei fehlt oder die Datei gibt es nicht. Erst npm run db:bundle.");
// Die Datei muss für genau dieses Ziel erzeugt sein
const ziel = parseZiel(process.argv);
if (ziel && !datei.includes(`/.out/${ziel}/`)) die("Die Datei liegt nicht im Ordner dieses Ziels (supabase/.out/<ziel>/).");

await waehleZiel(`SQL-Datei ${datei} einspielen`, ["token"]);
const sql = readFileSync(datei, "utf8");
console.log(`${datei}: ${sql.length} Zeichen`);
const { status, body } = await managementApi("/database/query", { method: "POST", body: JSON.stringify({ query: sql }) });
if (status >= 300) die(`Fehlgeschlagen (${status}), nichts übernommen:\n${JSON.stringify(body).slice(0, 2000)}`);
console.log(`Eingespielt (${status}).`);
