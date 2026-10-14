-- Security smoke checks for the persistent profile migration.
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'profiles'
  ) then
    raise exception 'public.profiles table missing';
  end if;

  if not coalesce((
    select relrowsecurity from pg_class
    where oid = 'public.profiles'::regclass
  ), false) then
    raise exception 'RLS is not enabled on public.profiles';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
      and qual like '%auth.uid%'
  ) then
    raise exception 'Own-profile SELECT policy missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
      and qual like '%auth.uid%'
      and with_check like '%auth.uid%'
  ) then
    raise exception 'Own-profile UPDATE policy missing';
  end if;

  if has_table_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'anon must not have SELECT on profiles';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'INSERT') then
    raise exception 'authenticated must not directly INSERT profiles';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'DELETE') then
    raise exception 'authenticated must not DELETE profiles';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created_profile'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    raise exception 'Auth-user profile trigger missing';
  end if;
end;
$$;
