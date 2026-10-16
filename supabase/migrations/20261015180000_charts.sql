-- Charts backend: the watchlist the Edge Function may fetch, and a per-ticker
-- cache of what it fetched. Rows are read by the function with the service
-- role only; row-level security with no policies keeps the anon key out.

create table public.watchlist_themes (
  id text primary key,
  label text not null,
  position integer not null default 0
);

create table public.watchlist (
  ticker text primary key,
  name text not null,
  quote_symbol text,
  currency text,
  themes text[] not null default '{}',
  disabled boolean not null default false,
  position integer not null default 0
);

create table public.chart_cache (
  ticker text not null,
  range text not null,
  fetched_at timestamptz not null default now(),
  data jsonb not null,
  primary key (ticker, range)
);

alter table public.watchlist_themes enable row level security;
alter table public.watchlist enable row level security;
alter table public.chart_cache enable row level security;

-- Signups are disabled, so "authenticated" means the owner. The cache stays
-- closed: only the Edge Function's service role touches it.
create policy "owner manages themes" on public.watchlist_themes
  for all to authenticated using (true) with check (true);
create policy "owner manages watchlist" on public.watchlist
  for all to authenticated using (true) with check (true);
