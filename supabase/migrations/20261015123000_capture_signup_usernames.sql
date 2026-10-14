-- Keep the public profile's normalized username available for test/admin inspection.
-- Passwords are intentionally never copied to application tables.
alter table public.profiles
  add column if not exists username text;

update public.profiles as p
set username = lower(
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'member_' || left(replace(u.id::text, '-', ''), 12)
  )
)
from auth.users as u
where u.id = p.user_id
  and (p.username is null or btrim(p.username) = '');

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format;

alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9._-]{3,24}$');

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_username text;
begin
  profile_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80);
  profile_username := lower(btrim(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  )));

  if char_length(profile_name) < 2 then
    profile_name := profile_username;
  end if;
  if char_length(profile_name) < 2 then
    profile_name := 'New member';
  end if;

  if profile_username !~ '^[a-z0-9._-]{3,24}$' then
    profile_username := 'member_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  insert into public.profiles (user_id, full_name, username)
  values (new.id, profile_name, profile_username)
  on conflict (user_id) do update
    set username = excluded.username;

  return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
