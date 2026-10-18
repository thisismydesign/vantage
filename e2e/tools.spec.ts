import { expect, test } from "@playwright/test";
import { canSignIn, seedSnapshot, signIn } from "./session.ts";

test("margin sizing works from the statement", async ({ page }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  await seedSnapshot(await signIn(page));
  await page.goto("/#/tools/margin");
  await expect(page.getByText("Bet size (notional)")).toBeVisible();
  await expect(page.getByText("Excess liquidity after")).toBeVisible();
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
});
