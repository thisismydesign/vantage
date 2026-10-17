-- Broker data arrives from the owner's agent through PostgREST, not a sync
-- function: owners may write their own snapshots and fills. The owner column
-- fills itself from the session, so the agent never sends it.

alter table public.portfolio_snapshots alter column owner set default auth.uid();
alter table public.trade_fills alter column owner set default auth.uid();

create policy "owner writes snapshots" on public.portfolio_snapshots
  for insert to authenticated with check (owner = auth.uid());
create policy "owner updates snapshots" on public.portfolio_snapshots
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner deletes snapshots" on public.portfolio_snapshots
  for delete to authenticated using (owner = auth.uid());

create policy "owner writes fills" on public.trade_fills
  for insert to authenticated with check (owner = auth.uid());
create policy "owner updates fills" on public.trade_fills
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner deletes fills" on public.trade_fills
  for delete to authenticated using (owner = auth.uid());
