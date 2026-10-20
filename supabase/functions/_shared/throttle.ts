import { db } from "./db.ts";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** At most `max` calls per `perMs`, which MUST NOT exceed a day. */
export type Limit = { max: number; perMs: number };

/** Records the call unless the caller, an address or a user id, is over the route's limit. */
export async function throttled(caller: string, route: string, limit: Limit) {
  const now = Date.now();
  // No window is longer than a day, so older rows go; the table stays a day long.
  await db
    .from("throttle")
    .delete()
    .lt("at", new Date(now - DAY_MS).toISOString());
  const { count } = await db
    .from("throttle")
    .select("id", { count: "exact", head: true })
    .eq("caller", caller)
    .eq("route", route)
    .gte("at", new Date(now - limit.perMs).toISOString());
  if ((count ?? 0) >= limit.max) return true;
  await db.from("throttle").insert({ caller, route });
  return false;
}
