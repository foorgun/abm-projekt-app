import { useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { createRepo } from "./lib/createRepo";
import { SessionProvider } from "./lib/session";
import { DataProvider } from "./lib/store";
import { Dashboard } from "./pages/Dashboard";
import { AgentDashboard } from "./pages/agent/AgentDashboard";
import { Mailboxes } from "./pages/agent/Mailboxes";
import { ReviewList } from "./pages/agent/ReviewList";
import { Invoices } from "./pages/Invoices";
import { Pipeline } from "./pages/Pipeline";
import { Placeholder } from "./pages/Placeholder";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/project/ProjectDetail";
import { Styleguide } from "./pages/Styleguide";
import { Tasks } from "./pages/Tasks";

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
              <Route path="aufgaben" element={<Tasks />} />
              <Route path="rechnungen" element={<Invoices />} />
              <Route path="agent" element={<AgentDashboard />} />
              <Route path="agent/pruefung" element={<ReviewList />} />
              <Route path="agent/postfaecher" element={<Mailboxes />} />
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
