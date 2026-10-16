# Technical overview

Purpose: the goal, stack and principles every change MUST respect. Intent, not implementation.

## Goal

A portfolio manager a person or their agent runs: grouped watchlist with charts, positions from the broker, scored trade history. One deployment, many tenants, each sees only their own.

## Stack

- App: React + Mantine via Vite, static assets on Cloudflare Workers.
- Backend: Supabase — Postgres, Auth (magic link), Edge Functions (Deno), Vault.
- Data: Yahoo Finance (prices, FX), Interactive Brokers Flex (positions, trades).

## Principles

- **Security first.** Multi-tenant by construction: `owner` column + RLS on every user table. Secrets never reach the browser; broker tokens sit in Vault, service role only. Public endpoints are rate-limited.
- **Lean on Supabase.** Auth, PostgREST, RLS, Vault and generated OpenAPI before custom code. Edge Functions only for what they cannot do.
- **Mobile-first.** Phone layout is the design; desktop enlarges it.
- **Agent-first.** Everything a person can do, an agent MUST be able to do via the API, as onboarding already is (`/agent` brief). Capabilities ship with their API and docs.
