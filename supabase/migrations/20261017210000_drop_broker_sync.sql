-- Vantage stores and shows broker data; it no longer fetches it. Statements
-- arrive from the owner's agent through the REST API, so its connection table
-- and the Vault copies of broker tokens go.

delete from vault.secrets where name like 'ibkr:%' or name = 'broker_sync_key';

drop function public.broker_token_put(uuid, text);
drop function public.broker_token_get(uuid);
drop function public.broker_token_delete(uuid);
drop function public.vault_put(text, text);

drop table public.broker_connections;
