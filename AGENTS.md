# Vantage

Portfolio manager. Live: https://vantage.personal-553.workers.dev

## Docs

- `README.md` — humans: title, one line, link.
- `docs/` — design and principles. Read [`docs/technical.md`](docs/technical.md) first.
- `AGENTS.md` — how to work here.

## Layout

```
app/                     web app; app/wrangler.jsonc deploys app/dist
shared/types.ts          shapes shared by app and functions
supabase/functions/      vantage (API, onboarding), broker-sync, _shared helpers
supabase/migrations/     schema, policies, grants
tests/                   node:test specs for _shared
```

## Commands

```bash
mise install && cp .env.example .env && pnpm install && supabase link
pnpm run dev                                   # local sign-in as VANTAGE_DEV_EMAIL
pnpm run lint && pnpm run typecheck && pnpm run test
pnpm run supabase:deploy && pnpm run deploy
```

## Rules

- MUST NOT read `.env`; document new vars in `.env.example`.
- MUST NOT deploy without instruction.
- Schema changes MUST be new migration files.
- User-data tables MUST have `owner` and RLS policies.
- `_shared` MUST run under Deno and Node.
- Docs MUST stay terse; prescriptions use RFC 2119.
