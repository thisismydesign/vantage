import { AppShell, Box, MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivacyProvider } from "./lib/privacy.tsx";
import { cssVariablesResolver, theme } from "./theme.ts";
import { Vantage, useHashPage } from "./App.tsx";
import { VantageBar } from "./Header.tsx";

import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";

function App() {
  const [page, go] = useHashPage();
  return (
    <AppShell header={{ height: 52 }} padding="md">
      <AppShell.Header>
        <Box h="100%" px="md">
          <VantageBar page={page} onNavigate={go} />
        </Box>
      </AppShell.Header>
      <AppShell.Main>
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
