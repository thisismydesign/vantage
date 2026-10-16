/** Axis tick helpers. Few, round, evenly spread labels — the Google Finance look. */

const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals));

/** Decimal places needed to print `step` exactly (0.25 → 2). */
export const stepDecimals = (step: number) => (String(step).split(".")[1] ?? "").length;

/**
 * Round values at a round step spanning [min, max]. Roughly `count` of them;
 * the first and last always enclose the data so the line never clips.
 */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) {
    const pad = Math.abs(min) * 0.005 || 1;
    return niceTicks(min - pad, max + pad, count);
  }
  const raw = (max - min) / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Number(
    ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw).toPrecision(12),
  );
  const decimals = stepDecimals(step);
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Bounded so a degenerate step (float noise) can never spin the main thread.
  for (let v = low, i = 0; v <= high + step / 2 && i < 50; v += step, i++)
    ticks.push(roundTo(v, decimals));
  return ticks;
}

/** Every k-th item from the first so at most `max` remain. */
export function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter((_, i) => i % step === 0);
}

/** Whole hours (exchange-local) inside [start, end], thinned to `max`. */
export function hourTicks(start: number, end: number, timeZone: string, max: number): number[] {
  const minute = new Intl.DateTimeFormat("en-GB", { timeZone, minute: "numeric" });
  const offset = Number(minute.format(start)) % 60;
  const first = start + ((60 - offset) % 60) * 60_000;
  const hours: number[] = [];
  for (let t = first; t <= end && hours.length < 24 * 14; t += 3_600_000) hours.push(t);
  return thin(hours, max);
}

/** Middle timestamp of each run of equal keys, thinned to `max`. */
export function groupMiddles(xs: number[], keys: string[], max: number): number[] {
  const middles: number[] = [];
  let start = 0;
  for (let i = 1; i <= keys.length; i++) {
    if (i === keys.length || keys[i] !== keys[start]) {
      middles.push((xs[start] + xs[i - 1]) / 2);
      start = i;
    }
  }
  return thin(middles, max);
}

export type DateUnit = "day" | "month" | "year";
const DAY_MS = 86_400_000;
/** Candidate calendar steps, finest first. Weeks start on Monday; months and years align to January. */
const DATE_STEPS: { unit: DateUnit; n: number; ms: number }[] = [
  { unit: "day", n: 1, ms: DAY_MS },
  { unit: "day", n: 2, ms: 2 * DAY_MS },
  { unit: "day", n: 7, ms: 7 * DAY_MS },
  { unit: "day", n: 14, ms: 14 * DAY_MS },
  { unit: "month", n: 1, ms: 30.4 * DAY_MS },
  { unit: "month", n: 2, ms: 60.9 * DAY_MS },
  { unit: "month", n: 3, ms: 91.3 * DAY_MS },
  { unit: "month", n: 6, ms: 182.6 * DAY_MS },
  { unit: "year", n: 1, ms: 365.25 * DAY_MS },
  { unit: "year", n: 2, ms: 730.5 * DAY_MS },
  { unit: "year", n: 5, ms: 1826 * DAY_MS },
];

/**
 * Round calendar boundaries (UTC) inside [start, end] at the finest step that
 * yields at most `max` of them, with the unit that names the step so labels
 * can match it.
 */
export function dateTicks(
  start: number,
  end: number,
  max: number,
): { ticks: number[]; unit: DateUnit } {
  let result = { ticks: [] as number[], unit: "year" as DateUnit };
  for (const step of DATE_STEPS) {
    result = { ticks: stepTicks(start, end, step), unit: step.unit };
    if (result.ticks.length <= Math.max(max, 1)) break;
  }
  return result;
}

function stepTicks(start: number, end: number, step: (typeof DATE_STEPS)[number]): number[] {
  const ticks: number[] = [];
  const from = new Date(start);
  const limit = () => ticks.length < 100;
  if (step.unit === "day") {
    // Multi-day steps land on Mondays so a week reads as a week.
    let t = Math.ceil(start / DAY_MS) * DAY_MS;
    if (step.n >= 7) t += ((8 - new Date(t).getUTCDay()) % 7) * DAY_MS;
    for (; t <= end && limit(); t += step.ms) ticks.push(t);
  } else if (step.unit === "month") {
    let y = from.getUTCFullYear();
    let m = Math.ceil((from.getUTCMonth() + (from.getUTCDate() > 1 ? 1 : 0)) / step.n) * step.n;
    for (let t = Date.UTC(y, m, 1); t <= end && limit(); t = Date.UTC(y, m, 1)) {
      if (t >= start) ticks.push(t);
      m += step.n;
      if (m >= 12) {
        y += Math.floor(m / 12);
        m %= 12;
      }
    }
  } else {
    const first = from.getUTCFullYear() + (start > Date.UTC(from.getUTCFullYear(), 0, 1) ? 1 : 0);
    for (
      let y = Math.ceil(first / step.n) * step.n;
      Date.UTC(y, 0, 1) <= end && limit();
      y += step.n
    )
      ticks.push(Date.UTC(y, 0, 1));
  }
  return ticks;
}
