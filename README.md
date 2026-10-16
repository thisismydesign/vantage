# Vantage

Hosted watchlist, charts, portfolio and trades. React + Mantine on Cloudflare Workers; Supabase for auth, data and edge functions.

Live: https://vantage.personal-553.workers.dev

## Layout

```
app/                     Vite + React app; wrangler.jsonc deploys app/dist as static assets
shared/types.ts          shapes shared by the app and the edge functions
supabase/
  functions/vantage/     public read API, watchlist, agent onboarding
  functions/broker-sync/ Interactive Brokers Flex sync
  functions/_shared/     history, FX, intraday and Flex helpers
  migrations/            schema
tests/                   node:test specs for the shared helpers
```

## Setup

```bash
mise install
cp .env.example .env     # fill in from the Supabase dashboard
pnpm install
supabase link            # once per machine
pnpm run dev             # http://localhost:5173, signed in as VANTAGE_DEV_EMAIL
```

## Deploy

```bash
pnpm run supabase:deploy # migrations + edge functions
pnpm run deploy          # build and upload the app with wrangler
```

## Checks

`pnpm run lint`, `pnpm run typecheck`, `pnpm run test`.

## Origin

Extracted from the private `knowledge` repo on 2026-10-16. That repo keeps the local wiki and seeds this project's default watchlist with `pnpm run vantage:push-watchlist`.
