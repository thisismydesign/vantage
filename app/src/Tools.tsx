// Tools: calculators over the owner's own data, one subpage each at
// #/tools/<tool>. Each tool gates on what it needs.

import { Alert, Group, Loader, SegmentedControl, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useBrokerData } from "./lib/broker.ts";
import { useSession } from "./lib/supabase.ts";
import { MarginSizing } from "./tools/MarginSizing.tsx";

const TOOLS = [{ value: "margin", label: "Margin sizing" }] as const;
type Tool = (typeof TOOLS)[number]["value"];
const isTool = (v: string): v is Tool => TOOLS.some((t) => t.value === v);

/** The second hash segment picks the tool: `#/tools/margin`. */
function useHashTool(): [Tool, (t: Tool) => void] {
  const read = () => {
    const sub = window.location.hash.replace(/^#\/?/, "").split("/")[1] ?? "";
    return isTool(sub) ? sub : TOOLS[0].value;
  };
  const [tool, setTool] = useState<Tool>(read);
  useEffect(() => {
    const onChange = () => setTool(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [tool, (t) => (window.location.hash = `/tools/${t}`)];
}

/** Margin sizing starts from the latest statement. */
function MarginSizingTool() {
  const session = useSession();
  const broker = useBrokerData(session);
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
        This tool starts from your latest broker statement. Connect Interactive Brokers in the
        profile menu and sync.
      </Alert>
    );
  return <MarginSizing snapshot={broker.snapshot} />;
}

export function ToolsPage() {
  const [tool, go] = useHashTool();
  return (
    <>
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{TOOLS.find((t) => t.value === tool)?.label}</Text>
        <SegmentedControl
          size="xs"
          data={[...TOOLS]}
          value={tool}
          onChange={(v) => go(v as Tool)}
          aria-label="Tool"
        />
      </Group>
      {tool === "margin" && <MarginSizingTool />}
    </>
  );
}
