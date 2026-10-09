// Welche Dateien die App ablegt. Gilt für Uploads und für den Posteingangs-Agenten.
// CAD-Dateien bleiben auf dem Fileserver (CLAUDE.md), ausführbare Dateien werden nie abgelegt (BUILD.md Abschnitt 7).

export const CAD_EXT = ["dwg", "dxf", "pln", "ndw", "nlib", "rvt", "ifc", "skp", "3dm"];
export const BLOCKED_EXT = ["exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "jar", "sh", "app", "dmg", "iso", "lnk", "reg", "hta"];
/** Maximale Größe je Datei (Supabase Storage Standardlimit 50 MB). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type FileCheck = { ok: true } | { ok: false; reason: string; kind: "cad" | "blocked" | "size" | "name" };

export function extension(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export function checkFile(name: string, size: number): FileCheck {
  const ext = extension(name);
  if (!name.trim() || /[\\/]/.test(name) || name.includes("..")) return { ok: false, kind: "name", reason: "Ungültiger Dateiname" };
  if (CAD_EXT.includes(ext)) return { ok: false, kind: "cad", reason: `CAD-Datei (.${ext}) bleibt auf dem Fileserver` };
  if (BLOCKED_EXT.includes(ext)) return { ok: false, kind: "blocked", reason: `Ausführbare Datei (.${ext}) wird nicht abgelegt` };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, kind: "size", reason: "Datei größer als 50 MB" };
  return { ok: true };
}

export function fileKind(name: string, mime?: string | null): "pdf" | "bild" | "office" | "mail" | "datei" {
  const ext = extension(name);
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["jpg", "jpeg", "png", "heic", "gif", "webp", "tif", "tiff"].includes(ext) || mime?.startsWith("image/")) return "bild";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods"].includes(ext)) return "office";
  if (["eml", "msg"].includes(ext)) return "mail";
  return "datei";
}
