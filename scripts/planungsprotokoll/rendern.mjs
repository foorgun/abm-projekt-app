// Rendert Seite 1 der befüllten PDFs mit pdf.js als PNG. pdf.js zeichnet die gespeicherten Feld-Erscheinungsbilder
// (wie Acrobat); macOS Vorschau zeichnet Felder selbst neu und bricht anders um.
// @napi-rs/canvas kommt als optionale Abhängigkeit von pdfjs-dist mit.
// Aufruf: node scripts/planungsprotokoll/rendern.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { VORLAGEN } from "./vorlagen.mjs";

const OUT = "screenshots/planungsprotokoll";
for (const v of VORLAGEN) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`${OUT}/${v.key}-seite1.pdf`)), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport, annotationMode: pdfjs.AnnotationMode.ENABLE }).promise;
  writeFileSync(`${OUT}/${v.key}-seite1-pdfjs.png`, canvas.toBuffer("image/png"));
  console.log(`${OUT}/${v.key}-seite1-pdfjs.png`);
  await doc.destroy();
}
