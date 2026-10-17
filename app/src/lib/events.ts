// Calendar rows for a signed-in owner, read through row security, plus the
// date arithmetic the views share. Dates are local calendar days, never instants.

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { CalendarEvent, EventCategory } from "@shared/types.ts";
import { supabase } from "./supabase.ts";

/** Fired on `window` after events changed elsewhere (settings, tests). */
export const EVENTS_CHANGED = "vantage:events-changed";

/**
 * Category identity. Validated as a set on the dark surface for colour-blind
 * and normal-vision separation (all pairs), and each holds white text at 4.5:1.
 */
export const CATEGORY_COLOR: Record<EventCategory, string> = {
  results: "#1c5cab",
  corporate: "#11845d",
  milestone: "#8e2f63",
  external: "#9a6a00",
};

export type EventsData = { events: CalendarEvent[]; loading: boolean; error?: string };

export function useEvents(session: Session | null): EventsData {
  const [data, setData] = useState<EventsData>({ events: [], loading: false });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(EVENTS_CHANGED, bump);
    return () => window.removeEventListener(EVENTS_CHANGED, bump);
  }, []);
  useEffect(() => {
    if (!session || !supabase) {
      setData({ events: [], loading: false });
      return;
    }
    let disposed = false;
    setData((d) => ({ ...d, loading: true }));
    (async () => {
      const rows: CalendarEvent[] = [];
      for (let from = 0; ; from += 1000) {
        const page = await supabase
          .from("events")
          .select("*")
          .order("starts_on")
          .order("ticker")
          .range(from, from + 999);
        if (page.error) throw new Error(page.error.message);
        rows.push(...((page.data ?? []) as CalendarEvent[]));
        if ((page.data?.length ?? 0) < 1000) break;
      }
      if (!disposed) setData({ events: rows, loading: false });
    })().catch((e) => {
      if (!disposed) setData({ events: [], loading: false, error: (e as Error).message });
    });
    return () => {
      disposed = true;
    };
  }, [session, version]);
  return data;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar day as YYYY-MM-DD. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dayKey(new Date());
export const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};
/** Monday of the week holding `d`. */
export const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
export const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Six Monday-first weeks covering the month, so every month is the same height. */
export function monthGrid(month: Date): Date[] {
  const first = weekStart(monthStart(month));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** An event covers every day from starts_on through ends_on inclusive. */
export const covers = (e: CalendarEvent, day: string) =>
  e.starts_on <= day && day <= (e.ends_on ?? e.starts_on);

export const displayMonth = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}`;
export const displayDay = (key: string) => key.replaceAll("-", ".");
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** An event's slot in one week row; lanes keep a multi-day bar on one line. */
export type Placed = { event: CalendarEvent; lane: number };

/**
 * Lanes for one week of days (YYYY-MM-DD, Monday first). Earlier and longer
 * events take the lower lanes. Returns, per day, the slots down to the
 * lowest lane used that day, with null where a lane is free.
 */
export function layoutWeek(days: string[], events: CalendarEvent[]): (Placed | null)[][] {
  const end = (e: CalendarEvent) => e.ends_on ?? e.starts_on;
  const length = (e: CalendarEvent) => Date.parse(end(e)) - Date.parse(e.starts_on);
  const week = events
    .filter((e) => e.starts_on <= days[6] && end(e) >= days[0])
    .sort(
      (a, b) =>
        a.starts_on.localeCompare(b.starts_on) ||
        length(b) - length(a) ||
        a.ticker.localeCompare(b.ticker),
    );
  const taken: boolean[][] = [];
  const slots: (Placed | null)[][] = days.map(() => []);
  for (const event of week) {
    const first = Math.max(
      0,
      days.findIndex((d) => d >= event.starts_on),
    );
    const last = days.reduce((at, d, i) => (d <= end(event) ? i : at), first);
    let lane = 0;
    while (taken[lane]?.slice(first, last + 1).some(Boolean)) lane++;
    taken[lane] ??= [];
    for (let i = first; i <= last; i++) {
      taken[lane][i] = true;
      slots[i][lane] = { event, lane };
    }
  }
  return slots.map((day) => Array.from(day, (slot) => slot ?? null));
}
