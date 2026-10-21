import { expect, test } from "@playwright/test";
import {
  SUPABASE_URL,
  admin,
  canSignIn,
  localDay,
  restHeaders,
  seedSnapshot,
  signIn,
} from "./session.ts";

const REST = `${SUPABASE_URL}/rest/v1`;

test("charts the account value and its performance net of deposits", async ({ page, request }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  await seedSnapshot(session);
  // Days left by earlier runs would carry no flow and leave performance unknown.
  await admin().from("nav_history").delete().eq("owner", session.user.id);
  const days = [30, 20, 10, 0].map((ago) => localDay(new Date(Date.now() - ago * 86_400_000)));
  const navs = [100_000, 110_000, 160_000, 176_000];
  const flows = [0, 0, 50_000, 0];
  const sent = await request.post(`${REST}/nav_history?on_conflict=owner,as_of`, {
    headers: { ...restHeaders(session), Prefer: "resolution=merge-duplicates,return=minimal" },
    data: days.map((as_of, i) => ({ as_of, base_currency: "EUR", nav: navs[i], flow: flows[i] })),
  });
  expect([200, 201]).toContain(sent.status());

  await page.goto("/#/portfolio");
  const card = page.locator(".mantine-Card-root", { hasText: "Performance" });
  await card.getByText("3M", { exact: true }).click();
  await card.getByText("Value", { exact: true }).click();
  await expect(card.getByText("€176,000")).toBeVisible();
  await expect(card.getByText("+€26,000", { exact: false })).toBeVisible();
  await expect(card.getByText("+€50,000 deposited", { exact: false })).toBeVisible();
  await expect(card.locator("svg.recharts-surface")).toBeVisible();

  await card.getByText("Performance", { exact: true }).click();
  await expect(card.getByText("+21.00%")).toBeVisible();
  await expect(card.locator("svg.recharts-surface")).toBeVisible();
});
