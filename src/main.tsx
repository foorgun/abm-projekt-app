import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import { App } from "./App";
import { applyTheme, followSystemTheme, readThemePref } from "./lib/theme";

// Setzt normalerweise schon public/theme-init.js; hier noch einmal, falls die Datei fehlt (z. B. im Test-Build)
applyTheme(readThemePref());
followSystemTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
