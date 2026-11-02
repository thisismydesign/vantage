const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function money(n: number, currency = "EUR", decimals = 0): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${n < 0 ? "-" : ""}${symbol}${abs}`;
}

export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

export const signedPct = (n: number, d = 1) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(d)}%`;

export const displayDate = (iso: string) =>
  iso.replace(/^\d{4}-\d{2}(?:-\d{2})?/, (date) => date.replaceAll("-", "."));

const ZONE = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" });

/** Ends with the browser's zone, so a reader abroad knows whose afternoon it is. */
export function displayDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const zone = ZONE.formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}${zone ? ` ${zone}` : ""}`;
}
