-- Free notification foundation: persistent in-app notifications and per-user Web Push subscriptions.
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  notification_type text not null default 'general' check (notification_type in ('general','reminder','check_in','system')),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  constraint app_notifications_user_dedupe_unique unique (user_id, dedupe_key)
);
create index if not exists app_notifications_user_created_idx on public.app_notifications(user_id, created_at desc);
create index if not exists app_notifications_expiry_idx on public.app_notifications(expires_at);
alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from anon, public;
grant select, insert, update on public.app_notifications to authenticated;
drop policy if exists app_notifications_select_own on public.app_notifications;
create policy app_notifications_select_own on public.app_notifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists app_notifications_insert_own on public.app_notifications;
create policy app_notifications_insert_own on public.app_notifications for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists app_notifications_update_own on public.app_notifications;
create policy app_notifications_update_own on public.app_notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.browser_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists browser_push_subscriptions_user_active_idx on public.browser_push_subscriptions(user_id, active);
alter table public.browser_push_subscriptions enable row level security;
revoke all on public.browser_push_subscriptions from anon, public;
grant select, insert, update, delete on public.browser_push_subscriptions to authenticated;
drop policy if exists browser_push_select_own on public.browser_push_subscriptions;
create policy browser_push_select_own on public.browser_push_subscriptions for select to authenticated using (auth.uid() = user_id);
drop policy if exists browser_push_insert_own on public.browser_push_subscriptions;
create policy browser_push_insert_own on public.browser_push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists browser_push_update_own on public.browser_push_subscriptions;
create policy browser_push_update_own on public.browser_push_subscriptions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists browser_push_delete_own on public.browser_push_subscriptions;
create policy browser_push_delete_own on public.browser_push_subscriptions for delete to authenticated using (auth.uid() = user_id);
create or replace function public.set_browser_push_subscription_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); new.last_seen_at = now(); return new; end;
$$;
drop trigger if exists browser_push_subscription_updated_at on public.browser_push_subscriptions;
create trigger browser_push_subscription_updated_at before update on public.browser_push_subscriptions
for each row execute function public.set_browser_push_subscription_updated_at();
