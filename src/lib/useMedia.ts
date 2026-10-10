import { useEffect, useState } from "react";

/** true, solange die Media-Query zutrifft (z. B. "(max-width: 640px)"). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** Schmale Ansicht (Handy): unter 640 px. */
export const NARROW = "(max-width: 640px)";
