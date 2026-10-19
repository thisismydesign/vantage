# Deploy your own

Vantage runs on a Supabase project (database, auth, Edge Function) and a Cloudflare Worker (the web app).

## Supabase

1. Create a project, then `supabase link --project-ref <ref>`.
2. `pnpm run supabase:deploy` applies the migrations and deploys the function.
3. Set the function's secrets: `supabase secrets set VANTAGE_SITE_URL=<site>`, where `<site>` is the web app's URL (see Cloudflare). If the app uses the legacy anon key, also set `VANTAGE_ANON_KEY` to it.
4. In Authentication → URL Configuration, set Site URL to `<site>`.
5. Auth settings SHOULD match `[auth]` in `supabase/config.toml`: sign-ups off (the function creates accounts), email provider on.
6. Optional: run `supabase/seed/00_template.sql` in the SQL editor for the default watchlist new accounts start from. The other seed files MUST NOT run on a hosted project.

## Cloudflare

1. Fill in `.env` from `.env.example`.
2. `pnpm run deploy`. The site is `https://<name>.<subdomain>.workers.dev`, where `<name>` is `name` in `app/wrangler.jsonc`.

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

`PRODUCTION_URL` is `<site>`. The rest match `.env.example`, or come from the Supabase and Cloudflare dashboards.
