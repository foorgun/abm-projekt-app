import { useData } from "../lib/store";
import type { ProjectDocument } from "../lib/types";
import { useToast } from "./Toast";

/**
 * Öffnet eine Datei aus dem privaten Speicher in einem neuen Tab (kurzlebiger Link vom Repo).
 * Liefert null, wenn das Repo keine Dateien öffnen kann (Demo-Modus: dort gibt es nur Angaben zur Datei).
 */
export function useOpenDocument(): ((doc: ProjectDocument) => void) | null {
  const { repo } = useData();
  const toast = useToast();
  if (!repo.documentUrl) return null;
  return (doc) => {
    // Tab sofort beim Klick öffnen, sonst blockiert der Browser ihn als Pop-up; die Adresse folgt, sobald der Link da ist
    const tab = window.open("about:blank", "_blank");
    repo.documentUrl!(doc).then(
      (url) => {
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else window.location.href = url;
      },
      (e) => {
        tab?.close();
        toast("Datei lässt sich nicht öffnen", "danger", e instanceof Error ? e.message : String(e));
      },
    );
  };
}
