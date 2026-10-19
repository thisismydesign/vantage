import { expect, test } from "@playwright/test";
import {
  ANON_KEY,
  SUPABASE_URL,
  TEST_EMAIL,
  canSignIn,
  resetSignedOutThrottle,
  signIn,
} from "./session.ts";

const API = `${SUPABASE_URL}/functions/v1/vantage`;

test.beforeAll(resetSignedOutThrottle);

test("shows the demo watchlist with charts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Vantage").first()).toBeVisible();
  await expect(page.getByText("You are looking at a demo account.")).toBeVisible();
  await page.getByRole("button", { name: "Sign up to customize." }).click();
  await expect(page.getByText("Onboard via agent")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Collapse|Expand) / }).first()).toBeVisible();
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 60_000 });
});

test("signs in the test user", async ({ page }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  await signIn(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText(TEST_EMAIL)).toBeVisible();
});

test("serves the agent instructions, the API description and prices", async ({ request }) => {
  const headers = { apikey: ANON_KEY ?? "" };
  const instructions = await request.get(`${API}/agent`, { headers });
  expect(instructions.ok()).toBe(true);
  expect(await instructions.text()).toContain("# Vantage for agents");
  const openapi = await request.get(`${API}/openapi.json`, { headers });
  expect(openapi.ok()).toBe(true);
  expect((await openapi.json()).openapi).toBeTruthy();
  const prices = await request.get(`${API}?range=1d&symbols=NVDA,BTC-USD`, {
    headers,
    timeout: 60_000,
  });
  expect(prices.ok()).toBe(true);
  expect(Object.keys((await prices.json()).series)).toEqual(["NVDA", "BTC-USD"]);
  expect((await request.get(`${API}?range=1d`, { headers })).status()).toBe(400);
});

test("shows demo data on every page while signed out", async ({ page }) => {
  await page.goto("/#/portfolio");
  await expect(page.getByText("NVDA").first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/#/trades");
  await expect(page.getByText("AAOI").first()).toBeVisible();
  await page.goto("/#/calendar");
  await expect(page.getByText("Quarterly dividend (ex-date)").first()).toBeVisible();
  await page.goto("/#/news");
  await expect(page.getByText("Nvidia ships first rack-scale systems")).toBeVisible();
  await page.goto("/#/tools/margin");
  await expect(page.getByText("Bet size (notional)")).toBeVisible();
});
