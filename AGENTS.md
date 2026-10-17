# Vantage

Portfolio manager. Live: https://vantage.personal-553.workers.dev

## Docs

- `README.md` — for humans.
- `docs/` — detailed documentation. Read [`docs/technical.md`](docs/technical.md) first.
- `AGENTS.md` — how to work here.

## Layout

```
app/                     web app; app/wrangler.jsonc deploys app/dist
shared/types.ts          shapes shared by app and functions
supabase/functions/      vantage (API, onboarding), _shared helpers
supabase/migrations/     schema, policies, grants
tests/                   node:test specs for _shared
```

## Commands

```bash
mise install && cp .env.example .env && pnpm install && supabase link
pnpm run dev                                   # local sign-in as VANTAGE_DEV_EMAIL
pnpm run lint && pnpm run typecheck && pnpm run test
pnpm run e2e                                   # preview build + browser specs; needs .env
E2E_BASE_URL=https://... pnpm run e2e          # same specs against a deployed site
pnpm run supabase:deploy && pnpm run deploy
```

## Rules

- MUST NOT read `.env`; document new vars in `.env.example`.
- MUST NOT deploy without instruction.
- Schema changes MUST be new migration files.
- User-data tables MUST have `owner` and RLS policies.
- `_shared` MUST run under Deno and Node.
- Docs MUST stay terse and MUST NOT state what the code already shows; prescriptions use RFC 2119.
