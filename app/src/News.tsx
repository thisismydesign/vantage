// News: what the owner's agent recorded about the companies they follow,
// newest first, one group per day, filterable by company.

import { Alert, Anchor, Badge, Group, Loader, Paper, Select, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import type { NewsItem } from "@shared/types.ts";
import { API_BASE } from "./lib/api.ts";
import { dayKey, displayDay, today } from "./lib/events.ts";
import { displayDateTime } from "./lib/format.ts";
import { SENTIMENT_COLOR, useNews } from "./lib/news.ts";
import { useSession } from "./lib/supabase.ts";

function Row({ item }: { item: NewsItem }) {
  const color = item.sentiment ? SENTIMENT_COLOR[item.sentiment] : undefined;
  return (
    <Paper withBorder p="xs">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Badge color={color} variant={item.sentiment ? "filled" : "light"} style={{ flex: "none" }}>
          {item.ticker}
        </Badge>
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          {item.url ? (
            <Anchor href={item.url} target="_blank" rel="noreferrer" size="sm" fw={500}>
              {item.title}
            </Anchor>
          ) : (
            <Text size="sm" fw={500}>
              {item.title}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {displayDateTime(item.published_at)}
            {item.source ? ` · ${item.source}` : ""}
            {item.sentiment ? ` · ${item.sentiment}` : ""}
            {item.expected === null ? "" : item.expected ? " · expected" : " · surprise"}
          </Text>
          {item.description && (
            <Text size="sm" c="dimmed">
              {item.description}
            </Text>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}

export function NewsPage() {
  const session = useSession();
  const { items, loading, error } = useNews(session);
  const [ticker, setTicker] = useState<string | null>(null);
  const tickers = useMemo(() => [...new Set(items.map((i) => i.ticker))].sort(), [items]);
  const shown = ticker ? items.filter((i) => i.ticker === ticker) : items;
  const days = useMemo(() => {
    const byDay = new Map<string, NewsItem[]>();
    for (const item of shown) {
      const key = dayKey(new Date(item.published_at));
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return [...byDay.entries()];
  }, [shown]);

  if (!session)
    return (
      <Alert title="Sign in to see your news">
        News is private to your account. Your agent records it through the API; sign in from the
        profile menu.
      </Alert>
    );
  return (
    <Stack gap="sm">
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          <Text fw={600}>News</Text>
          {loading && <Loader size={14} />}
        </Group>
        {tickers.length > 1 && (
          <Select
            size="xs"
            w={160}
            placeholder="All companies"
            clearable
            searchable
            data={tickers}
            value={ticker}
            onChange={setTicker}
            aria-label="Company"
          />
        )}
      </Group>
      {error && <Alert color="red">{error}</Alert>}
      {!loading && !items.length && !error && (
        <Text size="sm" c="dimmed">
          No news yet. Your agent records items through the API; the{" "}
          <Anchor href={`${API_BASE}/agent`} target="_blank" rel="noreferrer" size="sm">
            brief
          </Anchor>{" "}
          explains how.
        </Text>
      )}
      {days.map(([day, list]) => (
        <Stack key={day} gap={4}>
          <Text size="xs" fw={700} c={day === today() ? undefined : "dimmed"}>
            {day === today() ? "Today" : displayDay(day)}
          </Text>
          {list.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
