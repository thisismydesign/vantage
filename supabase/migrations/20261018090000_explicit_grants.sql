-- Table privileges spelled out. The hosted project still grants everything on
-- new tables by default, so this changes nothing there; a local database
-- grants nothing, and without these the API cannot reach any table. Row
-- security does the isolation either way.

grant select, insert, update, delete on
  public.watchlist, public.watchlist_themes, public.events, public.news,
  public.portfolio_snapshots, public.trade_fills
  to authenticated;
-- An agent key's hash is written once; a session may only rename or revoke.
grant select, insert, delete on public.api_keys to authenticated;
grant update (name, revoked_at) on public.api_keys to authenticated;
grant usage on sequence public.snapshot_positions_id_seq to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
