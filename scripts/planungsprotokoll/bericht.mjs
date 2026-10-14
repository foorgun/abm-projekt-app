// Erzeugt docs/planungsprotokoll-felder.md aus den JSON-Inventaren (zuerst felder.mjs laufen lassen).
// Aufruf: node scripts/planungsprotokoll/bericht.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { VORLAGEN } from "./vorlagen.mjs";

const KLASSE = { vorbefuellbar: "vorbefüllbar", manuell: "manuell", ankreuzen: "ankreuzen" };
const zelle = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** Widgets eines Felds (Radio-Optionen, wiederholte Kopffelder) zu einer Zeile zusammenfassen. */
function zusammenfassen(widgets) {
  const map = new Map();
  for (const w of widgets) {
    const f = map.get(w.name);
    if (!f) map.set(w.name, { ...w, seiten: new Set([w.seite]), werte: w.exportwert ? [w.exportwert] : [], labels: w.beschriftung ? [w.beschriftung] : [] });
    else {
      f.seiten.add(w.seite);
      if (w.exportwert && !f.werte.includes(w.exportwert)) f.werte.push(w.exportwert);
      if (w.beschriftung && !f.labels.includes(w.beschriftung)) f.labels.push(w.beschriftung);
    }
  }
  return [...map.values()];
}

let md = `# Planungsprotokoll: Feld-Inventar der Vorlagen

Erzeugt mit \`node scripts/planungsprotokoll/felder.mjs && node scripts/planungsprotokoll/bericht.mjs\`
aus den AcroForm-PDFs in \`vorlagen/planungsprotokoll/\` (nicht im Repo). Maschinenlesbar je Widget:
\`docs/planungsprotokoll/<vorlage>.json\`. Feldwerte der Vorlagen werden nicht gelesen.

- **Beschriftung**: nächstgelegenes Textstück (Textfeld: links, sonst darüber; Ankreuzfeld: rechts). Heuristik,
  bei dicht gesetzten Zeilen gelegentlich das Nachbarwort.
- **Gruppe**: Radio-Gruppe (gemeinsamer Feldname) bzw. bei Einzel-Checkboxen die Zeile, auf der mehrere stehen.
- **Klasse**: vorbefüllbar (aus Projekt/Kontakt), manuell (Eingabe je Projekt), ankreuzen (Entscheidung).
- **Modell**: ja = Datenfeld vorhanden, teilweise = vorhanden, aber anders geschnitten, fehlt = nicht im Datenmodell.
- **Position**: x/y in pt, Ursprung unten links (A4 = 595 × 842 pt), erstes Widget.

`;

for (const v of VORLAGEN) {
  const d = JSON.parse(readFileSync(`docs/planungsprotokoll/${v.key}.json`, "utf8"));
  const felder = zusammenfassen(d.felder);
  const zaehl = (fn) => felder.filter(fn).length;
  const typen = {};
  for (const f of felder) typen[f.typ] = (typen[f.typ] ?? 0) + 1;
  md += `## ${v.firma}: ${v.titel}\n\n`;
  md += `${d.seiten} Seiten, ${felder.length} Felder (${d.widgets} Widgets): ${Object.entries(typen).map(([t, n]) => `${n} ${t}`).join(", ")}. `;
  md += `Vorbefüllbar ${zaehl((f) => f.klasse === "vorbefuellbar")} (davon im Modell: ja ${zaehl((f) => f.im_modell === "ja")}, teilweise ${zaehl((f) => f.im_modell === "teilweise")}, fehlt ${zaehl((f) => f.im_modell === "fehlt")}), `;
  md += `manuell ${zaehl((f) => f.klasse === "manuell")}, ankreuzen ${zaehl((f) => f.klasse === "ankreuzen")}.\n\n`;
  let abschnitt = null;
  for (const f of felder) {
    if (f.abschnitt !== abschnitt) {
      abschnitt = f.abschnitt;
      md += `\n### ${zelle(abschnitt)}\n\n| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |\n|---|---|---|---|---|---|---|---|---|---|\n`;
    }
    const seiten = [...f.seiten].join(", ");
    md += `| ${seiten} | ${zelle(f.name)} | ${f.typ} | ${Math.round(f.x)}/${Math.round(f.y)} | ${zelle(f.gruppe)} | ${zelle(f.labels.slice(0, 4).join(" / "))} | ${zelle(f.werte.join(", "))} | ${KLASSE[f.klasse]} | ${zelle(f.quelle)} | ${f.im_modell ?? ""} |\n`;
  }
  md += "\n";
}
writeFileSync("docs/planungsprotokoll-felder.md", md);
console.log("docs/planungsprotokoll-felder.md:", md.split("\n").length, "Zeilen");
