# Deploy your own

Vantage runs on a Supabase project (database, auth, Edge Function) and a Cloudflare Worker (the web app).

## Supabase

1. Create a project, then `supabase link --project-ref <ref>`.
2. `pnpm run supabase:deploy` applies the migrations and deploys the functions.
3. Set the functions' secrets: `supabase secrets set VANTAGE_SITE_URL=<site>`, where `<site>` is the web app's URL (see Cloudflare).
4. Auth settings SHOULD match `[auth]` in `supabase/config.toml`: sign-ups off (the function creates accounts), email provider on, minimum password length 8. Vantage sends no email.
5. Optional: run `supabase/seed/00_template.sql` in the SQL editor for the default watchlist new accounts start from. The other seed files MUST NOT run on a hosted project.

## Cloudflare

1. Fill in `.env` from `.env.example`.
2. `pnpm run deploy`. The site is the Custom Domain under `routes` in `app/wrangler.jsonc`; the zone MUST be in the same Cloudflare account, and wrangler creates the DNS record and certificate. Remove `routes` to serve from `https://<name>.<subdomain>.workers.dev` instead, where `<name>` is `name` in the same file.

## CI

`.github/workflows/ci.yml` deploys `main` and then runs the e2e specs against the site. It reads these repository settings:

| Variables               | Secrets                 |
| ----------------------- | ----------------------- |
| `SUPABASE_PROJECT_ID`   | `SUPABASE_ACCESS_TOKEN` |
| `SUPABASE_URL`          | `SUPABASE_DB_PASSWORD`  |
| `VITE_SUPABASE_URL`     | `SUPABASE_SECRET_KEY`   |
| `CLOUDFLARE_ACCOUNT_ID` | `VITE_SUPABASE_KEY`     |
| `PRODUCTION_URL`        | `CLOUDFLARE_API_TOKEN`  |
| `VANTAGE_TEST_EMAIL`    |                         |

`PRODUCTION_URL` is `<site>`. The rest match `.env.example`, or come from the Supabase and Cloudflare dashboards. `CLOUDFLARE_API_TOKEN` needs Workers Routes edit on the zone besides Workers Scripts edit, since every deploy syncs the Custom Domain.
