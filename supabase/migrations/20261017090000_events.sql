-- Calendar: dated events an owner or their agent records against a company on
-- the watchlist. Four categories drive the colours; `kind` names the specific
-- thing (earnings, dividend, launch…). Agents write through PostgREST with
-- their session; `external_id` keeps their pushes idempotent.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  ticker text not null,
  category text not null check (category in ('results', 'corporate', 'milestone', 'external')),
  kind text,
  title text not null,
  description text,
  starts_on date not null,
  ends_on date check (ends_on >= starts_on),
  estimated boolean not null default false,
  source text,
  url text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, external_id),
  foreign key (owner, ticker) references public.watchlist (owner, ticker)
    on update cascade on delete cascade
);
create index events_owner_starts_on on public.events (owner, starts_on);

alter table public.events enable row level security;
create policy "owner manages events" on public.events
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();
