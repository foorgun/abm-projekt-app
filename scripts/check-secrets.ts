// Commit-Sperre: keine lokale Umgebungsdatei und kein Schlüssel im Repo. Läuft als pre-commit-Hook (.githooks) und in der CI.
// Greift auch bei "git add -f". Gibt nur Datei, Zeile und Art aus, nie den gefundenen Wert.
//   npm run check:secrets                alle eingecheckten Dateien (CI)
//   npm run check:secrets -- --staged    nur das, was gerade committet würde (Hook)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { findSecrets, forbiddenPath, MUST_BE_IGNORED } from "./lib/secretGuard";

const staged = process.argv.includes("--staged");

const gitFiles = (args: string[]) =>
  execFileSync("git", [...args, "-z"], { encoding: "utf8", maxBuffer: 1 << 26 }).split("\0").filter(Boolean);

const read = (path: string): Buffer | null => {
  if (staged) return execFileSync("git", ["show", `:${path}`], { maxBuffer: 1 << 28 });
  return existsSync(path) ? readFileSync(path) : null;
};

const problems: string[] = [];

for (const path of MUST_BE_IGNORED) {
  if (spawnSync("git", ["check-ignore", "-q", "--no-index", path]).status !== 0) problems.push(`${path}: steht nicht in .gitignore`);
}

const files = staged ? gitFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]) : gitFiles(["ls-files"]);
for (const path of files) {
  const what = forbiddenPath(path);
  if (what) problems.push(`${path}: ${what}, darf nicht ins Repo`);
  const content = read(path);
  if (!content || content.includes(0)) continue; // Binärdateien nicht durchsuchen
  for (const hit of findSecrets(content.toString("utf8"))) problems.push(`${path}:${hit.line}: sieht aus wie ${hit.what}`);
}

if (problems.length) {
  console.error(`Commit-Sperre: ${problems.length} Problem(e)\n${problems.map((p) => `  ${p}`).join("\n")}`);
  console.error("Datei aus dem Commit nehmen (git restore --staged <datei>). Stand ein echter Schlüssel schon in einem Commit: widerrufen und neu erzeugen.");
  process.exit(1);
}
console.log(`Commit-Sperre: ${files.length} Datei(en) geprüft, in Ordnung.`);
