export type BaseCurrency = "EUR" | "USD";
export const BASES: BaseCurrency[] = ["EUR", "USD"];

/** `[key, rate]` sorted by key; keys are ISO times or dates, compared as strings. */
export type RateSeries = [string, number][];
/** USD→currency series per currency code. USD itself needs no entry. */
export type RateBook = Record<string, RateSeries>;

export function rateAt(series: RateSeries, key: string): number | null {
  if (!series.length) return null;
  let low = 0;
  let high = series.length - 1;
  let atOrBefore = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (series[mid][0] <= key) {
      atOrBefore = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return atOrBefore >= 0 ? series[atOrBefore][1] : series[0][1];
}

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
