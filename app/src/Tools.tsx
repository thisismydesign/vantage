// Tools: calculators over the owner's own data. One for now; the switcher
// appears once there is a second.

import { Alert, Group, Loader, SegmentedControl, Text } from "@mantine/core";
import { useBrokerData } from "./lib/broker.ts";
import { useSession } from "./lib/supabase.ts";
import { useLocalState } from "./lib/useLocalState.ts";
import { MarginSizing } from "./tools/MarginSizing.tsx";

const TOOLS = [{ value: "margin", label: "Margin sizing" }] as const;
type Tool = (typeof TOOLS)[number]["value"];

export function ToolsPage() {
  const session = useSession();
  const broker = useBrokerData(session);
  const [tool, setTool] = useLocalState<Tool>("tools.tool", "margin");
  const label = TOOLS.find((t) => t.value === tool)?.label;

  if (!session)
    return (
      <Alert title="Sign in to use the tools">
        They work on your own portfolio. Sign in from the profile menu.
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
  if (!broker.snapshot)
    return (
      <Alert title="No statement yet">
        The tools start from your latest broker statement. Connect Interactive Brokers in the
        profile menu and sync.
      </Alert>
    );
  return (
    <>
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{label}</Text>
        {TOOLS.length > 1 && (
          <SegmentedControl
            size="xs"
            data={[...TOOLS]}
            value={tool}
            onChange={(v) => setTool(v as Tool)}
          />
        )}
      </Group>
      {tool === "margin" && <MarginSizing snapshot={broker.snapshot} />}
    </>
  );
}
