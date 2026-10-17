# Technical overview

Purpose: the stack and the principles every change MUST respect. Intent, not implementation.

## Stack

- App: React + Mantine via Vite, static assets on Cloudflare Workers.
- Backend: Supabase — Postgres, Auth (magic link), Edge Functions (Deno), Vault.
- Data: Yahoo Finance (prices, FX). Broker statements (positions, trades) arrive from the owner's agent.

## Principles

### Security first

- Multi-tenant by construction: `owner` column + RLS on every user table. Policies enforce isolation, not application code.
- Secrets never reach the browser. Broker tokens sit in Vault, service role only.
- Every endpoint is rate-limited; public ones more strictly.

### Lean on Supabase

- Auth, PostgREST, RLS, Vault and generated OpenAPI before custom code.
- Edge Functions only for what those cannot do.

### Mobile-first

### Agent-first

- Everything a person can do, an agent MUST be able to do via the API.
- Capabilities ship with their API and docs.
