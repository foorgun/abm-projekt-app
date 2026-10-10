// Screenshots der App bei 1280 px und 390 px Breite mit dem lokal installierten Chrome.
// Aufruf: node scripts/screenshots.mjs [baseUrl] [route ...]
//   z. B. node scripts/screenshots.mjs http://localhost:5173 / /styleguide
// Ausgabe: screenshots/<route>-<breite>.png (Ordner ist in .gitignore)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [base = "http://localhost:5173", ...routes] = process.argv.slice(2);
const targets = routes.length ? routes : ["/"];
const widths = [
  { name: "1280", width: 1280, height: 860 },
  { name: "390", width: 390, height: 844 },
];

mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
for (const w of widths) {
  const page = await browser.newPage({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${w.name} ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${w.name} console: ${m.text()}`));
  for (const route of targets) {
    await page.goto(`${base}/#${route}`, { waitUntil: "networkidle" });
    // warten, bis die Daten geladen sind (keine Lade-Platzhalter mehr), höchstens 5 s
    await page.waitForFunction(() => !document.querySelector(".skeleton"), null, { timeout: 5000 }).catch(() => errors.push(`${w.name} ${route}: lädt nach 5 s noch`));
    // Flächendiagramme blenden sich ein (ca. 1 s): erst danach aufnehmen
    await page.waitForTimeout((await page.locator(".area-chart").count()) ? 1400 : 200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`${w.name} ${route}: horizontal ${overflow}px Überlauf`);
    const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "dashboard";
    await page.screenshot({ path: `screenshots/${slug}-${w.name}.png`, fullPage: true });
    await page.screenshot({ path: `screenshots/${slug}-${w.name}-top.png` });
    // Mobil: zusätzlich mit geöffneter Navigation
    if (w.width < 1024 && route === targets[0]) {
      await page.click(".header-menu");
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/${slug}-${w.name}-drawer.png` });
      await page.keyboard.press("Escape");
    }
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? `Probleme:\n${errors.join("\n")}` : "Keine Konsolenfehler, kein horizontaler Überlauf.");
