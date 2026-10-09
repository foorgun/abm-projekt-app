/** Begrüßung nach Tageszeit: bis 11 Uhr Morgen, 11 bis 17 Uhr Tag, ab 17 Uhr Abend. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}
