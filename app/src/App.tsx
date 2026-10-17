// Vantage's pages. The host owns navigation: standalone it is the URL hash
// (see useHashPage); a host app may drive `page` itself.

import { Alert, Group, Loader, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { BaseCurrency } from "@shared/types.ts";
import { CalendarPage } from "./Calendar.tsx";
import { Charts } from "./Charts.tsx";
import { NewsPage } from "./News.tsx";
import { ToolsPage } from "./Tools.tsx";
import { PortfolioPage } from "./Portfolio.tsx";
import { TradesPage } from "./Trades.tsx";
import { useChartData } from "./lib/api.ts";
import { buildPortfolio, buildTrades, pricingFrom, useBrokerData } from "./lib/broker.ts";
import { useSession } from "./lib/supabase.ts";

export const PAGES = [
  { value: "watchlist", label: "Watchlist" },
  { value: "portfolio", label: "Portfolio" },
  { value: "trades", label: "Trades" },
  { value: "calendar", label: "Calendar" },
  { value: "news", label: "News" },
  { value: "tools", label: "Tools" },
] as const;
export type Page = (typeof PAGES)[number]["value"];
export const isPage = (v: string): v is Page => PAGES.some((p) => p.value === v);

/** Standalone routing: `#/portfolio`; anything else is the watchlist. */
export function useHashPage(): [Page, (p: Page) => void] {
  const read = () => {
    // The first segment is the page; a page may read the rest (#/tools/margin).
    const h = window.location.hash.replace(/^#\/?/, "").split("/")[0];
    return isPage(h) ? h : "watchlist";
  };
  const [page, setPage] = useState<Page>(read);
  useEffect(() => {
    const onChange = () => setPage(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [page, (p) => (window.location.hash = `/${p}`)];
}

/** The account's own currency when the charts can convert to it, else euros. */
const baseOf = (currency: string | null | undefined): BaseCurrency =>
  currency === "USD" ? "USD" : "EUR";

function BrokerPages({ page }: { page: "portfolio" | "trades" }) {
  const session = useSession();
  const broker = useBrokerData(session);
  // Prices for the holdings come from the same 1D series the charts show.
  const [cycle, setCycle] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => !document.hidden && setCycle(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const charts = useChartData("1d", cycle, session?.access_token);
  const live = charts.data?.range === "1d" ? charts.data : undefined;
  const base = baseOf(broker.snapshot?.base_currency);
  const pricing = useMemo(() => pricingFrom(live?.series, base), [live, base]);
  const built = useMemo(
    () =>
      broker.snapshot && live
        ? buildPortfolio(broker.snapshot, live.items, live.themes, pricing, base)
        : null,
    [broker.snapshot, live, pricing, base],
  );
  const trades = useMemo(
    () => (live && broker.fills.length ? buildTrades(broker.fills, live.items, base) : null),
    [broker.fills, live, base],
  );

  if (!session)
    return (
      <Alert title="Sign in to see your portfolio">
        Positions and trades are private to your account. Sign in from the profile menu.
      </Alert>
    );
  if (broker.loading && !broker.snapshot)
    return (
      <Group gap="sm">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Loading broker data…
        </Text>
      </Group>
    );
  if (page === "portfolio") {
    if (!built)
      return (
        <Alert title="No statement yet">
          Your agent sends broker statements through the API; the latest one shows here.
        </Alert>
      );
    return <PortfolioPage built={built} items={live!.items} themes={live!.themes} />;
  }
  if (!trades)
    return (
      <Alert title="No trades yet">
        Your agent sends your fills through the API; they show here.
      </Alert>
    );
  return <TradesPage trades={trades} pricing={pricing} nav={broker.snapshot?.nav ?? null} />;
}

export function Vantage({ page }: { page: Page }) {
  if (page === "watchlist") return <Charts header={false} />;
  if (page === "calendar") return <CalendarPage />;
  if (page === "news") return <NewsPage />;
  if (page === "tools") return <ToolsPage />;
  return <BrokerPages page={page} />;
}
