import { useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { createRepo } from "./lib/createRepo";
import { SessionProvider } from "./lib/session";
import { DataProvider } from "./lib/store";
import { Dashboard } from "./pages/Dashboard";
import { Placeholder } from "./pages/Placeholder";
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
              <Route path="projekte" element={<Placeholder title="Alle Projekte" step="Schritt 4" />} />
              <Route path="projekte/aktiv" element={<Placeholder title="Aktive Projekte" step="Schritt 4" />} />
              <Route path="projekte/abgeschlossen" element={<Placeholder title="Abgeschlossene Projekte" step="Schritt 4" />} />
              <Route path="projekte/:id" element={<Placeholder title="Projekt" step="Schritt 5" />} />
              <Route path="pipeline" element={<Placeholder title="Pipeline" step="Schritt 4" />} />
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
