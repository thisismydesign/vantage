// Calendar rows for a signed-in owner, read through row security, plus the
// date arithmetic the views share. Dates are local calendar days, never instants.

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { CalendarEvent, EventCategory } from "@shared/types.ts";
import { supabase } from "./supabase.ts";

/** Fired on `window` after events changed elsewhere (settings, tests). */
export const EVENTS_CHANGED = "vantage:events-changed";

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  results: "indigo",
  corporate: "teal",
  milestone: "orange",
  external: "grape",
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
