import type { Tone } from "../components/ui/Pill";
import type { Severity } from "./alerts";

export const SEVERITY_LABEL: Record<Severity, string> = { dringend: "Dringend", hinweis: "Hinweis", info: "Info" };
export const SEVERITY_TONE: Record<Severity, Tone> = { dringend: "danger", hinweis: "warn", info: "info" };
