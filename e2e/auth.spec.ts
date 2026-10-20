import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  ANON_KEY,
  SUPABASE_URL,
  TEST_EMAIL,
  canSignIn,
  deleteUser,
  resetThrottle,
  signIn,
} from "./session.ts";

const API = `${SUPABASE_URL}/functions/v1/vantage`;
// Creating accounts is for the local stack; the deployed site only changes the test user's password.
const local = !process.env.E2E_BASE_URL;
const password = () => `pw-${crypto.randomUUID()}`;

test.beforeAll(resetThrottle);

async function fillAndSubmit(page: Page, email: string, secret: string, submit: string) {
  const form = page.locator("form", { has: page.getByRole("button", { name: submit }) });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(secret);
  await form.getByRole("button", { name: submit }).click();
}

test("signs up in the browser, then signs back in with the password", async ({ page }) => {
  test.skip(!local || !canSignIn, "local stack only");
  const email = `signup-${Date.now()}@vantage.test`;
  const secret = password();
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign up to customize." }).click();
    await fillAndSubmit(page, email, "short", "Create account");
    await expect(page.getByText("The password needs at least 8 characters.")).toBeVisible();
    await fillAndSubmit(page, email, secret, "Create account");
    await expect(page.getByText("You are looking at a demo account.")).toBeHidden();
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await page.getByRole("button", { name: "Sign up to customize." }).click();
    await page.getByText("Sign in", { exact: true }).click();
    await fillAndSubmit(page, email, "wrong-password", "Sign in");
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
    await fillAndSubmit(page, email, secret, "Sign in");
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await expect(page.getByText(email)).toBeVisible();
  } finally {
    await deleteUser(email);
  }
});

test("onboards an agent without a password and returns one to sign in with", async ({
  request,
}) => {
  test.skip(!local || !canSignIn, "local stack only");
  const email = `agent-${Date.now()}@vantage.test`;
  try {
    const headers = { apikey: ANON_KEY ?? "" };
    const short = await request.post(`${API}/onboard`, {
      headers,
      data: { email, password: "short" },
    });
    expect(short.status()).toBe(400);
    const created = await request.post(`${API}/onboard`, { headers, data: { email } });
    expect(created.status()).toBe(201);
    const body = await created.json();
    expect(body.session.access_token).toBeTruthy();
    expect(body.password.length).toBeGreaterThanOrEqual(20);
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    const signedIn = await anon.auth.signInWithPassword({ email, password: body.password });
    expect(signedIn.error).toBeNull();
    const again = await request.post(`${API}/onboard`, { headers, data: { email } });
    expect(again.status()).toBe(409);
  } finally {
    await deleteUser(email);
  }
});

test("changes the password from Settings", async ({ page }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  await signIn(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Password" }).click();
  const secret = password();
  await page.getByLabel("New password").fill(secret);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
  const signedIn = await anon.auth.signInWithPassword({ email: TEST_EMAIL, password: secret });
  expect(signedIn.error).toBeNull();
});
