-- Broker data in typed columns, so the REST API describes, checks and filters
-- it. A snapshot keeps the statement's header; its holdings become rows of
-- snapshot_positions. Existing JSON is carried over, then dropped.

-- Fills ---------------------------------------------------------------------

alter table public.trade_fills
  add column account_id text,
  add column conid text,
  add column order_id text,
  add column symbol text,
  add column description text not null default '',
  add column asset_category text not null default '',
  add column currency text,
  add column side text,
  add column quantity numeric,
  add column price numeric,
  add column multiplier numeric not null default 1,
  add column proceeds numeric not null default 0,
  add column commission numeric not null default 0,
  add column net_cash numeric,
  add column fx_rate_to_base numeric,
  add column broker_pnl numeric,
  add column open_close text;

update public.trade_fills set
  account_id = nullif(data->>'accountId', ''),
  conid = nullif(data->>'conid', ''),
  order_id = nullif(data->>'orderId', ''),
  symbol = data->>'symbol',
  description = coalesce(data->>'description', ''),
  asset_category = coalesce(data->>'assetCategory', ''),
  currency = data->>'currency',
  side = data->>'side',
  quantity = (data->>'quantity')::numeric,
  price = (data->>'price')::numeric,
  multiplier = coalesce((data->>'multiplier')::numeric, 1),
  proceeds = coalesce((data->>'proceeds')::numeric, 0),
  commission = coalesce((data->>'commission')::numeric, 0),
  net_cash = coalesce(
    (data->>'netCash')::numeric,
    coalesce((data->>'proceeds')::numeric, 0) + coalesce((data->>'commission')::numeric, 0)
  ),
  fx_rate_to_base = (data->>'fxRateToBase')::numeric,
  broker_pnl = (data->>'fifoPnlRealized')::numeric,
  open_close = nullif(data->>'openClose', '');

-- The exchange's wall-clock time, as the broker reports it. The old column
-- held the same wall time mislabelled as UTC.
alter table public.trade_fills
  alter column traded_at type timestamp using nullif(data->>'dateTime', '')::timestamp;

alter table public.trade_fills
  alter column traded_at set not null,
  alter column symbol set not null,
  alter column currency set not null,
  alter column side set not null,
  alter column quantity set not null,
  alter column price set not null,
  alter column net_cash set not null,
  add constraint trade_fills_side check (side in ('buy', 'sell')),
  drop column data;

create index trade_fills_owner_traded_at on public.trade_fills (owner, traded_at);
create index trade_fills_owner_symbol on public.trade_fills (owner, symbol);

-- Positions -----------------------------------------------------------------

create table public.snapshot_positions (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid(),
  as_of date not null,
  account_id text,
  symbol text not null,
  description text not null default '',
  asset_category text not null default '',
  currency text not null,
  quantity numeric not null,
  mark_price numeric,
  position_value numeric,
  cost_basis numeric,
  unrealized_pnl numeric,
  fx_rate_to_base numeric,
  foreign key (owner, as_of) references public.portfolio_snapshots (owner, as_of)
    on update cascade on delete cascade
);
create index snapshot_positions_owner_as_of on public.snapshot_positions (owner, as_of);
create index snapshot_positions_owner_symbol on public.snapshot_positions (owner, symbol);

grant select, insert, update, delete on public.snapshot_positions to authenticated;
grant all on public.snapshot_positions to service_role;

alter table public.snapshot_positions enable row level security;
create policy "owner manages positions" on public.snapshot_positions
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

insert into public.snapshot_positions (
  owner, as_of, account_id, symbol, description, asset_category, currency, quantity,
  mark_price, position_value, cost_basis, unrealized_pnl, fx_rate_to_base
)
select s.owner, s.as_of, nullif(p."accountId", ''), p.symbol, coalesce(p.description, ''),
  coalesce(p."assetCategory", ''), p.currency, p.quantity, p."markPrice", p."positionValue",
  p."costBasisMoney", p."unrealizedPnl", p."fxRateToBase"
from public.portfolio_snapshots s,
  jsonb_to_recordset(s.positions) as p(
    "accountId" text, symbol text, description text, "assetCategory" text, currency text,
    quantity numeric, "markPrice" numeric, "positionValue" numeric, "costBasisMoney" numeric,
    "unrealizedPnl" numeric, "fxRateToBase" numeric
  );

alter table public.portfolio_snapshots drop column positions;

-- One day's statement, header and holdings, replaced in one transaction: a
-- re-sent day drops holdings that were sold since. Runs as the caller, so row
-- security keeps a session to its own rows; the sync function's service role
-- names the owner in `snapshot`.
create function public.put_portfolio_snapshot(snapshot jsonb, positions jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  who uuid := coalesce((snapshot->>'owner')::uuid, auth.uid());
  day date := (snapshot->>'as_of')::date;
begin
  insert into public.portfolio_snapshots (owner, as_of, account_id, base_currency, nav, cash, fetched_at)
  values (
    who, day, snapshot->>'account_id', snapshot->>'base_currency', (snapshot->>'nav')::numeric,
    (snapshot->>'cash')::numeric, coalesce((snapshot->>'fetched_at')::timestamptz, now())
  )
  on conflict (owner, as_of) do update set
    account_id = excluded.account_id,
    base_currency = excluded.base_currency,
    nav = excluded.nav,
    cash = excluded.cash,
    fetched_at = excluded.fetched_at;
  delete from public.snapshot_positions where owner = who and as_of = day;
  insert into public.snapshot_positions (
    owner, as_of, account_id, symbol, description, asset_category, currency, quantity,
    mark_price, position_value, cost_basis, unrealized_pnl, fx_rate_to_base
  )
  select who, day, p.account_id, p.symbol, coalesce(p.description, ''),
    coalesce(p.asset_category, ''), p.currency, p.quantity, p.mark_price, p.position_value,
    p.cost_basis, p.unrealized_pnl, p.fx_rate_to_base
  from jsonb_to_recordset(coalesce(positions, '[]')) as p(
    account_id text, symbol text, description text, asset_category text, currency text,
    quantity numeric, mark_price numeric, position_value numeric, cost_basis numeric,
    unrealized_pnl numeric, fx_rate_to_base numeric
  );
end;
$$;

revoke all on function public.put_portfolio_snapshot(jsonb, jsonb) from public, anon;
grant execute on function public.put_portfolio_snapshot(jsonb, jsonb) to authenticated, service_role;
