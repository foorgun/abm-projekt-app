const DAY_MS = 86_400_000;

function parse(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Heutiges Datum in der Zeitzone des Browsers als "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Ganze Tage von `fromIso` bis `toIso` (negativ, wenn `fromIso` später liegt). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parse(toIso) - parse(fromIso)) / DAY_MS);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function formatMonth(iso: string | null | undefined): string {
  if (!iso) return "Ohne Monat";
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatMonthShort(iso: string): string {
  return MONTHS_SHORT[Number(iso.split("-")[1]) - 1];
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${MONTHS[Number(m) - 1]} ${y}`;
}

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const euroExact = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatMoney(cents: number): string {
  return cents % 100 === 0 ? euro.format(cents / 100) : euroExact.format(cents / 100);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** ISO-Datum plus `days` Tage (negativ = zurück). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Erster Tag des Monats eines ISO-Datums. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Relative Zeitangabe: "gerade eben", "vor 12 Min.", "vor 3 Std.", "gestern, 14:05", "vor 4 Tagen", sonst Datum. */
export function formatRelative(atIso: string, now: Date = new Date()): string {
  const at = new Date(atIso.length <= 10 ? `${atIso}T12:00:00` : atIso);
  const diffMin = Math.round((now.getTime() - at.getTime()) / 60000);
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const days = daysBetween(todayIso(at), todayIso(now));
  if (diffMin < 0) return formatDate(todayIso(at));
  if (diffMin < 1) return "gerade eben";
  if (days === 0 && diffMin < 60) return `vor ${diffMin} Min.`;
  if (days === 0) return `heute, ${time}`;
  if (days === 1) return `gestern, ${time}`;
  if (days < 7) return `vor ${days} Tagen`;
  return formatDate(todayIso(at));
}
