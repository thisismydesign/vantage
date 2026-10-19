import { expect, test } from "@playwright/test";
import { ANON_KEY, SUPABASE_URL, TEST_EMAIL, canSignIn, resetThrottle, signIn } from "./session.ts";

const API = `${SUPABASE_URL}/functions/v1/vantage`;
const WATCHLIST = `${SUPABASE_URL}/functions/v1/watchlist`;

test.beforeAll(resetThrottle);

test("shows the demo watchlist with charts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Vantage").first()).toBeVisible();
  await expect(page.getByText("You are looking at a demo account.")).toBeVisible();
  await page.getByRole("button", { name: "Sign up to customize." }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy agent instructions" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Collapse|Expand) / }).first()).toBeVisible();
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 60_000 });
});

test("signs in the test user, whose watchlist is priced", async ({ page, request }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  await page.goto("/");
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("You are looking at a demo account.")).toBeHidden();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText(TEST_EMAIL)).toBeVisible();
  const headers = { apikey: ANON_KEY ?? "", Authorization: `Bearer ${session.access_token}` };
  const prices = await request.get(`${WATCHLIST}?range=1d`, { headers, timeout: 60_000 });
  expect(prices.ok()).toBe(true);
  expect((await prices.json()).items.length).toBeGreaterThan(0);
  const lookup = await request.get(`${WATCHLIST}?lookup=NVDA`, { headers });
  expect(lookup.ok()).toBe(true);
  expect((await lookup.json()).results.length).toBeGreaterThan(0);
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

test("keeps the watchlist function to signed-in callers", async ({ request }) => {
  const headers = { apikey: ANON_KEY ?? "" };
  expect((await request.get(`${WATCHLIST}?range=1d`, { headers })).status()).toBe(401);
  // Browsers preflight without credentials; the gateway MUST let that through for the real call to happen.
  const preflight = await request.fetch(`${WATCHLIST}?range=1d`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://example.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization, apikey",
    },
  });
  expect(preflight.ok()).toBe(true);
  expect(preflight.headers()["access-control-allow-origin"]).toBe("*");
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
