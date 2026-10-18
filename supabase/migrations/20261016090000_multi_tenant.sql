-- Multi-tenancy. Every signed-in user owns a watchlist; the previous single
-- list becomes the template new accounts start from. Agents act through API
-- keys that the Edge Function hashes and checks.

-- Templates: what anonymous visitors see and what new accounts are seeded with.
create table public.default_themes (
  id text primary key,
  label text not null,
  position integer not null default 0
);
create table public.default_watchlist (
  ticker text primary key,
  name text not null,
  quote_symbol text,
  currency text,
  themes text[] not null default '{}',
  disabled boolean not null default false,
  position integer not null default 0
);
insert into public.default_themes select * from public.watchlist_themes;
insert into public.default_watchlist select * from public.watchlist;
alter table public.default_themes enable row level security;
alter table public.default_watchlist enable row level security;

-- Per-owner lists. The default fills the owner from the session on inserts
-- made through PostgREST, so the browser editor needs no change.
alter table public.watchlist_themes
  add column owner uuid references auth.users (id) on delete cascade default auth.uid();
alter table public.watchlist
  add column owner uuid references auth.users (id) on delete cascade default auth.uid();

-- The existing rows live on as the template; nothing unowned stays.
delete from public.watchlist_themes where owner is null;
delete from public.watchlist where owner is null;
alter table public.watchlist_themes alter column owner set not null;
alter table public.watchlist alter column owner set not null;

alter table public.watchlist_themes drop constraint watchlist_themes_pkey;
alter table public.watchlist_themes add primary key (owner, id);
alter table public.watchlist drop constraint watchlist_pkey;
alter table public.watchlist add primary key (owner, ticker);

drop policy "owner manages themes" on public.watchlist_themes;
drop policy "owner manages watchlist" on public.watchlist;
create policy "owner manages themes" on public.watchlist_themes
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner manages watchlist" on public.watchlist
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- API keys: the Edge Function stores a hash and resolves the owner from it.
-- Owners can see and revoke their keys; only the function creates them.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.api_keys enable row level security;
create policy "owner sees keys" on public.api_keys
  for select to authenticated using (owner = auth.uid());
create policy "owner revokes keys" on public.api_keys
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- The price cache is shared by every tenant, so it keys on the quote symbol.
truncate public.chart_cache;
alter table public.chart_cache rename column ticker to symbol;
