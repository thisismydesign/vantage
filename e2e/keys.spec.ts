import { expect, test } from "@playwright/test";
import { KEY_SHOWN, newKey, sha256Hex } from "../shared/keys.ts";
import { PUBLISHABLE_KEY, SUPABASE_URL, canSignIn, restHeaders, signIn } from "./session.ts";

const REST = `${SUPABASE_URL}/rest/v1`;
const API = `${SUPABASE_URL}/functions/v1/vantage`;

test("an agent key opens a session until revoked", async ({ page, request }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  const headers = restHeaders(session);
  const key = newKey();
  const made = await request.post(`${REST}/api_keys`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: { name: "e2e", prefix: key.slice(0, KEY_SHOWN), key_hash: await sha256Hex(key) },
  });
  expect(made.status()).toBe(201);
  const [{ id }] = (await made.json()) as { id: string }[];

  const asAgent = { apikey: PUBLISHABLE_KEY ?? "", Authorization: `Bearer ${key}` };
  const traded = await request.post(`${API}/token`, { headers: asAgent });
  expect(traded.status()).toBe(200);
  const { session: agent } = (await traded.json()) as { session: { access_token: string } };
  const list = await request.get(`${REST}/watchlist?select=ticker&limit=1`, {
    headers: { apikey: PUBLISHABLE_KEY ?? "", Authorization: `Bearer ${agent.access_token}` },
  });
  expect(list.status()).toBe(200);

  const revoked = await request.patch(`${REST}/api_keys?id=eq.${id}`, {
    headers,
    data: { revoked_at: new Date().toISOString() },
  });
  expect(revoked.status()).toBe(204);
  expect((await request.post(`${API}/token`, { headers: asAgent })).status()).toBe(401);
  await request.delete(`${REST}/api_keys?id=eq.${id}`, { headers });
});

test("the owner makes a key in settings and sees it once", async ({ page, request }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Agent keys" }).click();
  await page.getByLabel("New key").fill("e2e-ui");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText(/^vk_[A-Za-z0-9_-]+$/)).toBeVisible();
  await request.delete(`${REST}/api_keys?name=eq.e2e-ui`, { headers: restHeaders(session) });
});
