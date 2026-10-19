import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useMemo, useState } from "react";
import type { NewsItem } from "@shared/types.ts";
import { API_BASE } from "./lib/api.ts";
import { DayHeading } from "./DayHeading.tsx";
import { dayKey } from "./lib/events.ts";
import { SENTIMENT_COLOR, useNews } from "./lib/news.ts";
import { useSession } from "./lib/supabase.ts";

/** The list can run to thousands. */
const PAGE_SIZE = 100;

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
          {/* The day heading carries the date; feeds rarely know the time. */}
          <Text size="xs" c="dimmed">
            {[
              item.source,
              item.sentiment,
              item.expected === null ? null : item.expected ? "expected" : "surprise",
            ]
              .filter(Boolean)
              .join(" · ")}
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
  const [limit, setLimit] = useState(PAGE_SIZE);
  const tickers = useMemo(() => [...new Set(items.map((i) => i.ticker))].sort(), [items]);
  const filtered = ticker ? items.filter((i) => i.ticker === ticker) : items;
  const shown = filtered.slice(0, limit);
  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of filtered) {
      const key = dayKey(new Date(item.published_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);
  const days = useMemo(() => {
    const byDay = new Map<string, NewsItem[]>();
    for (const item of shown) {
      const key = dayKey(new Date(item.published_at));
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return [...byDay.entries()];
  }, [shown]);

  return (
    <Stack gap="md">
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          <Text fz="xl" fw={700}>
            News
          </Text>
          {loading && <Loader size={14} />}
        </Group>
        {tickers.length > 1 && (
          <Select
            size="sm"
            w={180}
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
            agent instructions
          </Anchor>{" "}
          explain how.
        </Text>
      )}
      {days.map(([day, list]) => (
        <Stack key={day} gap={6}>
          <DayHeading day={day} count={perDay.get(day)} />
          {list.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </Stack>
      ))}
      {filtered.length > limit && (
        <Button variant="subtle" size="xs" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, filtered.length - limit)} more of {filtered.length - limit}
        </Button>
      )}
    </Stack>
  );
}
