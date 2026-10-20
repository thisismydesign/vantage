-- Signed-in routes throttle per user, so a row's caller is an address or a user id.
alter table public.throttle rename column ip to caller;
alter index public.throttle_ip_route_at rename to throttle_caller_route_at;
