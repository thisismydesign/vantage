import {
  ActionIcon,
  Box,
  Burger,
  Drawer,
  Group,
  NavLink,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconEye, IconEyeOff, IconMoon, IconSun } from "@tabler/icons-react";
import { Fragment, useEffect, useState } from "react";
import { usePrivacy } from "./lib/privacy.tsx";
import { PAGES, type Page } from "./App.tsx";
import { useHashTab } from "./lib/useHashTab.ts";
import { readLocalState } from "./lib/useLocalState.ts";
import { Logo } from "./Logo.tsx";
import { TAB_KEYS, TABS } from "./Portfolio.tsx";
import { ProfileMenu } from "./Watchlist.tsx";

type Tab = (typeof TABS)[number]["value"];

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

function BurgerNav({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const [opened, setOpened] = useState(false);
  const close = () => setOpened(false);
  // The back button changes the page under an open menu.
  useEffect(close, [page]);
  // A bare #/portfolio opens the stored tab, so the menu marks that one.
  const [sub, goTab] = useHashTab<Tab | "">("portfolio", TAB_KEYS, "");
  const stored = readLocalState<Tab>("portfolio:tab", "account");
  const tab = sub || (TAB_KEYS.includes(stored) ? stored : "account");
  return (
    <>
      <Burger
        opened={opened}
        size="sm"
        aria-label="Pages"
        hiddenFrom="sm"
        onClick={() => setOpened((o) => !o)}
      />
      <Drawer
        opened={opened}
        onClose={close}
        position="left"
        size="xs"
        title={
          <Group gap="xs" wrap="nowrap">
            <Logo size={26} />
            <Text fw={700} fz="lg" lts={0.5}>
              Vantage
            </Text>
          </Group>
        }
      >
        {PAGES.map((p) => (
          <Fragment key={p.value}>
            <NavLink
              label={p.label}
              active={p.value === page}
              fz="md"
              fw={600}
              py="sm"
              style={{ borderRadius: "var(--mantine-radius-md)" }}
              onClick={() => {
                onNavigate(p.value);
                close();
              }}
            />
            {p.value === "portfolio" &&
              TABS.map((t) => (
                <NavLink
                  key={t.value}
                  label={t.label}
                  active={page === "portfolio" && t.value === tab}
                  variant="light"
                  fz="sm"
                  fw={500}
                  py="xs"
                  pl="xl"
                  style={{ borderRadius: "var(--mantine-radius-md)" }}
                  onClick={() => {
                    goTab(t.value);
                    close();
                  }}
                />
              ))}
          </Fragment>
        ))}
      </Drawer>
    </>
  );
}

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
