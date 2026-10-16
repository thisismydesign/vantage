// Runs against a local preview build before deploy and against production after.
import { expect, test } from "@playwright/test";
import { ANON_KEY, SUPABASE_URL, TEST_EMAIL, canSignIn, signIn } from "./session.ts";

const API = `${SUPABASE_URL}/functions/v1/vantage`;

test("shows the public watchlist with charts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Vantage").first()).toBeVisible();
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

test("serves the agent brief, the API description and prices", async ({ request }) => {
  const headers = { apikey: ANON_KEY ?? "" };
  const brief = await request.get(`${API}/agent`, { headers });
  expect(brief.ok()).toBe(true);
  expect(await brief.text()).toContain("Set up Vantage");
  const openapi = await request.get(`${API}/openapi.json`, { headers });
  expect(openapi.ok()).toBe(true);
  expect((await openapi.json()).openapi).toBeTruthy();
  const prices = await request.get(`${API}?range=1d`, { headers, timeout: 60_000 });
  expect(prices.ok()).toBe(true);
  expect((await prices.json()).items.length).toBeGreaterThan(0);
});
