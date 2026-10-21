import { AppShell, Box, MantineProvider, useComputedColorScheme } from "@mantine/core";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PrivacyProvider } from "./lib/privacy.tsx";
import { cssVariablesResolver, theme } from "./theme.ts";
import { Vantage, useHashPage } from "./App.tsx";
import { VantageBar } from "./Header.tsx";

import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";

/** Paints the installed app's system bars to match the page in either scheme. */
function useThemeColorMeta() {
  const scheme = useComputedColorScheme("dark");
  useEffect(() => {
    const color = getComputedStyle(document.body).backgroundColor;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [scheme]);
}

function App() {
  const [page, go] = useHashPage();
  useThemeColorMeta();
  return (
    <AppShell header={{ height: 52 }} padding="md">
      <AppShell.Header>
        <Box h="100%" px="md">
          <VantageBar page={page} onNavigate={go} />
        </Box>
      </AppShell.Header>
      {/* viewport-fit=cover draws the page under Android's gesture bar; keep the last row clear of it. */}
      <AppShell.Main pb="calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))">
        <Vantage page={page} />
      </AppShell.Main>
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      cssVariablesResolver={cssVariablesResolver}
    >
      <PrivacyProvider>
        <App />
      </PrivacyProvider>
    </MantineProvider>
  </StrictMode>,
);
