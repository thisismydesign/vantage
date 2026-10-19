// Public: docs, onboarding, agent-key exchange, and prices for symbols a signed-out caller names. The signed-in watchlist is the watchlist function's.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MIN_PASSWORD_LENGTH,
  type OnboardRequest,
  type OnboardResponse,
} from "../../../shared/api.ts";
import { KEY_PREFIX, sha256Hex } from "../../../shared/keys.ts";
import { db, SUPABASE_URL } from "../_shared/db.ts";
import { CORS, json, text } from "../_shared/http.ts";
import { isChartRange, prices } from "../_shared/prices.ts";
import { addGroup, addItem, loadList, publicList, seedDefaults } from "../_shared/watchlist.ts";
import { agentInstructions, endpoints, openapi, type Endpoints } from "./docs.ts";

// The runtime's SUPABASE_ANON_KEY is the new publishable key; VANTAGE_ANON_KEY pins the one the project accepts.
const ANON_KEY = Deno.env.get("VANTAGE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("VANTAGE_SITE_URL")!;

const clientIp = (request: Request) =>
  request.headers.get("cf-connecting-ip") ??
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
  "unknown";

async function throttled(ip: string, route: string, perHour: number) {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  // Only the last hour counts, so older rows go; the table stays an hour long.
  await db.from("throttle").delete().lt("at", since);
  const { count } = await db
    .from("throttle")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("route", route)
    .gte("at", since);
  if ((count ?? 0) >= perHour) return true;
  await db.from("throttle").insert({ ip, route });
  return false;
}

async function mintSession(email: string) {
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(link.error.message);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const verified = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session)
    throw new Error(verified.error?.message ?? "Could not start a session.");
  const { access_token, refresh_token, expires_at } = verified.data.session;
  return { access_token, refresh_token, expires_at };
}

const TOKEN_LIMIT = { perHour: 60 };

async function exchangeAgentKey(request: Request, api: Endpoints, ip: string) {
  if (await throttled(ip, "token", TOKEN_LIMIT.perHour))
    return json({ error: "Too many attempts from this address. Try again in an hour." }, 429);
  const key = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith(KEY_PREFIX))
    return json({ error: "Send the agent key as Authorization: Bearer <key>." }, 401);
  const found = await db
    .from("api_keys")
    .select("id,owner")
    .eq("key_hash", await sha256Hex(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!found.data) return json({ error: "Unknown or revoked key." }, 401);
  const user = await db.auth.admin.getUserById(found.data.owner);
  if (user.error || !user.data.user?.email)
    return json({ error: "The key's owner no longer exists." }, 401);
  const session = await mintSession(user.data.user.email);
  await db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", found.data.id);
  return json({ session, api: endpoints(api) });
}

const generatedPassword = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

// A few accounts an hour per address suffices for a person and their agent, and starves anyone flooding the user table.
const ONBOARD_LIMIT = { perHour: 5 };

// New accounts only: an existing email never yields a session to an anonymous caller.
async function onboard(body: Partial<OnboardRequest>, api: Endpoints, ip: string) {
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: "A valid email is required." }, 400);
  const chosen = body.password;
  if (chosen !== undefined && (typeof chosen !== "string" || chosen.length < MIN_PASSWORD_LENGTH))
    return json({ error: `The password needs at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  if (await throttled(ip, "onboard", ONBOARD_LIMIT.perHour))
    return json({ error: "Too many sign-ups from this address. Try again in an hour." }, 429);
  const password = chosen ?? generatedPassword();
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) {
    const taken = /already|exists|registered/i.test(error?.message ?? "");
    return json(
      {
        error: taken
          ? "This email already has an account. Sign in instead."
          : (error?.message ?? "Could not create the account."),
      },
      taken ? 409 : 500,
    );
  }
  const owner = created.user.id;
  const namesOwnList = Boolean(body.groups?.length || body.items?.length);
  const useDefaults = body.defaults ?? !namesOwnList;
  if (useDefaults) await seedDefaults(db, owner);
  const warnings: string[] = [];
  for (const group of body.groups ?? []) {
    try {
      await addGroup(db, owner, group);
    } catch (e) {
      warnings.push(`group ${group.label}: ${(e as Error).message}`);
    }
  }
  for (const item of body.items ?? []) {
    try {
      await addItem(db, owner, item);
    } catch (e) {
      warnings.push(`item ${item.ticker}: ${(e as Error).message}`);
    }
  }

  return json(
    {
      email,
      ...(chosen ? {} : { password }),
      session: await mintSession(email),
      warnings,
      list: publicList(await loadList(db, owner)),
      api: endpoints(api),
    } satisfies OnboardResponse,
    201,
  );
}

type RestSpec = { paths?: Record<string, unknown>; definitions?: Record<string, unknown> };

// The schema changes only with a migration, and every deploy starts fresh instances; the TTL covers migrations pushed on their own.
const REST_SPEC_TTL_MS = 10 * 60_000;
let restSpec: { at: number; spec: Promise<RestSpec> } | undefined;

// Supabase serves its generated REST description only to the service role.
function fetchRestSpec(): Promise<RestSpec> {
  if (restSpec && Date.now() - restSpec.at < REST_SPEC_TTL_MS) return restSpec.spec;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const spec = fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`REST description unavailable (${response.status})`);
    return (await response.json()) as RestSpec;
  });
  restSpec = { at: Date.now(), spec };
  spec.catch(() => (restSpec = undefined));
  return spec;
}

async function restOpenapi(api: Endpoints) {
  const spec = await fetchRestSpec();
  const sessionPaths = new Set([
    "watchlist",
    "watchlist_themes",
    "events",
    "news",
    "portfolio_snapshots",
    "snapshot_positions",
    "rpc/put_portfolio_snapshot",
    "nav_history",
    "trade_fills",
  ]);
  const pick = (o: Record<string, unknown> | undefined, strip: (k: string) => string) =>
    Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => sessionPaths.has(strip(k))));
  const u = endpoints(api);
  const rest = new URL(u.rest);
  return {
    ...spec,
    // PostgREST describes itself from inside the stack; callers go through the gateway.
    host: rest.host,
    basePath: rest.pathname,
    schemes: [rest.protocol.replace(":", "")],
    info: {
      title: "Vantage data",
      version: "1",
      description:
        "The user's own rows. Upsert with POST ?on_conflict=<the table's upsert columns> and header Prefer: resolution=merge-duplicates.",
    },
    securityDefinitions: {
      apikey: {
        type: "apiKey",
        in: "header",
        name: "apikey",
        description: `Always ${api.anonKey}`,
      },
      session: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description: `Bearer <access_token>; see ${u.openapi} for getting a session`,
      },
    },
    security: [{ apikey: [], session: [] }],
    paths: pick(spec.paths, (k) => k.replace(/^\//, "")),
    definitions: pick(spec.definitions, (k) => k),
  };
}

// Signed out, the app never refreshes on its own; a page view costs one to three requests.
const SIGNED_OUT_LIMIT = { perHour: 60, symbols: 25 };
const SYMBOL = /^[A-Za-z0-9.^=-]{1,20}$/;

/** A bare list for symbols a signed-out caller names; each prices under its own symbol. */
const symbolList = (symbols: string[]) => ({
  themes: [],
  items: symbols.map((symbol, position) => ({
    ticker: symbol,
    name: symbol,
    quote_symbol: symbol,
    currency: null,
    themes: [],
    aliases: [],
    disabled: false,
    position,
  })),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  // Supabase mounts the function at /functions/v1/vantage; routes are relative to it.
  const route = url.pathname.replace(/^\/vantage/, "").replace(/\/$/, "") || "/";
  // The gateway terminates TLS, so the runtime sees http; the public URL is https.
  const functions = `https://${url.host}/functions/v1`;
  const api: Endpoints = {
    functions,
    base: `${functions}/vantage`,
    supabase: SUPABASE_URL,
    anonKey: ANON_KEY,
    site: SITE,
  };
  const method = request.method;

  try {
    if (route === "/agent" && method === "GET")
      return text(await agentInstructions(api), "text/markdown; charset=utf-8");
    if (route === "/openapi.json" && method === "GET") return json(openapi(api));
    if (route === "/rest-openapi.json" && method === "GET") return json(await restOpenapi(api));
    if (route === "/onboard" && method === "POST") {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as Partial<OnboardRequest>;
      return await onboard(body, api, clientIp(request));
    }
    if (route === "/token" && method === "POST")
      return await exchangeAgentKey(request, api, clientIp(request));
    if (route !== "/") return json({ error: "Not found." }, 404);
    if (method !== "GET") return json({ error: "GET only." }, 405);

    const range = url.searchParams.get("range") ?? "1d";
    if (!isChartRange(range)) return json({ error: "Unsupported range." }, 400);
    // Only the symbols asked for: a few, well-formed, and rate-limited per address.
    const symbols = [
      ...new Set((url.searchParams.get("symbols") ?? "").split(",").filter(Boolean)),
    ];
    if (
      !symbols.length ||
      symbols.length > SIGNED_OUT_LIMIT.symbols ||
      !symbols.every((s) => SYMBOL.test(s))
    )
      return json(
        {
          error: `Name up to ${SIGNED_OUT_LIMIT.symbols} symbols; a signed-in watchlist is priced at ${functions}/watchlist.`,
        },
        400,
      );
    if (await throttled(clientIp(request), "signed-out", SIGNED_OUT_LIMIT.perHour))
      return json({ error: "Too many requests from this address. Try again later." }, 429);
    return json(await prices(range, symbolList(symbols)));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
