// Einfache Textextraktion im Browser, ohne Bibliothek und ohne Netzwerk.
// Reicht für den Mock: Text-PDFs mit einfachen Schriften und DOCX. Gescannte PDFs und Bilder liefern keinen Text.

async function inflate(bytes: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const latin1 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
};

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** Klammer-Zeichenkette eines PDF-Inhaltsstroms entschlüsseln (Escapes, Oktalwerte). */
function pdfString(raw: string): string {
  return raw.replace(/\\(\d{1,3}|[\s\S])/g, (_, c: string) => {
    if (/^\d/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return ({ n: "\n", r: "", t: " ", b: "", f: "", "\n": "" } as Record<string, string>)[c] ?? c;
  });
}

// Text aus einem Inhaltsstrom: Tj, TJ und ' schreiben Text; Td, TD, T* und ET beginnen eine neue Zeile.
export function textFromContentStream(content: string): string {
  let out = "";
  const re = /\((?:\\[\s\S]|[^\\)])*\)|\[(?:\((?:\\[\s\S]|[^\\)])*\)|[^\]])*\]\s*TJ|\b(?:Td|TD|T\*|ET|Tj|')(?![A-Za-z])/g;
  let pending = "";
  for (const m of content.matchAll(re)) {
    const tok = m[0];
    if (tok.startsWith("(")) pending = pdfString(tok.slice(1, -1));
    else if (tok.startsWith("[")) {
      // Feld aus Textstücken und Abständen; große negative Abstände sind Wortzwischenräume
      for (const part of tok.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g)) {
        if (part[1] !== undefined) out += pdfString(part[1]);
        else if (Number(part[2]) < -200) out += " ";
      }
    } else if (tok === "Tj" || tok === "'") {
      if (tok === "'") out += "\n";
      out += pending;
      pending = "";
    } else if (!out.endsWith("\n")) out += "\n";
  }
  return out;
}

/**
 * Text je Seite eines PDFs. Vereinfachung: jeder Inhaltsstrom mit Text zählt als eine Seite
 * (stimmt für übliche Verträge aus Word; bei mehreren Strömen je Seite ist die Seitenzahl nur ein Anhaltspunkt).
 */
export async function pdfPages(buffer: ArrayBuffer): Promise<string[]> {
  const bytes = new Uint8Array(buffer);
  const raw = latin1(bytes);
  const pages: string[] = [];
  const re = /<<((?:[^<>]|<<[^<>]*>>|<[^<>]*>)*)>>\s*stream\r?\n/g;
  for (const m of raw.matchAll(re)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const dict = m[1];
    if (/\/Subtype\s*\/Image|\/Type\s*\/(XRef|ObjStm|Metadata)|\/FontFile|\/Length1/.test(dict)) continue;
    // Länge aus dem Verzeichnis, wenn sie direkt angegeben ist; sonst bis "endstream" ohne den Zeilenumbruch davor
    const length = Number(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1] ?? NaN);
    let stop = end;
    while (stop > start && (bytes[stop - 1] === 10 || bytes[stop - 1] === 13)) stop--;
    let data: Uint8Array = bytes.subarray(start, length > 0 && start + length <= end ? start + length : stop);
    if (/\/FlateDecode/.test(dict)) {
      try {
        data = await inflate(data, "deflate");
      } catch {
        continue; // beschädigt oder mit weiterem Filter: überspringen
      }
    } else if (/\/Filter/.test(dict)) continue;
    const content = latin1(data);
    if (!/\bBT\b/.test(content)) continue;
    const text = textFromContentStream(content).trim();
    if (text) pages.push(text);
  }
  return pages;
}

// ---------------------------------------------------------------------------
// DOCX (ZIP mit word/document.xml)
// ---------------------------------------------------------------------------

/** Eine Datei aus einem ZIP lesen (über das Inhaltsverzeichnis am Ende; gespeichert oder Deflate). */
export async function zipEntry(buffer: ArrayBuffer, path: string): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let i = 0; i + 46 <= bytes.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    const method = view.getUint16(i + 10, true);
    const size = view.getUint32(i + 20, true);
    const nameLen = view.getUint16(i + 28, true);
    const extraLen = view.getUint16(i + 30, true);
    const commentLen = view.getUint16(i + 32, true);
    const offset = view.getUint32(i + 42, true);
    const name = latin1(bytes.subarray(i + 46, i + 46 + nameLen));
    if (name === path) {
      const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      const data = bytes.subarray(dataStart, dataStart + size);
      if (method === 0) return data;
      if (method === 8) return inflate(data, "deflate-raw");
      return null;
    }
    i += 45 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Fließtext aus word/document.xml: Absätze und Zeilenumbrüche werden Zeilen, Tabulatoren Leerzeichen. */
export function textFromDocumentXml(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, " ")
    .replace(/<w:br\b[^>]*\/>|<\/w:p>|<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export async function docxText(buffer: ArrayBuffer): Promise<string> {
  const entry = await zipEntry(buffer, "word/document.xml");
  return entry ? textFromDocumentXml(new TextDecoder("utf-8").decode(entry)) : "";
}
