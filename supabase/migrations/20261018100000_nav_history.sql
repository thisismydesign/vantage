-- Account value per day, from the broker's equity summary (IBKR Flex "Net
-- Asset Value"), for the portfolio's history chart. Kept apart from
-- portfolio_snapshots: one statement carries a year of these, backfilled in
-- one call, while a snapshot is the day whose holdings the page shows.

create table public.nav_history (
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  as_of date not null,
  account_id text,
  base_currency text not null,
  nav numeric not null,
  cash numeric,
  primary key (owner, as_of)
);

alter table public.nav_history enable row level security;
create policy "owner manages nav history" on public.nav_history
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

revoke all on public.nav_history from anon;
grant select, insert, update, delete on public.nav_history to authenticated;
grant all on public.nav_history to service_role;
