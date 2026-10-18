/**
 * Currency conversion at the rate in force when each bar printed. Rates are quoted as USD→currency, so every conversion pivots through USD.
 */
export type BaseCurrency = "EUR" | "USD";
export const BASES: BaseCurrency[] = ["EUR", "USD"];

/** `[key, rate]` sorted by key; keys are ISO times or dates, compared as strings. */
export type RateSeries = [string, number][];
/** USD→currency series per currency code. USD itself needs no entry. */
export type RateBook = Record<string, RateSeries>;

/** Rate at `key`: the last bar at or before it, else the first bar on record. */
export function rateAt(series: RateSeries, key: string): number | null {
  if (!series.length) return null;
  let low = 0;
  let high = series.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (series[mid][0] <= key) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found >= 0 ? series[found][1] : series[0][1];
}

/** `value` in `native` at `key`, expressed in `base`; null when a rate is missing. */
export function convert(
  value: number,
  native: string,
  base: string,
  key: string,
  rates: RateBook,
): number | null {
  if (native === base) return value;
  const usdTo = (currency: string) => (currency === "USD" ? 1 : rateAt(rates[currency] ?? [], key));
  const toNative = usdTo(native);
  const toBase = usdTo(base);
  return toNative && toBase ? (value / toNative) * toBase : null;
}

/** Every point of a series in every base currency, aligned by index. */
export function convertSeries(
  points: [string, number][],
  native: string,
  rates: RateBook,
): Record<BaseCurrency, (number | null)[]> {
  return Object.fromEntries(
    BASES.map((base) => [
      base,
      points.map(([key, value]) => convert(value, native, base, key, rates)),
    ]),
  ) as Record<BaseCurrency, (number | null)[]>;
}
