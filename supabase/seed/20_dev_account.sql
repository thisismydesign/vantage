-- The account `pnpm run dev` signs in as: the template watchlist, a year of
-- broker history priced off seed.prices (fills, a snapshot per statement day,
-- daily NAV), and a calendar and news around today. Statement days shift by
-- whole weeks so the history ends in the past week; weekdays stay weekdays.
--
-- One block: the CLI sends a seed file as one batch, and a block resolves the
-- scratch tables it creates as it goes.

do $seed$
declare
  me constant uuid := '00000000-0000-4000-8000-000000000001';
  o record;
  v_n int := 0;
  v_held numeric;
  v_cost numeric;
  v_price numeric;
  v_fx numeric;
  v_commission numeric;
  v_net numeric;
  v_released numeric;
begin

-- Account ----------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', me, 'authenticated', 'authenticated',
  'dev@vantage.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
);
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (
  me::text, me,
  jsonb_build_object('sub', me::text, 'email', 'dev@vantage.test', 'email_verified', true),
  'email', now(), now()
);

insert into public.watchlist_themes (owner, id, label, position)
select me, id, label, position from public.default_themes;
insert into public.watchlist (owner, ticker, name, quote_symbol, currency, themes, aliases, disabled, position)
select me, ticker, name, quote_symbol, currency, themes, aliases, disabled, position
from public.default_watchlist;

-- Statement days and prices ------------------------------------------------------

-- US trading days, numbered from 0, with the date each is shown on.
create table seed.days as
with shift as (
  select 7 * greatest(0, (current_date - 1 - max(day)) / 7) as n from seed.prices where symbol = 'MU'
)
select (row_number() over (order by day) - 1)::int as k, day as source_day, day + shift.n as day
from seed.prices, shift
where symbol = 'MU';

-- Every symbol's last close on or before each statement day; EUR is the base.
create table seed.marks as
select d.k, s.symbol, p.close
from seed.days d
cross join (select distinct symbol from seed.prices) s
cross join lateral (
  select p.close from seed.prices p
  where p.symbol = s.symbol and p.day <= d.source_day
  order by p.day desc limit 1
) p;
insert into seed.marks select k, 'EUR', 1 from seed.days;

-- Instruments and what was done with them ------------------------------------------

create table seed.instruments (symbol text primary key, conid text, description text, currency text);
insert into seed.instruments values
  ('MU', '9939', 'MICRON TECHNOLOGY INC', 'USD'),
  ('NVDA', '4815747', 'NVIDIA CORP', 'USD'),
  ('GOOG', '208813720', 'ALPHABET INC-CL C', 'USD'),
  ('TSLA', '76792991', 'TESLA INC', 'USD'),
  ('LITE', '209279269', 'LUMENTUM HOLDINGS INC', 'USD'),
  ('COHR', '590213434', 'COHERENT CORP', 'USD'),
  ('AAOI', '120226155', 'APPLIED OPTOELECTRONICS INC', 'USD'),
  ('MSFT', '272093', 'MICROSOFT CORP', 'USD'),
  ('NET', '310474599', 'CLOUDFLARE INC - CLASS A', 'USD'),
  ('CRWD', '370757802', 'CROWDSTRIKE HOLDINGS INC - A', 'USD'),
  ('SOI', '48553216', 'SOITEC', 'EUR'),
  ('IQEl', '29638458', 'IQE PLC', 'GBP');

-- Trading day, symbol, signed quantity: long holds, a scaled entry, a partial
-- exit, closed winners and losers, and one short.
create table seed.orders (k int, symbol text, quantity numeric);
insert into seed.orders values
  (5, 'IQEl', 100000),
  (10, 'TSLA', 40),
  (15, 'MU', 40),
  (25, 'NVDA', 150),
  (35, 'SOI', 200),
  (50, 'GOOG', 80),
  (60, 'AAOI', 300),
  (65, 'LITE', 50),
  (70, 'MSFT', 30),
  (110, 'MSFT', -30),
  (120, 'TSLA', -40),
  (125, 'MU', 20),
  (130, 'NET', 60),
  (140, 'TSLA', -30),
  (160, 'COHR', 100),
  (170, 'AAOI', -300),
  (180, 'TSLA', 30),
  (190, 'SOI', 100),
  (200, 'LITE', -20),
  (220, 'NET', -60),
  (230, 'CRWD', 50);

-- Cash paid in, in base currency.
create table seed.deposits (k int, amount numeric);
insert into seed.deposits values (0, 100000), (125, 25000);

-- Fills ------------------------------------------------------------------------------

-- Each order against the running position: an opening adds its cash to the
-- position's cost; a closing releases cost pro rata and realises the rest, as
-- the broker's FIFO figure would for a single lot.
create table seed.fills (
  n int, k int, symbol text, currency text, quantity numeric, price numeric, commission numeric,
  net_cash numeric, fx numeric, pnl numeric, open_close text, quantity_after numeric, cost_after numeric
);
for o in
  select seed.orders.*, i.currency from seed.orders join seed.instruments i using (symbol)
  order by k, symbol
loop
  v_n := v_n + 1;
  select coalesce(sum(f.quantity), 0) into v_held from seed.fills f where f.symbol = o.symbol;
  select coalesce((array_agg(f.cost_after order by f.n desc))[1], 0) into v_cost
    from seed.fills f where f.symbol = o.symbol;
  select m.close into v_price from seed.marks m where m.k = o.k and m.symbol = o.symbol;
  select m.close into v_fx from seed.marks m where m.k = o.k and m.symbol = o.currency;
  v_commission := -round(greatest(1, least(abs(o.quantity) * 0.005, abs(o.quantity * v_price) * 0.001)), 2);
  v_net := round(-o.quantity * v_price, 2) + v_commission;
  if v_held = 0 or sign(v_held) = sign(o.quantity) then
    insert into seed.fills values (v_n, o.k, o.symbol, o.currency, o.quantity, v_price,
      v_commission, v_net, v_fx, 0, 'O', v_held + o.quantity, v_cost - v_net);
  else
    v_released := v_cost * abs(o.quantity) / abs(v_held);
    insert into seed.fills values (v_n, o.k, o.symbol, o.currency, o.quantity, v_price,
      v_commission, v_net, v_fx, round(v_net - v_released, 2), 'C', v_held + o.quantity,
      v_cost - v_released);
  end if;
end loop;

insert into public.trade_fills (
  owner, id, traded_at, account_id, conid, order_id, symbol, description, asset_category,
  currency, side, quantity, price, multiplier, proceeds, commission, net_cash,
  fx_rate_to_base, broker_pnl, open_close
)
select me, 'seed-' || lpad(f.n::text, 3, '0'),
  d.day + time '10:00' + make_interval(mins => f.n * 13), 'U1234567', i.conid,
  'seed-order-' || f.n, f.symbol, i.description, 'STK', f.currency,
  case when f.quantity > 0 then 'buy' else 'sell' end, f.quantity, f.price, 1,
  round(-f.quantity * f.price, 2), f.commission, f.net_cash, f.fx, f.pnl, f.open_close
from seed.fills f
join seed.days d using (k)
join seed.instruments i using (symbol);

-- Statements ---------------------------------------------------------------------------

-- Each day's holdings: the position after that symbol's last fill so far.
create table seed.holdings as
select d.k, i.symbol, i.currency, i.description, f.quantity_after as quantity,
  f.cost_after as cost, m.close as mark, r.close as rate
from seed.days d
cross join seed.instruments i
cross join lateral (
  select f.quantity_after, f.cost_after from seed.fills f
  where f.symbol = i.symbol and f.k <= d.k
  order by f.n desc limit 1
) f
join seed.marks m on m.k = d.k and m.symbol = i.symbol
join seed.marks r on r.k = d.k and r.symbol = i.currency
where f.quantity_after <> 0;

-- Cash per currency, valued at each day's rate.
create table seed.statements as
select d.k, d.day, round(c.cash + coalesce(h.value, 0), 2) as nav, round(c.cash, 2) as cash
from seed.days d
cross join lateral (
  select sum(b.amount * r.close) as cash
  from (
    select 'EUR' as currency, sum(x.amount) as amount from seed.deposits x where x.k <= d.k
    union all
    select f.currency, sum(f.net_cash) from seed.fills f where f.k <= d.k group by f.currency
  ) b
  join seed.marks r on r.k = d.k and r.symbol = b.currency
) c
left join (
  select h.k, sum(h.quantity * h.mark * h.rate) as value from seed.holdings h group by h.k
) h on h.k = d.k;

insert into public.portfolio_snapshots (owner, as_of, account_id, base_currency, nav, cash, fetched_at)
select me, s.day, 'U1234567', 'EUR', s.nav, s.cash, s.day + interval '1 day 6 hours'
from seed.statements s;

insert into public.snapshot_positions (
  owner, as_of, account_id, symbol, description, asset_category, currency, quantity,
  mark_price, position_value, cost_basis, unrealized_pnl, fx_rate_to_base
)
select me, d.day, 'U1234567', h.symbol, h.description, 'STK', h.currency, h.quantity, h.mark,
  round(h.quantity * h.mark, 2), round(h.cost, 2), round(h.quantity * h.mark - h.cost, 2), h.rate
from seed.holdings h
join seed.days d using (k);

insert into public.nav_history (owner, as_of, account_id, base_currency, nav, cash)
select me, s.day, 'U1234567', 'EUR', s.nav, s.cash from seed.statements s;

-- Calendar and news, around today ---------------------------------------------------------

insert into public.events (
  owner, ticker, category, kind, title, description, starts_on, ends_on, estimated, source, external_id
)
select me, e.ticker, e.category, e.kind, e.title, e.description, current_date + e.starts,
  current_date + e.ends, e.estimated, 'seed', 'seed-event-' || row_number() over ()
from (values
  ('CRWD', 'milestone', 'conference', 'Fal.Con', 'Annual customer conference; product roadmap keynote.', -30, -27, false),
  ('TSLA', 'results', 'earnings', 'Q3 earnings', 'Deliveries already out; margins and robotaxi timing in focus.', -12, null, false),
  ('IQE', 'corporate', 'm&a', 'Strategic review update', 'Board to report on the sale process for the wafer business.', -8, null, false),
  ('GOOG', 'results', 'earnings', 'Q3 earnings', null, -4, null, false),
  ('MSFT', 'results', 'earnings', 'FY27 Q1 earnings', 'Azure growth and capex guidance.', -2, null, false),
  ('AAPL', 'corporate', 'dividend', 'Quarterly dividend (ex-date)', '$0.27 per share.', 3, null, false),
  ('SOI', 'milestone', 'investor day', 'Capital markets day', 'New mid-term targets expected for photonics-SOI.', 6, null, false),
  ('MU', 'results', 'earnings', 'Q1 FY27 earnings', 'HBM pricing and supply commentary.', 9, null, false),
  ('META', 'results', 'earnings', 'Q3 earnings', null, 11, null, true),
  ('NVDA', 'milestone', 'conference', 'GTC Washington', 'Keynote on the first day.', 12, 14, false),
  ('BTC', 'external', 'macro', 'FOMC rate decision', null, 16, 17, false),
  ('LITE', 'results', 'earnings', 'Q1 FY27 earnings', null, 17, null, true),
  ('MU', 'external', 'regulation', 'Export-rule decision on memory to China', 'Commerce Department ruling expected.', 20, null, true),
  ('COHR', 'milestone', 'investor day', 'Investor day', null, 24, null, true),
  ('NVDA', 'results', 'earnings', 'Q3 FY27 earnings', null, 38, null, true)
) as e(ticker, category, kind, title, description, starts, ends, estimated);

insert into public.news (
  owner, ticker, published_at, source, title, description, url, sentiment, expected, external_id
)
select me, n.ticker, now() - make_interval(hours => n.hours), 'seed', n.title, n.description,
  'https://example.com/news/' || row_number() over (), n.sentiment, n.expected,
  'seed-news-' || row_number() over ()
from (values
  ('MU', 3, 'Micron lifts HBM output target for next year', 'Capacity additions pulled forward on hyperscaler demand.', 'positive', false),
  ('NVDA', 7, 'Nvidia ships first rack-scale systems to new cloud partners', null, 'positive', true),
  ('LITE', 20, 'Lumentum sees transceiver lead times stretching', 'Laser supply remains the bottleneck into next year.', 'mixed', null),
  ('SOI', 26, 'Soitec trims full-year revenue outlook', 'Mobile weakness offsets photonics growth.', 'negative', true),
  ('IQE', 30, 'IQE confirms talks with two bidders', null, 'positive', false),
  ('GOOG', 50, 'Alphabet cloud backlog tops estimates', 'Margins expand for a fourth straight quarter.', 'positive', false),
  ('TSLA', 75, 'Tesla delays wider robotaxi rollout', null, 'negative', true),
  ('CRWD', 96, 'CrowdStrike adds cloud-security module', 'Pricing bundled with the existing platform tier.', 'neutral', null),
  ('COHR', 120, 'Coherent reorganises its industrial lasers unit', null, 'neutral', true),
  ('AAOI', 150, 'Applied Optoelectronics wins second hyperscaler order', 'Shipments start next quarter.', 'positive', false),
  ('MU', 190, 'Memory spot prices dip for the first time in months', null, 'negative', null),
  ('NET', 230, 'Cloudflare raises guidance on enterprise demand', null, 'positive', false)
) as n(ticker, hours, title, description, sentiment, expected);

drop schema seed cascade;

end;
$seed$;
