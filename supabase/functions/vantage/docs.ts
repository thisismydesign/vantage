// What an agent reads to work with Vantage: the onboarding brief and the API description.
// Edits go through Supabase's own REST layer, which describes its tables itself.

import { EVENT_CATEGORIES } from "../_shared/events.ts";

export const SITE = "https://vantage.personal-553.workers.dev";

export type Endpoints = {
  /** This function. */
  base: string;
  /** Supabase project URL. */
  supabase: string;
  /** Publishable key; sent as the `apikey` header on every Supabase call. */
  anonKey: string;
};

export const endpoints = (e: Endpoints) => ({
  onboard: `${e.base}/onboard`,
  prices: `${e.base}?range=1d`,
  lookup: `${e.base}?lookup=CRWD`,
  tokenRefresh: `${e.supabase}/auth/v1/token?grant_type=refresh_token`,
  rest: `${e.supabase}/rest/v1`,
  restOpenapi: `${e.base}/rest-openapi.json`,
  openapi: `${e.base}/openapi.json`,
  brief: `${e.base}/agent`,
  anonKey: e.anonKey,
  site: SITE,
});

export function agentBrief(e: Endpoints) {
  const u = endpoints(e);
  // One paragraph per line: agents and copy-paste both cope better without soft wraps.
  return [
    "# Set up Vantage for me",
    "",
    `You are my assistant. Vantage (${SITE}) shows live price charts for a watchlist of companies arranged in groups. Create my account and watchlist through its API, and keep the credentials so you can change the watchlist later when I ask.`,
    "",
    "1. Ask me for my email address, and whether I want Vantage's default groups and companies or my own. If my own, ask which groups and which companies go in each, and send only those.",
    "",
    `2. POST ${u.onboard} with JSON {"email", "defaults": true|false, "groups", "items"}. The exact shapes are in the API description at ${u.openapi}. The response includes "session": store its refresh_token durably and tell me where.`,
    "",
    "3. Tell me to check my email and open the sign-in link. My watchlist will be ready when the page opens.",
    "",
    `Later, when I ask for changes: trade the refresh token for an access token at ${u.tokenRefresh} (header apikey: ${e.anonKey}); the reply holds a new refresh token, so store it and discard the old one every time. My data lives in the Supabase REST API at ${u.rest}, described at ${u.restOpenapi}: the tables watchlist and watchlist_themes, and events (my calendar). Every call needs the headers apikey: ${e.anonKey} and Authorization: Bearer <access_token>.`,
    "",
    `Calendar: when I mention a dated thing about a company I follow (earnings, dividend, launch, conference, ruling), record it: POST ${u.rest}/events?on_conflict=owner,external_id with header Prefer: resolution=merge-duplicates and a JSON row {ticker, category, kind, title, description, starts_on, ends_on, estimated, source, url, external_id}. category is one of ${EVENT_CATEGORIES.join(", ")}; kind is the specific word (earnings, dividend, launch…); external_id is a stable id you choose, so re-sending updates instead of duplicating. The ticker must already be on my watchlist.`,
    "",
    "Onboarding only creates new accounts. If my email already has one, the API answers 409 and I sign in on the site myself.",
    "",
  ].join("\n");
}

export function openapi(e: Endpoints) {
  const u = endpoints(e);
  const group = {
    type: "object",
    properties: { id: { type: "string" }, label: { type: "string" } },
    required: ["label"],
  };
  const item = {
    type: "object",
    properties: {
      ticker: { type: "string", description: "Short name shown on the chart, e.g. CRWD" },
      name: { type: "string" },
      symbol: { type: "string", description: "Yahoo Finance symbol; looked up when omitted" },
      currency: { type: "string" },
      groups: { type: "array", items: { type: "string" }, description: "Group ids" },
    },
    required: ["ticker"],
  };
  const event = {
    type: "object",
    description: "A row of the events table; write it through the REST API, not this function",
    properties: {
      ticker: { type: "string", description: "A ticker on the owner's watchlist" },
      category: { type: "string", enum: [...EVENT_CATEGORIES] },
      kind: { type: "string", description: "The specific thing: earnings, dividend, launch…" },
      title: { type: "string" },
      description: { type: "string" },
      starts_on: { type: "string", format: "date" },
      ends_on: { type: "string", format: "date", description: "Inclusive; omit for one day" },
      estimated: { type: "boolean", description: "The date is not confirmed by the company" },
      source: { type: "string" },
      url: { type: "string" },
      external_id: {
        type: "string",
        description: "Caller-chosen stable id; upsert on (owner, external_id)",
      },
    },
    required: ["ticker", "category", "title", "starts_on"],
  };
  const session = {
    type: "object",
    properties: {
      access_token: { type: "string" },
      refresh_token: { type: "string", description: "Store it; each use returns a replacement" },
      expires_at: { type: "integer", description: "Unix seconds" },
    },
  };
  return {
    openapi: "3.0.3",
    info: {
      title: "Vantage API",
      version: "2",
      description:
        "Onboarding and prices for Vantage. Watchlist and calendar edits go through the Supabase REST API with a session token; see externalDocs for its generated description and the agent brief for the full flow.",
    },
    externalDocs: {
      description: "Supabase's generated description of the watchlist and events tables",
      url: u.restOpenapi,
    },
    servers: [{ url: e.base }],
    components: {
      securitySchemes: {
        session: {
          type: "http",
          scheme: "bearer",
          description: `A Supabase access token. Refresh at ${u.tokenRefresh} with the apikey header.`,
        },
      },
      schemas: { Group: group, Item: item, Event: event, Session: session },
    },
    paths: {
      "/": {
        get: {
          summary:
            "Prices for the caller's watchlist (the default list when anonymous), or a symbol lookup",
          parameters: [
            {
              name: "range",
              in: "query",
              schema: { type: "string", enum: ["1d", "24h", "1w", "history"] },
            },
            {
              name: "lookup",
              in: "query",
              schema: { type: "string" },
              description: "Ticker or company name to resolve to Yahoo symbols (needs a session)",
            },
          ],
          security: [{}, { session: [] }],
          responses: {
            "200": {
              description: "Groups, items and one price series per item; or lookup results",
            },
          },
        },
      },
      "/onboard": {
        post: {
          summary: "Create an account for an email, with the default list or the given one",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    email: { type: "string", format: "email" },
                    defaults: {
                      type: "boolean",
                      description:
                        "Seed Vantage's default groups and companies. Defaults to true when no groups or items are given, false otherwise.",
                    },
                    groups: { type: "array", items: group },
                    items: { type: "array", items: item },
                  },
                  required: ["email"],
                },
              },
            },
          },
          responses: {
            "201": {
              description:
                "Account created; a session for the agent and a sign-in email for the human",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      email: { type: "string" },
                      session: session,
                      signInEmailSent: { type: "boolean" },
                      warnings: { type: "array", items: { type: "string" } },
                      api: { type: "object", description: "Every endpoint the agent needs" },
                    },
                  },
                },
              },
            },
            "409": { description: "The email already has an account" },
          },
        },
      },
      "/rest-openapi.json": {
        get: {
          summary: "Supabase's generated OpenAPI document for the watchlist tables",
          responses: { "200": { description: "OpenAPI 2 (Swagger) from PostgREST" } },
        },
      },
      "/agent": {
        get: {
          summary: "The onboarding brief to paste to an agent",
          responses: { "200": { description: "Markdown" } },
        },
      },
      "/openapi.json": {
        get: { summary: "This document", responses: { "200": { description: "OpenAPI" } } },
      },
    },
  };
}
