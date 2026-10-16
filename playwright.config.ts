import { defineConfig } from "@playwright/test";

// Local runs read .env like the tools do; CI passes the same names as env vars.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env: CI */
}

// E2E_BASE_URL points at a deployed site (the production smoke test);
// without it a preview build is served locally.
const base = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: base ?? "http://localhost:4199", trace: "retain-on-failure" },
  webServer: base
    ? undefined
    : {
        command: "pnpm exec vite build app && pnpm exec vite preview app --port 4199 --strictPort",
        url: "http://localhost:4199",
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
