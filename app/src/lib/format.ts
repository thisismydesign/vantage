const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function money(n: number, currency = "EUR", decimals = 0): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${n < 0 ? "-" : ""}${symbol}${abs}`;
}

export const eur = (n: number) => money(n, "EUR");

export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

export const signedPct = (n: number, d = 1) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(d)}%`;

export function num(v: string | number): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function daysUntil(iso: string, from = new Date()): number {
  const day = 24 * 60 * 60 * 1000;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${isoDate(from)}T00:00:00Z`);
  return Math.round((a - b) / day);
}

export const displayDate = (iso: string) =>
  iso.replace(/^\d{4}-\d{2}(?:-\d{2})?/, (date) => date.replaceAll("-", "."));

/** Instant rendered in the browser's zone as `YYYY.MM.DD HH:MM`. */
export function displayDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
