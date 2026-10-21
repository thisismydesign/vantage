/**
 * Time-weighted return since the first row, so deposits don't read as gains. IBKR PortfolioAnalyst's convention, which its own figure matches: a flow counts at the start of its day, and the first row's flow is already in its value.
 * Null when a later row's flow is unknown.
 */
export function timeWeighted(rows: { nav: number; flow: number | null }[]): number[] | null {
  if (rows.slice(1).some((r) => r.flow == null)) return null;
  let growth = 1;
  return rows.map((r, i) => {
    const start = i === 0 ? 0 : rows[i - 1].nav + r.flow!;
    if (start > 0) growth *= r.nav / start;
    return growth - 1;
  });
}

/** The change in value that isn't money moved in or out; null when a flow is unknown. */
export function gain(rows: { nav: number; flow: number | null }[]): number | null {
  if (rows.length < 2) return null;
  const flows = rows.slice(1).map((r) => r.flow);
  if (flows.some((f) => f == null)) return null;
  return rows.at(-1)!.nav - rows[0].nav - flows.reduce((sum: number, f) => sum + f!, 0);
}

export const netFlows = (rows: { flow: number | null }[]) =>
  rows.slice(1).reduce((sum, r) => sum + (r.flow ?? 0), 0);
