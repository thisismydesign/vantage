-- News: items an owner or their agent records against a company on the
-- watchlist. The agent may add its judgement (sentiment, whether the market
-- expected it). Writes go through PostgREST; `external_id` keeps them idempotent.

create table public.news (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  ticker text not null,
  published_at timestamptz not null,
  source text,
  title text not null,
  description text,
  url text,
  sentiment text check (sentiment in ('positive', 'negative', 'neutral', 'mixed')),
  expected boolean,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, external_id),
  foreign key (owner, ticker) references public.watchlist (owner, ticker)
    on update cascade on delete cascade
);
create index news_owner_published_at on public.news (owner, published_at desc);

alter table public.news enable row level security;
create policy "owner manages news" on public.news
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

create trigger news_touch_updated_at
  before update on public.news
  for each row execute function public.touch_updated_at();
