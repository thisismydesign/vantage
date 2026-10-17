// A day's heading in lists: prominent, and pinned under the bar while its day scrolls by.

import { Text } from "@mantine/core";
import { addDays, dayKey, displayDay, today } from "./lib/events.ts";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayHeading({ day, count }: { day: string; count?: number }) {
  const now = today();
  const name =
    day === now
      ? "Today"
      : day === dayKey(addDays(new Date(), -1))
        ? "Yesterday"
        : day === dayKey(addDays(new Date(), 1))
          ? "Tomorrow"
          : WEEKDAY[new Date(`${day}T12:00:00`).getDay()];
  return (
    <Text
      fz="lg"
      fw={700}
      py={6}
      style={{
        position: "sticky",
        top: "var(--app-shell-header-offset, 0px)",
        zIndex: 2,
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      {name}{" "}
      <Text span fz="md" fw={500} c="dimmed">
        {displayDay(day)}
        {count !== undefined ? ` · ${count} ${count === 1 ? "item" : "items"}` : ""}
      </Text>
    </Text>
  );
}
