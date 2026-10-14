-- Persist one profile per Supabase Auth user. Safe additive migration.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80);

  if char_length(profile_name) < 2 then
    profile_name := left(coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New member'), 80);
  end if;

  if char_length(profile_name) < 2 then
    profile_name := 'New member';
  end if;

  insert into public.profiles (user_id, full_name)
  values (new.id, profile_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

-- Backfill any accounts that existed before this trigger was installed.
insert into public.profiles (user_id, full_name)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'New member'
    ),
    80
  )
from auth.users as u
on conflict (user_id) do nothing;

-- A database-owned timestamp avoids trusting client-provided updated_at values.
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_profile_updated_at() from public, anon, authenticated;
drop trigger if exists touch_profile_updated_at on public.profiles;
create trigger touch_profile_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();
