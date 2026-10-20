import { ActionIcon, Badge, Box, Collapse, Group, Paper, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { groupTint } from "../theme.ts";

/** A watchlist or holdings group: tinted in its colour, folding under its heading. `summary` stays visible when folded. */
export function GroupSection({
  label,
  color,
  count,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  color: string;
  count: number;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="sm" style={{ background: groupTint(color) }}>
      {/* The whole heading toggles the group; the chevron shows it can. */}
      <Group
        gap="sm"
        wrap="nowrap"
        mb={open ? "sm" : 0}
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={onToggle}
      >
        <ActionIcon
          variant="default"
          size="md"
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        >
          {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
        </ActionIcon>
        <Text fw={700} fz="md">
          {label}
        </Text>
        <Badge variant="default" size="md">
          {count}
        </Badge>
        {summary && <Box ml="auto">{summary}</Box>}
      </Group>
      <Collapse expanded={open}>{children}</Collapse>
    </Paper>
  );
}
