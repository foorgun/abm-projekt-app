import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useData } from "../../lib/store";
import { ToastProvider } from "../Toast";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const COLLAPSE_KEY = "abm.sidebar.collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const { alerts, dueTaskCount, reviewCount } = useData();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* Speicher nicht verfügbar: Einstellung gilt nur für diese Sitzung */
    }
  }, [collapsed]);

  // Drawer bei Navigation schließen, Seite nach oben
  useEffect(() => {
    setDrawer(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <ToastProvider>
      <div className="app" data-collapsed={collapsed} data-drawer={drawer ? "open" : "closed"}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onNavigate={() => setDrawer(false)}
          counts={{ tasks: dueTaskCount, review: reviewCount }}
        />
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden />
        <div className="app-main">
          <Header onOpenDrawer={() => setDrawer(true)} alerts={alerts} onNewProject={() => {}} onNewTask={() => {}} />
          <main className="app-content" id="inhalt">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
