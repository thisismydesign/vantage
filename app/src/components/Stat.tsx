import { Paper, Text } from "@mantine/core";
import { TONE, type Tone } from "../theme.ts";

export function Stat({
  value,
  label,
  tone,
  hint,
}: {
  value: string;
  label: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={700} c={tone ? TONE[tone] : undefined}>
        {value}
      </Text>
      {hint ? (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      ) : null}
    </Paper>
  );
}
