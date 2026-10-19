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
import { EVENT_CATEGORIES, type CalendarEvent } from "@shared/tables.ts";
import { DayHeading } from "./DayHeading.tsx";
import { API_BASE } from "./lib/api.ts";
import {
  addDays,
  addMonths,
  CATEGORY_COLOR,
  covers,
  dayKey,
  displayDay,
  displayMonth,
  layoutWeek,
  monthGrid,
  today,
  useEvents,
  WEEKDAYS,
  weekStart,
} from "./lib/events.ts";
import { useSession } from "./lib/supabase.ts";
import { useLocalState } from "./lib/useLocalState.ts";

import "./calendar.css";

type View = "month" | "week" | "list";
const VIEWS: { value: View; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "list", label: "List" },
];
const LIST_DAYS = 30;

function Chip({
  event,
  named = true,
  fromPreviousDay,
  intoNextDay,
  alwaysShowTitle,
  onOpen,
}: {
  event: CalendarEvent;
  named?: boolean;
  fromPreviousDay?: boolean;
  intoNextDay?: boolean;
  alwaysShowTitle?: boolean;
  onOpen: (e: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      className="cal-chip"
      data-left={fromPreviousDay || undefined}
      data-right={intoNextDay || undefined}
      style={{ "--chip-color": CATEGORY_COLOR[event.category] } as CSSProperties}
      title={`${event.ticker} · ${event.title}`}
      onClick={() => onOpen(event)}
    >
      {named ? (
        <>
          <b>{event.ticker}</b>{" "}
          <span className={alwaysShowTitle ? undefined : "cal-chip-title"}>{event.title}</span>
        </>
      ) : (
        " "
      )}
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
  const grid = monthGrid(month);
  const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7));
  return (
    <div className="cal-grid">
      {WEEKDAYS.map((w) => (
        <div key={w} className="cal-head">
          {w}
        </div>
      ))}
      {weeks.flatMap((week) => {
        const days = week.map(dayKey);
        const slots = layoutWeek(days, events);
        return week.map((d, weekday) => {
          const key = days[weekday];
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
                {slots[weekday].map((slot, lane) => {
                  if (!slot) return <div key={`gap-${lane}`} className="cal-spacer" />;
                  const { event } = slot;
                  const end = event.ends_on ?? event.starts_on;
                  return (
                    <Chip
                      key={event.id}
                      event={event}
                      named={event.starts_on === key || weekday === 0}
                      fromPreviousDay={event.starts_on < key}
                      intoNextDay={end > key}
                      onOpen={onOpen}
                    />
                  );
                })}
              </div>
            </div>
          );
        });
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
              size="sm"
              c={key === now ? "var(--mantine-primary-color-filled)" : undefined}
              fw={700}
              mb={4}
            >
              {w} {d.getDate()}
            </Text>
            <Stack gap={4}>
              {list.map((e) => (
                <Chip key={e.id} event={e} alwaysShowTitle onOpen={onOpen} />
              ))}
            </Stack>
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}

function List({
  start,
  events,
  onOpen,
}: {
  start: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const from = dayKey(start);
  const to = dayKey(addDays(start, LIST_DAYS - 1));
  const ahead = events.filter((e) => (e.ends_on ?? e.starts_on) >= from && e.starts_on <= to);
  if (!ahead.length)
    return (
      <Text size="sm" c="dimmed">
        Nothing scheduled.
      </Text>
    );
  const dayOf = (e: CalendarEvent) => (e.starts_on < from ? from : e.starts_on);
  const days = [...new Set(ahead.map(dayOf))].sort();
  return (
    <Stack gap="md">
      {days.map((day) => (
        <Stack key={day} gap={6}>
          <DayHeading day={day} />
          {ahead
            .filter((e) => dayOf(e) === day)
            .map((e) => (
              <Paper key={e.id} withBorder p="xs">
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <Badge color={CATEGORY_COLOR[e.category]} style={{ flex: "none" }}>
                    {e.ticker}
                  </Badge>
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Anchor
                      component="button"
                      size="sm"
                      fw={500}
                      ta="left"
                      onClick={() => onOpen(e)}
                    >
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
  const [stored, setView] = useLocalState<View | "agenda" | "">("calendar.view", "");
  const view: View = stored === "agenda" ? "list" : stored || (phone ? "list" : "month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const step = (n: number) =>
    setCursor((c) =>
      view === "month"
        ? addMonths(c, n)
        : view === "week"
          ? addDays(weekStart(c), 7 * n)
          : addDays(c, LIST_DAYS * n),
    );
  const start = weekStart(cursor);
  // A week belongs to the month holding its Thursday.
  const title = displayMonth(view === "week" ? addDays(start, 3) : cursor);

  return (
    <Stack gap="sm">
      <div className="cal-toolbar">
        <Group gap={4} wrap="nowrap" className="cal-toolbar-nav">
          <ActionIcon variant="subtle" aria-label="Previous" onClick={() => step(-1)}>
            <IconChevronLeft size={20} />
          </ActionIcon>
          <ActionIcon variant="subtle" aria-label="Next" onClick={() => step(1)}>
            <IconChevronRight size={20} />
          </ActionIcon>
          <Button variant="default" size="compact-sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          {loading && <Loader size={14} ml={4} />}
        </Group>
        <Text className="cal-toolbar-title" fz={21} fw={700} lh={1.2}>
          {title}
        </Text>
        <SegmentedControl
          className="cal-toolbar-views"
          size="sm"
          data={VIEWS}
          value={view}
          onChange={(v) => setView(v as View)}
        />
      </div>
      {error && <Alert color="red">{error}</Alert>}
      {view === "month" && <Month month={cursor} events={events} onOpen={setSelected} />}
      {view === "week" && <Week start={start} events={events} onOpen={setSelected} />}
      {view === "list" && <List start={cursor} events={events} onOpen={setSelected} />}
      {!loading && !events.length && !error && (
        <Text size="sm" c="dimmed">
          Nothing on the calendar yet. Your agent records events through the API; the{" "}
          <Anchor href={`${API_BASE}/agent`} target="_blank" rel="noreferrer" size="sm">
            agent instructions
          </Anchor>{" "}
          explain how.
        </Text>
      )}
      <Group gap="xs">
        {EVENT_CATEGORIES.map((c) => (
          <Badge key={c} size="lg" color={CATEGORY_COLOR[c]}>
            {c}
          </Badge>
        ))}
      </Group>
      <Detail event={selected} onClose={() => setSelected(null)} />
    </Stack>
  );
}
