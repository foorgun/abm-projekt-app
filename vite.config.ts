/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { verweistAufProduction } from "./scripts/lib/ziele";

export default defineConfig(({ command, mode }) => {
  // Der Entwicklungsserver hängt nie an production, egal woher die Werte kommen
  if (command === "serve" && verweistAufProduction(loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL)) {
    throw new Error("Der Entwicklungsserver darf nicht mit production verbunden werden. Siehe docs/umgebungen.md.");
  }
  return {
    plugins: [react()],
    base: "./",
    test: {
      include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
      environment: "node",
    },
  };
});
