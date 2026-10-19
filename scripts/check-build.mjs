// Prüft den Produktions-Build (dist/) vor dem Veröffentlichen: keine Geheimnisse, keine internen Seiten,
// Suchmaschinen ausgesperrt. Baut vorher neu mit den Werten aus .env (wie Cloudflare mit seinen Variablen).
// Liest lokale Geheimnisse nur, um nach ihnen zu SUCHEN; sie werden nie ausgegeben.
// Aufruf: npm run check:build
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const env = (file) =>
  existsSync(file)
    ? Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]))
    : {};

console.log("Baue Produktions-Build …");
execSync("npx vite build", { stdio: ["ignore", "ignore", "inherit"] });

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})("dist");
const text = files.filter((f) => /\.(js|css|html|txt|json|svg|map)$/.test(f) || f.endsWith("_headers")).map((f) => [f, readFileSync(f, "utf8")]);
const all = text.map(([, c]) => c).join("\n");
const where = (needle) => text.filter(([, c]) => c.includes(needle)).map(([f]) => f);

const rows = [];
let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad++;
  rows.push([name, ok ? "ok" : "FEHLER", detail]);
};

// ---- Geheimnisse
const pub = env(".env");
const server = env(".env.server");
check("Kein Secret key (sb_secret_…)", !/sb_secret_[A-Za-z0-9_-]{8,}/.test(all));
for (const [k, v] of Object.entries(server)) if (v && v.length >= 12) check(`Wert von ${k} aus .env.server nicht enthalten`, !all.includes(v), all.includes(v) ? where(v).join(", ") : "");
if (!Object.keys(server).length) rows.push(["Werte aus .env.server", "–", "Datei nicht vorhanden, nichts zu vergleichen"]);
// Alte JWT-Schlüssel: jedes Token im Build entschlüsseln und auf die Rolle service_role prüfen
const jwts = [...new Set(all.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? [])];
const serviceJwt = jwts.filter((t) => {
  try {
    return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).role === "service_role";
  } catch {
    return false;
  }
});
check("Kein Schlüssel der Rolle service_role (JWT)", serviceJwt.length === 0, `${jwts.length} Token im Build geprüft`);
if (existsSync("konten.local.json")) {
  const konten = JSON.parse(readFileSync("konten.local.json", "utf8")).konten ?? [];
  check("Keine Passwörter aus konten.local.json", !konten.some((k) => k.passwort && all.includes(k.passwort)));
  check("Keine E-Mail-Adressen aus konten.local.json", !konten.some((k) => k.email && all.toLowerCase().includes(k.email.toLowerCase())));
}
check("Keine Datenbank-Adresse mit Passwort (postgres://…)", !/postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/.test(all));
check("Keine Quelltext-Karten (*.map)", !files.some((f) => f.endsWith(".map")));

// ---- Was drin sein MUSS bzw. darf
if (pub.VITE_SUPABASE_URL && pub.VITE_SUPABASE_ANON_KEY) {
  check("Publishable key beginnt mit sb_publishable_", pub.VITE_SUPABASE_ANON_KEY.startsWith("sb_publishable_"));
  check("Echtbetrieb: Projektadresse und Publishable key sind enthalten (gewollt, öffentlich)", all.includes(pub.VITE_SUPABASE_URL) && all.includes(pub.VITE_SUPABASE_ANON_KEY));
} else rows.push(["Echtbetrieb", "–", "ohne VITE_SUPABASE_* gebaut: das ist ein Demo-Build"]);
// Umfang der Oberfläche (Vite nimmt die Umgebung vor .env)
const mode = (process.env.VITE_APP_MODE ?? pub.VITE_APP_MODE ?? "").trim().toLowerCase() === "pilot" ? "pilot" : "voll";
rows.push(["Oberfläche (VITE_APP_MODE)", "–", mode === "pilot" ? "Pilot: nur Projekte, Dokumente, Planungsprotokoll" : "voller Umfang"]);

// ---- Interne Seiten
check("Styleguide ist nicht im Build", !/styleguide/i.test(all), where("styleguide").concat(where("Styleguide")).join(", "));
check("Kein Verweis auf BUILD.md oder interne Schrittnummern in Texten", !/BUILD\.md/.test(all));

// ---- Suchmaschinen und Kopfzeilen
const index = readFileSync("dist/index.html", "utf8");
check("index.html: noindex", /<meta name="robots" content="[^"]*noindex/.test(index));
check("robots.txt sperrt alles", existsSync("dist/robots.txt") && /Disallow:\s*\/\s*$/m.test(readFileSync("dist/robots.txt", "utf8")));
const headers = existsSync("dist/_headers") ? readFileSync("dist/_headers", "utf8") : "";
check("_headers: X-Robots-Tag noindex", /X-Robots-Tag:\s*noindex/.test(headers));
check("_headers: Content-Security-Policy erlaubt nur die eigene Seite und Supabase", /Content-Security-Policy:.*connect-src 'self' https:\/\/\*\.supabase\.co/.test(headers));
check("Keine externen Skripte, Schriften oder Tracker in index.html", !/(src|href)="https?:\/\//.test(index));

// ---- Unerwartete Dateien (z. B. aus public/, die nicht ins Repo gehören)
const expected = /^dist\/(index\.html|robots\.txt|_headers|favicon\.svg|assets\/[^/]+)$/;
const extra = files.filter((f) => !expected.test(f.replaceAll("\\", "/")));
// Cloudflare baut aus dem Git-Stand: Dateien, die nur lokal in public/ liegen und nicht eingecheckt sind, landen dort nicht im Build.
const tracked = (f) => {
  try {
    execSync(`git ls-files --error-unmatch "public/${f.replaceAll("\\", "/").replace(/^dist\//, "")}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const inRepo = extra.filter(tracked);
check("Keine unerwarteten Dateien im Build", inRepo.length === 0, inRepo.join(", "));
const localOnly = extra.filter((f) => !inRepo.includes(f));
if (localOnly.length) rows.push(["Nur lokal vorhanden, nicht im Git-Stand (Cloudflare veröffentlicht sie nicht)", "Hinweis", localOnly.join(", ")]);

const w = [0, 1].map((i) => Math.max(...rows.map((r) => r[i].length)));
for (const [a, b, c] of rows) console.log(`${a.padEnd(w[0])}  ${b.padEnd(w[1])}  ${c}`.trimEnd());
console.log(bad ? `\n${bad} Punkt(e) NICHT in Ordnung. So nicht veröffentlichen.` : `\nBuild in Ordnung (${files.length} Dateien geprüft).`);
process.exit(bad ? 1 : 0);
