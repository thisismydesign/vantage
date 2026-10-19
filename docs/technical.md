# Technical overview

Purpose: the stack and the principles every change MUST respect. Intent, not implementation.

## Stack

- App: React + Mantine via Vite, static assets on Cloudflare Workers.
- Backend: Supabase — Postgres, Auth (email + password, no emails sent), Edge Functions (Deno), Vault.
- Data: Yahoo Finance (prices, FX). Broker statements (positions, trades) arrive from the owner's agent.

## Principles

### Security first

- Multi-tenant by construction: `owner` column + RLS on every user table. Policies enforce isolation, not application code.
- Secrets never reach the browser. Broker tokens sit in Vault, service role only.
- Every endpoint is rate-limited; public ones more strictly.

### Lean on Supabase

- Auth, PostgREST, RLS, Vault and generated OpenAPI before custom code.
- Edge Functions only for what those cannot do.

### One contract between app and backend

- `app/` and `supabase/functions/` never import each other. What both must agree on lives once in `shared/`: the function's responses, the values the schema constrains, the agent-key protocol, the range windows.
- `shared/` holds only that contract. It imports nothing, so it runs in the browser, Deno and Node alike.
- Tooling (`supabase/seed/`, `tests/`, `e2e/`) may import any side.

### Mobile-first

### Agent-first

- Everything a person can do, an agent MUST be able to do via the API.
- Capabilities ship with their API and docs.
