import {
  ActionIcon,
  Box,
  Burger,
  Group,
  Menu,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconEye, IconEyeOff, IconMoon, IconSun } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { usePrivacy } from "./lib/privacy.tsx";
import { PAGES, type Page } from "./App.tsx";
import { Logo } from "./Logo.tsx";
import { ProfileMenu } from "./Watchlist.tsx";

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("dark");
  return (
    <ActionIcon
      variant="subtle"
      size="lg"
      aria-label={scheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}
    >
      {scheme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
    </ActionIcon>
  );
}

/** Hides account-sized figures; prices and percentages stay visible. */
function PrivacyToggle() {
  const { hidden, setHidden } = usePrivacy();
  return (
    <ActionIcon
      variant="subtle"
      size="lg"
      aria-label={hidden ? "Show account values" : "Hide account values"}
      onClick={() => setHidden(!hidden)}
    >
      {hidden ? <IconEyeOff size={20} /> : <IconEye size={20} />}
    </ActionIcon>
  );
}

/** Page tabs: plain text, the active one underlined in the accent colour. */
function Nav({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  return (
    <Group gap={0} wrap="nowrap" h="100%" visibleFrom="sm">
      {PAGES.map((p) => {
        const active = p.value === page;
        return (
          <UnstyledButton
            key={p.value}
            onClick={() => onNavigate(p.value)}
            aria-current={active ? "page" : undefined}
            h="100%"
            px="sm"
            py={10}
            fz="md"
            fw={600}
            c={active ? undefined : "dimmed"}
            style={{
              borderBottom: `2px solid ${active ? "var(--mantine-primary-color-filled)" : "transparent"}`,
              transition: "color 120ms",
            }}
          >
            {p.label}
          </UnstyledButton>
        );
      })}
    </Group>
  );
}

/** Phones: a burger opens the page list; the bar's middle names the current page. */
function BurgerNav({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const [opened, setOpened] = useState(false);
  useEffect(() => setOpened(false), [page]);
  return (
    <Menu opened={opened} onChange={setOpened} position="bottom-start" shadow="md" width={200}>
      <Menu.Target>
        <Burger
          opened={opened}
          size="sm"
          aria-label="Pages"
          hiddenFrom="sm"
          onClick={() => setOpened((o) => !o)}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {PAGES.map((p) => (
          <Menu.Item
            key={p.value}
            fw={p.value === page ? 700 : undefined}
            onClick={() => onNavigate(p.value)}
          >
            {p.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Vantage's bar: brand left, page tabs centred when the host leaves navigation to it, toggles right. */
export function VantageBar({ page, onNavigate }: { page?: Page; onNavigate?: (p: Page) => void }) {
  const current = PAGES.find((p) => p.value === page)?.label;
  return (
    <Box
      h="100%"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(max-content, 1fr) auto minmax(max-content, 1fr)",
        alignItems: "stretch",
      }}
    >
      <Group gap="xs" pl={4} wrap="nowrap">
        {page && onNavigate && <BurgerNav page={page} onNavigate={onNavigate} />}
        <Logo size={26} />
        <Text fw={700} fz="lg" lts={0.5} visibleFrom="sm">
          Vantage
        </Text>
      </Group>
      {page && onNavigate ? (
        <>
          <Nav page={page} onNavigate={onNavigate} />
          <Text fw={600} fz="md" hiddenFrom="sm" style={{ alignSelf: "center" }}>
            {current}
          </Text>
        </>
      ) : (
        <span />
      )}
      <Group gap={4} wrap="nowrap" justify="flex-end">
        <PrivacyToggle />
        <ColorSchemeToggle />
        <ProfileMenu />
      </Group>
    </Box>
  );
}
