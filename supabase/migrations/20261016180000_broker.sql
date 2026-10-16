-- Broker data per tenant: an Interactive Brokers Flex connection whose token
-- lives in Vault, daily position snapshots, and an append-only trade history.
-- Owners read their rows through row security; only the broker-sync function
-- (service role) writes, after decrypting the token through the helpers below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Aliases let a broker symbol resolve to a watchlist ticker (IBKR calls IQE "IQEl").
alter table public.watchlist add column aliases text[] not null default '{}';
alter table public.default_watchlist add column aliases text[] not null default '{}';

create table public.broker_connections (
  owner uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'ibkr',
  token_secret uuid not null,
  positions_query_id text not null,
  trades_query_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_statement_date date,
  last_error text
);
alter table public.broker_connections enable row level security;
create policy "owner sees connection" on public.broker_connections
  for select to authenticated using (owner = auth.uid());

create table public.portfolio_snapshots (
  owner uuid not null references auth.users (id) on delete cascade,
  as_of date not null,
  account_id text,
  base_currency text,
  nav numeric,
  cash numeric,
  positions jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (owner, as_of)
);
alter table public.portfolio_snapshots enable row level security;
create policy "owner sees snapshots" on public.portfolio_snapshots
  for select to authenticated using (owner = auth.uid());

create table public.trade_fills (
  owner uuid not null references auth.users (id) on delete cascade,
  id text not null,
  traded_at timestamptz,
  data jsonb not null,
  primary key (owner, id)
);
alter table public.trade_fills enable row level security;
create policy "owner sees fills" on public.trade_fills
  for select to authenticated using (owner = auth.uid());

-- Vault helpers. Only the service role may call them; the token never passes
-- through a table a client can read.
create or replace function public.broker_token_put(p_owner uuid, p_token text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  existing uuid;
begin
  select token_secret into existing from public.broker_connections where owner = p_owner;
  if existing is not null then
    perform vault.update_secret(existing, p_token);
    return existing;
  end if;
  return vault.create_secret(p_token, 'ibkr:' || p_owner::text);
end;
$$;

create or replace function public.broker_token_get(p_owner uuid)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select s.decrypted_secret
  from public.broker_connections c
  join vault.decrypted_secrets s on s.id = c.token_secret
  where c.owner = p_owner;
$$;

create or replace function public.broker_token_delete(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  existing uuid;
begin
  select token_secret into existing from public.broker_connections where owner = p_owner;
  if existing is not null then
    delete from vault.secrets where id = existing;
  end if;
end;
$$;

-- A named secret for the scheduler: the key it sends to the sync function.
create or replace function public.vault_put(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  existing uuid;
begin
  select id into existing from vault.secrets where name = p_name;
  if existing is not null then
    perform vault.update_secret(existing, p_secret);
    return existing;
  end if;
  return vault.create_secret(p_secret, p_name);
end;
$$;

revoke all on function public.broker_token_put(uuid, text) from public, anon, authenticated;
revoke all on function public.broker_token_get(uuid) from public, anon, authenticated;
revoke all on function public.broker_token_delete(uuid) from public, anon, authenticated;
revoke all on function public.vault_put(text, text) from public, anon, authenticated;
grant execute on function public.broker_token_put(uuid, text) to service_role;
grant execute on function public.broker_token_get(uuid) to service_role;
grant execute on function public.broker_token_delete(uuid) to service_role;
grant execute on function public.vault_put(text, text) to service_role;

-- Flex statements for a session appear overnight; IBKR publishes no cutoff.
-- Try every hour through the morning (UTC); the function skips owners whose
-- latest statement already covers the previous session.
select cron.schedule(
  'broker-sync-morning',
  '0 5-11 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/broker-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'broker_sync_key')
    ),
    body := '{"all": true}'::jsonb
  );
  $$
);
