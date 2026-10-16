-- Agent keys: the durable credential a cold agent exchanges for a session at
-- POST /token. The browser creates a key (random, hashed client-side, shown
-- once) and can revoke it; the function reads hashes and stamps last use.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.api_keys enable row level security;
create policy "owner sees keys" on public.api_keys
  for select to authenticated using (owner = auth.uid());
create policy "owner adds keys" on public.api_keys
  for insert to authenticated with check (owner = auth.uid());
create policy "owner revokes keys" on public.api_keys
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner deletes keys" on public.api_keys
  for delete to authenticated using (owner = auth.uid());
-- The hash is written once; a session may only rename or revoke.
revoke update on public.api_keys from authenticated;
grant update (name, revoked_at) on public.api_keys to authenticated;

-- One throttle for every public route of the function, per address.
create table public.throttle (
  id bigint generated always as identity primary key,
  ip text not null,
  route text not null,
  at timestamptz not null default now()
);
create index throttle_ip_route_at on public.throttle (ip, route, at desc);
alter table public.throttle enable row level security;
insert into public.throttle (ip, route, at) select ip, 'onboard', at from public.onboard_attempts;
drop table public.onboard_attempts;
