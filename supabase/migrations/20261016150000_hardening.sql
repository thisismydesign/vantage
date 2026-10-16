-- Hardening after the tenant-isolation review.

-- Supabase's default privileges grant execute to anon as well; the session
-- listing is for signed-in owners only.
revoke execute on function public.my_sessions() from anon;

-- Onboarding is public by design (it creates accounts for strangers), so the
-- Edge Function throttles it per caller address. Service role only.
create table public.onboard_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  email text,
  at timestamptz not null default now()
);
create index onboard_attempts_ip_at on public.onboard_attempts (ip, at desc);
alter table public.onboard_attempts enable row level security;
