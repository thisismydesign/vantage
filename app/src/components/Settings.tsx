import { ActionIcon, Drawer, Popover, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";

export function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/** Set-and-forget display choices behind one button: a side panel on phones, a popover beside the button elsewhere. */
export function SettingsMenu({
  label,
  width,
  position,
  children,
}: {
  label: string;
  width: number;
  position: "bottom-start" | "bottom-end";
  children: ReactNode;
}) {
  const mobile = useMediaQuery("(max-width: 48em)") ?? false;
  const [opened, setOpened] = useState(false);
  const button = (
    <ActionIcon
      variant="default"
      size="input-xs"
      aria-label={label}
      title="Settings"
      onClick={mobile ? () => setOpened(true) : undefined}
    >
      <IconAdjustmentsHorizontal size={16} />
    </ActionIcon>
  );
  if (mobile)
    return (
      <>
        {button}
        <Drawer
          opened={opened}
          onClose={() => setOpened(false)}
          position="right"
          size="xs"
          title={<Text fw={700}>Settings</Text>}
        >
          {children}
        </Drawer>
      </>
    );
  return (
    <Popover position={position} shadow="md" width={width} withArrow>
      <Popover.Target>{button}</Popover.Target>
      <Popover.Dropdown p="md">{children}</Popover.Dropdown>
    </Popover>
  );
}
