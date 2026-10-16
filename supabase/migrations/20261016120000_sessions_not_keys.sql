-- Agents hold Supabase sessions instead of custom API keys: /onboard mints a
-- session for the new user and hands over its refresh token. The owner can
-- list their sessions to see which agents and devices are signed in.

drop table public.api_keys;

create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text)
language sql
security definer
set search_path = auth, public
as $$
  select s.id, s.created_at, s.updated_at, s.user_agent
  from auth.sessions s
  where s.user_id = auth.uid()
  order by s.created_at;
$$;

revoke all on function public.my_sessions() from public;
grant execute on function public.my_sessions() to authenticated;
