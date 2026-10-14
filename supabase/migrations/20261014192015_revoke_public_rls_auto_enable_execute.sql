-- This project already had an event-trigger function in public. It still runs as an event trigger,
-- but direct execution by API roles is not needed and should not be granted.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
