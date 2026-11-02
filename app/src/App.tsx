import { Alert, Anchor, Group, Loader, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { BaseCurrency } from "@shared/api.ts";
import { CalendarPage } from "./Calendar.tsx";
import { Charts } from "./Charts.tsx";
import { NewsPage } from "./News.tsx";
import { ToolsPage } from "./Tools.tsx";
import { PortfolioPage } from "./Portfolio.tsx";
import { TradesPage } from "./Trades.tsx";
import { useChartData } from "./lib/api.ts";
import { buildPortfolio, buildTrades, pricingFrom, useBrokerData } from "./lib/broker.ts";
import { navigate, useSegments } from "./lib/route.ts";
import { supabase, useSession } from "./lib/supabase.ts";
import { OPEN_SIGN_IN } from "./Watchlist.tsx";

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

/** Addresses were fragments once (#/tools/margin); a link kept from then still opens. Call before the first render. */
export const adoptFragmentAddress = () => {
  const path = window.location.hash.replace(/^#\/?/, "/");
  if (isPage(path.split("/")[1]))
    window.history.replaceState(null, "", path + window.location.search);
};

export function usePage(): [Page, (p: Page) => void] {
  // Pages may read later segments (/tools/margin).
  const [first] = useSegments();
  return [isPage(first) ? first : "watchlist", (p) => navigate(`/${p}`)];
}

const baseOf = (currency: string | null | undefined): BaseCurrency =>
  currency === "USD" ? "USD" : "EUR";

const LIMITED = "Too many requests from this address. Try again in a few minutes, or sign in.";

function BrokerPages({ page }: { page: "portfolio" | "trades" }) {
  const session = useSession();
  const broker = useBrokerData(session);
  const [cycle, setCycle] = useState(() => Date.now());
  // Signed out, prices refresh only on demand, which keeps visitors well inside the rate limit.
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => !document.hidden && setCycle(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [session]);
  const charts = useChartData("1d", cycle, session);
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

  if (broker.snapshot && !live && charts.status === "failed")
    return (
      <Alert color={charts.limited ? "yellow" : "red"} title="Prices unavailable">
        {charts.limited ? LIMITED : "The charts service did not respond. Reload to retry."}
      </Alert>
    );
  if ((broker.loading && !broker.snapshot) || (broker.snapshot && !live))
    return (
      <Group gap="sm">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {broker.snapshot ? "Loading prices…" : "Loading broker data…"}
        </Text>
      </Group>
    );
  const unavailable = broker.error && (
    <Alert color="red" title="Broker data unavailable">
      {broker.error}
    </Alert>
  );
  const stale = charts.status === "failed" && (
    <Alert color="yellow" py="xs" mb="md">
      <Text size="sm">
        {charts.limited ? LIMITED : "Refreshing prices failed."} Showing the last prices.
      </Text>
    </Alert>
  );
  if (page === "portfolio") {
    if (!built)
      return (
        unavailable || (
          <Alert title="No statement yet">
            Your agent sends broker statements through the API; the latest one shows here.
          </Alert>
        )
      );
    return (
      <>
        {stale}
        <PortfolioPage
          built={built}
          history={broker.history}
          snapshot={broker.snapshot!}
          fills={broker.fills}
          day={live!}
          base={base}
          cycle={cycle}
          stale={charts.stale}
        />
      </>
    );
  }
  if (!trades)
    return (
      unavailable || (
        <Alert title="No trades yet">
          Your agent sends your fills through the API; they show here.
        </Alert>
      )
    );
  return (
    <>
      {stale}
      <TradesPage trades={trades} pricing={pricing} nav={broker.snapshot?.nav ?? null} />
    </>
  );
}

function PageContent({ page }: { page: Page }) {
  if (page === "watchlist") return <Charts header={false} />;
  if (page === "calendar") return <CalendarPage />;
  if (page === "news") return <NewsPage />;
  if (page === "tools") return <ToolsPage />;
  return <BrokerPages page={page} />;
}

/** `page` is a prop so a host app can own navigation. */
export function Vantage({ page }: { page: Page }) {
  const session = useSession();
  return (
    <>
      {session === null && supabase && (
        <Alert variant="light" py="xs" mb="md">
          <Text size="sm" ta="center">
            You are looking at a demo account.{" "}
            <Anchor
              component="button"
              size="sm"
              onClick={() => window.dispatchEvent(new Event(OPEN_SIGN_IN))}
            >
              Sign up to customize.
            </Anchor>
          </Text>
        </Alert>
      )}
      <PageContent page={page} />
    </>
  );
}
