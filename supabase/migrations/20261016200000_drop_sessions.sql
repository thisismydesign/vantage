-- The sessions list left the UI; nothing calls this any more. Dropping it also
-- clears the "signed-in users can execute SECURITY DEFINER" advisory.
drop function if exists public.my_sessions();
