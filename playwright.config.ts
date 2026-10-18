import { defineConfig } from "@playwright/test";

const deployedSite = process.env.E2E_BASE_URL;
try {
  process.loadEnvFile(deployedSite ? ".env" : ".env.development");
} catch {
  /* no file: CI */
}

export default defineConfig({
  testDir: "e2e",
  // One worker: every signed-in spec mints a token for the same test user, and a newer token invalidates the one before it.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: deployedSite ?? "http://localhost:4199", trace: "retain-on-failure" },
  webServer: deployedSite
    ? undefined
    : {
        command:
          "pnpm exec vite build app --mode development && pnpm exec vite preview app --port 4199 --strictPort",
        url: "http://localhost:4199",
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
