export type Endpoints = {
  /** This function. */
  base: string;
  /** Project URL. */
  supabase: string;
  /** Publishable key; sent as the `apikey` header on every Supabase call. */
  anonKey: string;
  /** The web app. */
  site: string;
};

export const endpoints = (e: Endpoints) => ({
  onboard: `${e.base}/onboard`,
  token: `${e.base}/token`,
  prices: `${e.base}?range=1d`,
  lookup: `${e.base}?lookup=CRWD`,
  tokenRefresh: `${e.supabase}/auth/v1/token?grant_type=refresh_token`,
  rest: `${e.supabase}/rest/v1`,
  restOpenapi: `${e.base}/rest-openapi.json`,
  openapi: `${e.base}/openapi.json`,
  instructions: `${e.base}/agent`,
  anonKey: e.anonKey,
  site: e.site,
});

export async function agentInstructions(e: Endpoints) {
  const values: Record<string, string> = endpoints(e);
  const template = await Deno.readTextFile(new URL("./agent.md", import.meta.url));
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`agent.md: unknown placeholder {{${key}}}`);
    return values[key];
  });
}

// Table edits go through Supabase's REST layer, which describes itself.
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
  const session = {
    type: "object",
    properties: {
      access_token: { type: "string" },
      refresh_token: {
        type: "string",
        description: "Store it durably; each refresh returns a replacement to use next time",
      },
      expires_at: { type: "integer", description: "Unix seconds" },
    },
  };
  return {
    openapi: "3.0.3",
    info: {
      title: "Vantage API",
      version: "2",
      description: `Accounts, sessions and prices. The user's data (watchlist, calendar, news, broker account) is read and written through the Supabase REST API at ${u.rest}, described at ${u.restOpenapi}, with a session.`,
    },
    externalDocs: {
      description: "The user's data tables",
      url: u.restOpenapi,
    },
    servers: [{ url: e.base }],
    components: {
      securitySchemes: {
        agentKey: {
          type: "http",
          scheme: "bearer",
          description: "An agent key the owner made under Agent keys; exchange it at /token",
        },
        session: {
          type: "http",
          scheme: "bearer",
          description: `A Supabase access token, valid until the session's expires_at. Refresh it: POST ${u.tokenRefresh} with header apikey: ${e.anonKey} and JSON {"refresh_token"}.`,
        },
      },
      schemas: { Group: group, Item: item, Session: session },
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
                "Account created: a session for the agent, and a sign-in email sent to the user",
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
            "409": {
              description:
                "The email already has an account: the user signs in on the site and can make an agent key there",
            },
          },
        },
      },
      "/token": {
        post: {
          summary: "Exchange an agent key for a session",
          security: [{ agentKey: [] }],
          responses: {
            "200": {
              description: "A session for the key's owner; exchange the key again once it expires",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      session: session,
                      api: { type: "object", description: "Every endpoint the agent needs" },
                    },
                  },
                },
              },
            },
            "401": { description: "Unknown or revoked key" },
            "429": { description: "Too many attempts from this address" },
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
          summary: "Instructions for an agent working with Vantage",
          responses: { "200": { description: "Markdown" } },
        },
      },
      "/openapi.json": {
        get: { summary: "This document", responses: { "200": { description: "OpenAPI" } } },
      },
    },
  };
}
