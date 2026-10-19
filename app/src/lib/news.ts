import { useEffect, useState } from "react";
import type { NewsItem, Sentiment } from "@shared/types.ts";
import { demoNews } from "./demo.ts";
import { supabase, type SessionState } from "./supabase.ts";
import { TONE } from "../theme.ts";

export const NEWS_CHANGED = "vantage:news-changed";

export const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: TONE.positive,
  negative: TONE.negative,
  neutral: TONE.neutral,
  mixed: TONE.warning,
};

export type NewsData = { items: NewsItem[]; loading: boolean; error?: string };

export function useNews(session: SessionState): NewsData {
  const [data, setData] = useState<NewsData>({ items: [], loading: false });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(NEWS_CHANGED, bump);
    return () => window.removeEventListener(NEWS_CHANGED, bump);
  }, []);
  useEffect(() => {
    if (session === undefined) {
      setData({ items: [], loading: true });
      return;
    }
    if (!session || !supabase) {
      setData({ items: demoNews(), loading: false });
      return;
    }
    let disposed = false;
    setData((d) => ({ ...d, loading: true }));
    (async () => {
      const rows: NewsItem[] = [];
      for (let from = 0; ; from += 1000) {
        const page = await supabase
          .from("news")
          .select("*")
          .order("published_at", { ascending: false })
          .range(from, from + 999);
        if (page.error) throw new Error(page.error.message);
        rows.push(...((page.data ?? []) as NewsItem[]));
        if ((page.data?.length ?? 0) < 1000) break;
      }
      if (!disposed) setData({ items: rows, loading: false });
    })().catch((e) => {
      if (!disposed) setData({ items: [], loading: false, error: (e as Error).message });
    });
    return () => {
      disposed = true;
    };
  }, [session, version]);
  return data;
}
