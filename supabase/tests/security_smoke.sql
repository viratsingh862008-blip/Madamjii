-- Database-level security smoke tests for the configured Supabase development project.
-- Run with a privileged database connection after applying migrations. These assertions
-- verify catalog/grant invariants; they do not replace per-user end-to-end RLS tests.

do $$
declare
  v_unprotected_tables text;
  v_exposed_sensitive_tables text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ')
    into v_unprotected_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_unprotected_tables is not null then
    raise exception 'Public tables without RLS: %', v_unprotected_tables;
  end if;

  select string_agg(c.relname, ', ')
    into v_exposed_sensitive_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname = any(array[
      'care_invitations', 'push_subscriptions', 'reminder_jobs',
      'delivery_attempts', 'retention_runs'
    ])
    and (
      has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('authenticated', c.oid, 'SELECT')
    );

  if v_exposed_sensitive_tables is not null then
    raise exception 'Server-only tables grant SELECT to API roles: %', v_exposed_sensitive_tables;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'create_care_space_with_consent', 'create_care_invitation',
        'accept_care_invitation', 'review_shared_schedule'
      ])
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'An application RPC is executable by anon';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'RLS event-trigger function is executable by API roles';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'care_spaces'
      and policyname = 'care spaces readable by active members'
  ) then
    raise exception 'Expected care-space membership RLS policy is missing';
  end if;
end;
$$;
