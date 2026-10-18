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
supabase/seed/           local data: the template and a dev account
lint/                    custom ESLint rules
tests/                   node:test unit specs
```

## Commands

```bash
mise install && cp .env.example .env && pnpm install && supabase link
supabase start                                 # local stack; needs Docker
pnpm run dev                                   # local stack, signed in as dev@vantage.test
supabase db reset                              # re-apply migrations and seed
pnpm run lint && pnpm run typecheck && pnpm run test
pnpm run e2e                                   # preview build + browser specs on the local stack
E2E_BASE_URL=https://... pnpm run e2e          # same specs against a deployed site; needs .env
pnpm run supabase:deploy && pnpm run deploy
```

## Rules

- MUST NOT read `.env`; document new vars in `.env.example`.
- Development and tests MUST use the local stack; only deploys and `E2E_BASE_URL` runs touch the hosted project.
- Tables MUST grant their privileges explicitly; the local stack grants none by default.
- MUST NOT deploy without instruction.
- Schema changes MUST be new migration files.
- User-data tables MUST have `owner` and RLS policies.
- `_shared` MUST run under Deno and Node.
- Code MUST explain itself; comments SHOULD NOT be needed. Comments and docs MAY record a reason the code cannot show and MUST NOT explain how it works.
- All prose — comments, docs, messages — MUST stay terse; prescriptions use RFC 2119.
