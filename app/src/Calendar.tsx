// Calendar: the owner's events by month, by week, or as the agenda ahead.
// Month cells never change size; a busy day scrolls inside its cell.

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useState, type CSSProperties } from "react";
import type { CalendarEvent } from "@shared/types.ts";
import { EVENT_CATEGORIES } from "../../supabase/functions/_shared/events.ts";
import { API_BASE } from "./lib/api.ts";
import {
  addDays,
  addMonths,
  CATEGORY_COLOR,
  covers,
  dayKey,
  displayDay,
  displayMonth,
  monthGrid,
  today,
  useEvents,
  WEEKDAYS,
  weekStart,
} from "./lib/events.ts";
import { useSession } from "./lib/supabase.ts";
import { useLocalState } from "./lib/useLocalState.ts";

import "./calendar.css";

type View = "month" | "week" | "agenda";
const VIEWS: { value: View; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "agenda", label: "Agenda" },
];
const AGENDA_DAYS = 90;

const chipColor = (e: CalendarEvent) => `var(--mantine-color-${CATEGORY_COLOR[e.category]}-6)`;

function Chip({
  event,
  full,
  onOpen,
}: {
  event: CalendarEvent;
  /** Always show the title; the month grid hides it on phones. */
  full?: boolean;
  onOpen: (e: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      className="cal-chip"
      style={{ "--chip-color": chipColor(event) } as CSSProperties}
      title={`${event.ticker} · ${event.title}`}
      onClick={() => onOpen(event)}
    >
      <b>{event.ticker}</b>{" "}
      <span className={full ? undefined : "cal-chip-title"}>{event.title}</span>
    </button>
  );
}

function Month({
  month,
  events,
  onOpen,
}: {
  month: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const now = today();
  return (
    <div className="cal-grid">
      {WEEKDAYS.map((w) => (
        <div key={w} className="cal-head">
          {w}
        </div>
      ))}
      {monthGrid(month).map((d) => {
        const key = dayKey(d);
        return (
          <div
            key={key}
            className="cal-cell"
            data-outside={d.getMonth() !== month.getMonth() || undefined}
            data-today={key === now || undefined}
            data-past={key < now || undefined}
          >
            <div className="cal-day">{d.getDate()}</div>
            <div className="cal-events">
              {events
                .filter((e) => covers(e, key))
                .map((e) => (
                  <Chip key={e.id} event={e} onOpen={onOpen} />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Week({
  start,
  events,
  onOpen,
}: {
  start: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const now = today();
  return (
    <SimpleGrid cols={{ base: 1, sm: 7 }} spacing="xs">
      {WEEKDAYS.map((w, i) => {
        const d = addDays(start, i);
        const key = dayKey(d);
        const list = events.filter((e) => covers(e, key));
        return (
          <Paper
            key={key}
            withBorder
            p="xs"
            style={
              key === now
                ? { boxShadow: "inset 0 0 0 2px var(--mantine-primary-color-filled)" }
                : undefined
            }
          >
            <Text
              size="xs"
              c={key === now ? undefined : "dimmed"}
              fw={key === now ? 700 : 500}
              mb={4}
            >
              {w} {d.getDate()}
            </Text>
            <Stack gap={4}>
              {list.map((e) => (
                <Chip key={e.id} event={e} full onOpen={onOpen} />
              ))}
            </Stack>
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}

function Agenda({
  events,
  onOpen,
}: {
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const from = today();
  const to = dayKey(addDays(new Date(), AGENDA_DAYS));
  const ahead = events.filter((e) => (e.ends_on ?? e.starts_on) >= from && e.starts_on <= to);
  if (!ahead.length)
    return (
      <Text size="sm" c="dimmed">
        Nothing in the next {AGENDA_DAYS} days.
      </Text>
    );
  const days = [...new Set(ahead.map((e) => (e.starts_on < from ? from : e.starts_on)))].sort();
  return (
    <Stack gap="sm">
      {days.map((day) => (
        <Stack key={day} gap={4}>
          <Text size="xs" fw={700} c={day === from ? undefined : "dimmed"}>
            {day === from ? "Today" : displayDay(day)}
          </Text>
          {ahead
            .filter((e) => (e.starts_on < from ? from : e.starts_on) === day)
            .map((e) => (
              <Paper key={e.id} withBorder p="xs">
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <Badge
                    color={CATEGORY_COLOR[e.category]}
                    variant="light"
                    style={{ flex: "none" }}
                  >
                    {e.ticker}
                  </Badge>
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Anchor component="button" size="sm" ta="left" onClick={() => onOpen(e)}>
                      {e.title}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {e.kind ?? e.category}
                      {e.ends_on ? ` · until ${displayDay(e.ends_on)}` : ""}
                      {e.estimated ? " · estimated" : ""}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
            ))}
        </Stack>
      ))}
    </Stack>
  );
}

function Detail({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  return (
    <Modal opened={event !== null} onClose={onClose} title={event?.ticker} centered>
      {event && (
        <Stack gap="xs">
          <Group gap="xs">
            <Badge color={CATEGORY_COLOR[event.category]}>{event.category}</Badge>
            {event.kind && <Badge variant="outline">{event.kind}</Badge>}
            {event.estimated && (
              <Badge color="yellow" variant="light">
                estimated date
              </Badge>
            )}
            <Text size="sm" c="dimmed">
              {displayDay(event.starts_on)}
              {event.ends_on ? ` – ${displayDay(event.ends_on)}` : ""}
            </Text>
          </Group>
          <Text fw={600}>{event.title}</Text>
          {event.description && <Text size="sm">{event.description}</Text>}
          {(event.source || event.url) && (
            <Text size="xs" c="dimmed">
              Source:{" "}
              {event.url ? (
                <Anchor href={event.url} target="_blank" rel="noreferrer" size="xs">
                  {event.source ?? event.url}
                </Anchor>
              ) : (
                event.source
              )}
            </Text>
          )}
        </Stack>
      )}
    </Modal>
  );
}

export function CalendarPage() {
  const session = useSession();
  const { events, loading, error } = useEvents(session);
  const phone = useMediaQuery("(max-width: 48em)", false, { getInitialValueInEffect: false });
  const [stored, setView] = useLocalState<View | "">("calendar.view", "");
  const view: View = stored || (phone ? "agenda" : "month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  if (!session)
    return (
      <Alert title="Sign in to see your calendar">
        Events are private to your account. Your agent records them through the API; sign in from
        the profile menu.
      </Alert>
    );

  const step = (n: number) =>
    setCursor((c) => (view === "month" ? addMonths(c, n) : addDays(weekStart(c), 7 * n)));
  const start = weekStart(cursor);
  const title =
    view === "month"
      ? displayMonth(cursor)
      : view === "week"
        ? `${displayDay(dayKey(start))} – ${displayDay(dayKey(addDays(start, 6)))}`
        : `Next ${AGENDA_DAYS} days`;

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap={4} wrap="nowrap">
          {view !== "agenda" && (
            <>
              <ActionIcon variant="subtle" aria-label="Previous" onClick={() => step(-1)}>
                <IconChevronLeft size={18} />
              </ActionIcon>
              <ActionIcon variant="subtle" aria-label="Next" onClick={() => step(1)}>
                <IconChevronRight size={18} />
              </ActionIcon>
              <Button variant="subtle" size="compact-xs" onClick={() => setCursor(new Date())}>
                Today
              </Button>
            </>
          )}
          <Text fw={600} ml={4}>
            {title}
          </Text>
          {loading && <Loader size={14} ml={4} />}
        </Group>
        <SegmentedControl
          size="xs"
          data={VIEWS}
          value={view}
          onChange={(v) => setView(v as View)}
        />
      </Group>
      {error && <Alert color="red">{error}</Alert>}
      {view === "month" && <Month month={cursor} events={events} onOpen={setSelected} />}
      {view === "week" && <Week start={start} events={events} onOpen={setSelected} />}
      {view === "agenda" && <Agenda events={events} onOpen={setSelected} />}
      {!loading && !events.length && !error && (
        <Text size="sm" c="dimmed">
          Nothing on the calendar yet. Your agent records events through the API; the{" "}
          <Anchor href={`${API_BASE}/agent`} target="_blank" rel="noreferrer" size="sm">
            brief
          </Anchor>{" "}
          explains how.
        </Text>
      )}
      <Group gap={6}>
        {EVENT_CATEGORIES.map((c) => (
          <Badge key={c} size="xs" variant="light" color={CATEGORY_COLOR[c]}>
            {c}
          </Badge>
        ))}
      </Group>
      <Detail event={selected} onClose={() => setSelected(null)} />
    </Stack>
  );
}
