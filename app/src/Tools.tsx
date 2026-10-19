import { Alert, Group, Loader, Tabs, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useBrokerData } from "./lib/broker.ts";
import { useSession } from "./lib/supabase.ts";
import { MarginSizing } from "./tools/MarginSizing.tsx";

const TOOLS = [{ value: "margin", label: "Margin sizing" }] as const;
type Tool = (typeof TOOLS)[number]["value"];
const isTool = (v: string): v is Tool => TOOLS.some((t) => t.value === v);

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

function MarginSizingTool() {
  const session = useSession();
  const broker = useBrokerData(session);
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
        This tool starts from your latest broker statement. Your agent sends statements through the
        API.
      </Alert>
    );
  return <MarginSizing snapshot={broker.snapshot} />;
}

export function ToolsPage() {
  const [tool, go] = useHashTool();
  return (
    <Tabs value={tool} onChange={(v) => v && isTool(v) && go(v)} variant="pills" radius="xl">
      <Tabs.List justify="center" mb="lg">
        {TOOLS.map((t) => (
          <Tabs.Tab key={t.value} value={t.value} fz="md" fw={600} px="lg">
            {t.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value="margin">
        <MarginSizingTool />
      </Tabs.Panel>
    </Tabs>
  );
}
