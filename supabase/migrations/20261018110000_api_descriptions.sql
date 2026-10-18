-- What agents need to know about the tables, as comments: PostgREST puts them
-- in the generated REST description, which /rest-openapi.json relays.

comment on table public.watchlist is 'Companies the user follows.';
comment on column public.watchlist.quote_symbol is 'Yahoo Finance symbol the charts use';
comment on column public.watchlist.themes is 'watchlist_themes ids the company is grouped under';
comment on column public.watchlist.aliases is 'Broker symbols that mean this ticker';
comment on column public.watchlist.disabled is 'Hidden from the charts';

comment on table public.watchlist_themes is 'Groups on the watchlist.';

comment on table public.events is 'Calendar: dated things about watchlist companies. Upsert on (owner, external_id).';
comment on column public.events.ticker is 'Must be on the watchlist';
comment on column public.events.category is 'One of results, corporate, milestone, external';
comment on column public.events.kind is 'The specific thing: earnings, dividend, launch…';
comment on column public.events.ends_on is 'Inclusive; null for one day';
comment on column public.events.estimated is 'The date is not confirmed by the company';
comment on column public.events.external_id is 'Caller-chosen stable id; re-sending it updates the row';

comment on table public.news is 'Articles about watchlist companies, with the agent''s read. Upsert on (owner, external_id).';
comment on column public.news.ticker is 'Must be on the watchlist';
comment on column public.news.source is 'Publisher or who said it';
comment on column public.news.description is 'Summary, or the reasoning behind the read';
comment on column public.news.sentiment is 'The agent''s read: one of positive, negative, neutral, mixed';
comment on column public.news.expected is 'The market had it priced in';
comment on column public.news.external_id is 'Caller-chosen stable id; re-sending it updates the row';

comment on table public.portfolio_snapshots is 'The broker account per statement day. Write through rpc/put_portfolio_snapshot.';
comment on table public.snapshot_positions is 'Holdings per statement day. Write through rpc/put_portfolio_snapshot.';
comment on column public.snapshot_positions.fx_rate_to_base is 'Converts the position''s amounts to the base currency';

comment on table public.nav_history is 'Account value per day (IBKR''s Net Asset Value section). Upsert on (owner, as_of); send every day a statement holds.';

comment on table public.trade_fills is 'Executions from the broker. Upsert on (owner, id).';
comment on column public.trade_fills.id is 'The broker''s trade id';
comment on column public.trade_fills.traded_at is 'The exchange''s local time, sent without a zone';
comment on column public.trade_fills.side is 'buy or sell';
comment on column public.trade_fills.quantity is 'Negative on a sell';
comment on column public.trade_fills.currency is 'Currency of the trade''s amounts';
comment on column public.trade_fills.fx_rate_to_base is 'Converts the trade''s amounts to the base currency';

comment on function public.put_portfolio_snapshot(jsonb, jsonb) is
  'Replace one statement day.
snapshot: {as_of, account_id, base_currency, nav, cash}. positions: [{account_id, symbol, description, asset_category, currency, quantity, mark_price, position_value, cost_basis, unrealized_pnl, fx_rate_to_base}]. Send every holding; those left out are dropped.';
