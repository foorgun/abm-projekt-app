import { lazy, Suspense, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { createBackend, type Backend } from "./lib/createRepo";
import { SessionProvider, useSession } from "./lib/session";
import { DataProvider } from "./lib/store";
import { Abwesenheit } from "./pages/Abwesenheit";
import { Dashboard } from "./pages/Dashboard";
import { Documents } from "./pages/Documents";
import { AgentDashboard } from "./pages/agent/AgentDashboard";
import { Mailboxes } from "./pages/agent/Mailboxes";
import { ReviewList } from "./pages/agent/ReviewList";
import { Help } from "./pages/Help";
import { Invoices } from "./pages/Invoices";
import { Login, NoRole, SessionError, SessionLoading } from "./pages/Login";
import { Pipeline } from "./pages/Pipeline";
import { Placeholder } from "./pages/Placeholder";
import { Projects } from "./pages/Projects";
import { Reports } from "./pages/Reports";
import { ProjectDetail } from "./pages/project/ProjectDetail";
import { Tasks } from "./pages/Tasks";

// Interne Seite für die Entwicklung (alle Bausteine auf einen Blick). Nur im Dev-Server: Die Bedingung ist beim Build fest,
// deshalb landet die Seite gar nicht erst im Produktions-Build.
const Styleguide = import.meta.env.DEV ? lazy(() => import("./pages/Styleguide").then((m) => ({ default: m.Styleguide }))) : null;

export function App() {
  // Demo-Modus: sofort da. Echtbetrieb: der Supabase-Teil wird nachgeladen.
  const [backend, setBackend] = useState<Backend | null>(() => {
    const b = createBackend();
    return b instanceof Promise ? null : b;
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (backend) return;
    let alive = true;
    Promise.resolve(createBackend()).then(
      (b) => alive && setBackend(b),
      (e) => alive && setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [backend]);
  if (loadError) return <StartError message={loadError} />;
  if (!backend) return <SessionLoading />;
  return (
    <SessionProvider auth={backend.auth}>
      <SessionGate>
        <DataProvider repo={backend.repo}>
          <HashRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="projekte" element={<Projects tab="alle" />} />
                <Route path="projekte/aktiv" element={<Projects tab="aktiv" />} />
                <Route path="projekte/abgeschlossen" element={<Projects tab="abgeschlossen" />} />
                <Route path="projekte/:id" element={<ProjectDetail />} />
                <Route path="pipeline" element={<Pipeline />} />
                <Route path="aufgaben" element={<Tasks />} />
                <Route path="dokumente" element={<Documents />} />
                <Route path="rechnungen" element={<Invoices />} />
                <Route path="auswertungen" element={<Reports />} />
                <Route path="abwesenheit" element={<Abwesenheit />} />
                <Route path="agent" element={<AgentDashboard />} />
                <Route path="agent/pruefung" element={<ReviewList />} />
                <Route path="agent/postfaecher" element={<Mailboxes />} />
                <Route path="einstellungen" element={<Placeholder title="Einstellungen" />} />
                <Route path="hilfe" element={<Help />} />
                {Styleguide && (
                  <Route
                    path="styleguide"
                    element={
                      <Suspense fallback={null}>
                        <Styleguide />
                      </Suspense>
                    }
                  />
                )}
                <Route path="*" element={<Placeholder title="Seite nicht gefunden" notFound />} />
              </Route>
            </Routes>
          </HashRouter>
        </DataProvider>
      </SessionGate>
    </SessionProvider>
  );
}

function StartError({ message }: { message: string }) {
  return (
    <main className="auth-page" role="alert">
      <div className="auth-card">
        <h1 className="auth-title">Die App konnte nicht starten</h1>
        <p className="auth-text">{message}</p>
      </div>
    </main>
  );
}

/** Im Echtbetrieb: Daten und App erst nach der Anmeldung mit zugewiesener Rolle. Im Demo-Modus immer durchlässig. */
function SessionGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === "laden") return <SessionLoading />;
  if (status === "abgemeldet") return <Login />;
  if (status === "ohne-rolle") return <NoRole />;
  if (status === "fehler") return <SessionError />;
  return <>{children}</>;
}
