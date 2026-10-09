import { useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { createRepo } from "./lib/createRepo";
import { SessionProvider } from "./lib/session";
import { DataProvider } from "./lib/store";
import { Dashboard } from "./pages/Dashboard";
import { Pipeline } from "./pages/Pipeline";
import { Placeholder } from "./pages/Placeholder";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/project/ProjectDetail";
import { Styleguide } from "./pages/Styleguide";

export function App() {
  const [repo] = useState(createRepo);
  return (
    <SessionProvider>
      <DataProvider repo={repo}>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="projekte" element={<Projects tab="alle" />} />
              <Route path="projekte/aktiv" element={<Projects tab="aktiv" />} />
              <Route path="projekte/abgeschlossen" element={<Projects tab="abgeschlossen" />} />
              <Route path="projekte/:id" element={<ProjectDetail />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="aufgaben" element={<Placeholder title="Aufgaben" step="Schritt 6" />} />
              <Route path="rechnungen" element={<Placeholder title="Rechnungen" step="Schritt 3–6" />} />
              <Route path="agent" element={<Placeholder title="Agent-Dashboard" step="Schritt 7" />} />
              <Route path="agent/pruefung" element={<Placeholder title="Prüfliste" step="Schritt 7" />} />
              <Route path="agent/postfaecher" element={<Placeholder title="Postfächer" step="Schritt 7" />} />
              <Route path="einstellungen" element={<Placeholder title="Einstellungen" step="Schritt 8" />} />
              <Route path="hilfe" element={<Placeholder title="Hilfe" step="Schritt 10" />} />
              <Route path="styleguide" element={<Styleguide />} />
              <Route path="*" element={<Placeholder title="Seite nicht gefunden" step="–" />} />
            </Route>
          </Routes>
        </HashRouter>
      </DataProvider>
    </SessionProvider>
  );
}
