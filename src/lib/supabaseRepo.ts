// Platzhalter: Die Supabase-Anbindung wird in Schritt 8 neu geschrieben und gegen ein echtes Projekt geprüft
// (BUILD.md Abschnitt 9). Bis dahin meldet jede Methode einen klaren Fehler statt still Demo-Daten zu zeigen.

import type { Repo } from "./repo";

const NOT_YET = "Supabase-Anbindung folgt in Schritt 8. Ohne VITE_SUPABASE_URL läuft die App im Demo-Modus.";

export function createSupabaseRepo(): Repo {
  const fail = () => Promise.reject(new Error(NOT_YET));
  return {
    mode: "supabase",
    load: fail,
    setStepDate: fail,
    createProject: fail,
    setProjectStatus: fail,
    markInvoiceSent: fail,
    uploadDocument: fail,
    createTask: fail,
    updateTask: fail,
    setMailboxStatus: fail,
    saveAgentRule: fail,
    removeAgentRule: fail,
    saveAgentSettings: fail,
    saveMailbox: fail,
    runAgent: fail,
    resolveReview: fail,
    reportWrongFiling: fail,
  };
}
