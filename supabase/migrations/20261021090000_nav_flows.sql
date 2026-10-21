-- Deposits and withdrawals per day, so performance can tell money moved in from
-- money made. Null, not zero, for days sent before the agent reported them: a
-- missing flow must not read as "no deposit".

alter table public.nav_history add column flow numeric;

comment on table public.nav_history is 'Account value per day (IBKR''s Net Asset Value section). Upsert on (owner, as_of); send every day a statement holds, with its flow.';
comment on column public.nav_history.flow is 'Money and positions moved in (positive) or out (negative), in base currency: deposits, withdrawals, transfers. Counts at the start of the day, as IBKR''s PortfolioAnalyst does; a flow on a day without a value goes on the next day with one. 0 when nothing moved; null leaves the day''s performance unknown.';
