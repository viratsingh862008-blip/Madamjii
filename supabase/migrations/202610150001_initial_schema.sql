-- I'm Here: Milestone 1 foundational schema.
-- Apply in a non-production Supabase project first. Never expose service-role credentials to the browser.

begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.care_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  timezone text not null default 'Asia/Kolkata',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.care_members (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'friend')),
  membership_status text not null default 'active' check (membership_status in ('active', 'revoked')),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (care_space_id, user_id)
);
create unique index care_members_one_active_friend on public.care_members(care_space_id)
  where role = 'friend' and membership_status = 'active';

create table public.care_invitations (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index care_invitations_one_pending_per_space on public.care_invitations(care_space_id)
  where accepted_at is null and revoked_at is null;

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  scope jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.member_preferences (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  quiet_hours_start time not null default '23:00',
  quiet_hours_end time not null default '07:00',
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (care_space_id, user_id)
);

create table public.care_schedules (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('personal', 'shared')),
  type text not null check (type in ('meal', 'hydration', 'medicine', 'rest', 'task', 'check_in')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  instructions text,
  local_time time,
  timezone text not null default 'Asia/Kolkata',
  recurrence_rule jsonb not null default '{"frequency":"daily"}'::jsonb,
  status text not null default 'active' check (status in ('proposed', 'active', 'paused', 'declined', 'archived')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'personal' and owner_user_id is not null) or (scope = 'shared' and owner_user_id is null))
);

create table public.schedule_approvals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.care_schedules(id) on delete cascade,
  schedule_version integer not null check (schedule_version > 0),
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('approved', 'declined', 'revision_requested')),
  note text,
  decided_at timestamptz not null default now(),
  unique (schedule_id, schedule_version, reviewer_user_id)
);

create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.care_schedules(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped', 'cancelled')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  snoozed_until timestamptz,
  follow_up_consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (schedule_id, scheduled_for)
);

create table public.care_messages (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'queued', 'processing', 'dispatched', 'retry_wait', 'failed', 'cancelled')),
  related_occurrence_id uuid references public.task_occurrences(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_user_id <> recipient_user_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text,
  energy smallint check (energy between 1 and 5),
  private_note text,
  share_daily_summary boolean not null default false,
  created_at timestamptz not null default now()
);
-- Separate summary table means a member never receives the private-note column through a row policy.
create table public.shared_check_in_summaries (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null unique references public.check_ins(id) on delete cascade,
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text,
  energy smallint check (energy between 1 and 5),
  created_at timestamptz not null,
  shared_at timestamptz not null default now()
);
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  care_space_id uuid references public.care_spaces(id) on delete set null,
  entry_date date not null default current_date,
  content text not null check (char_length(content) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  designated_supporter_id uuid not null references auth.users(id) on delete cascade,
  message text check (char_length(message) <= 1000),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
-- Delivery tables are server-only in this milestone.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_encrypted text not null,
  auth_encrypted text not null,
  active boolean not null default true,
  last_success_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid references public.task_occurrences(id) on delete cascade,
  message_id uuid references public.care_messages(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check (job_type in ('initial', 'follow_up', 'custom_message', 'help_request')),
  due_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'dispatched', 'retry_wait', 'failed', 'cancelled', 'expired')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  idempotency_key text not null unique,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (occurrence_id is not null or message_id is not null)
);
create table public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  reminder_job_id uuid not null references public.reminder_jobs(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  result text not null check (result in ('dispatched', 'temporary_failure', 'permanent_failure', 'cancelled')),
  http_status integer,
  error_code text
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid references public.care_spaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  deleted_counts jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error_code text
);

create index reminder_jobs_due_idx on public.reminder_jobs(due_at) where status in ('queued', 'retry_wait');
create index task_occurrences_schedule_time_idx on public.task_occurrences(schedule_id, scheduled_for);
create index care_schedules_space_status_idx on public.care_schedules(care_space_id, status);
create index care_messages_conversation_idx on public.care_messages(care_space_id, created_at desc);
create index journal_entries_owner_date_idx on public.journal_entries(user_id, entry_date desc);
create index check_ins_owner_date_idx on public.check_ins(user_id, created_at desc);

create or replace function private.is_active_member(p_care_space_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.care_members cm
    where cm.care_space_id = p_care_space_id and cm.user_id = auth.uid()
      and cm.membership_status = 'active');
$$;
create or replace function private.current_member_role(p_care_space_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select cm.role from public.care_members cm
  where cm.care_space_id = p_care_space_id and cm.user_id = auth.uid()
    and cm.membership_status = 'active' limit 1;
$$;

create or replace function private.add_owner_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.care_members(care_space_id, user_id, role, membership_status)
  values (new.id, new.created_by, 'admin', 'active');
  insert into public.consent_records(care_space_id, user_id, consent_type, scope, version)
  values (new.id, new.created_by, 'shared_care',
    '{"shared_schedules":false,"daily_summary":false,"message_history":false}'::jsonb, 1);
  insert into public.member_preferences(care_space_id, user_id, timezone)
  values (new.id, new.created_by, new.timezone);
  return new;
end;
$$;
create trigger care_space_owner_membership after insert on public.care_spaces
for each row execute function private.add_owner_membership();

create or replace function private.guard_schedule_identity()
returns trigger language plpgsql set search_path = ''
as $
begin
  if new.care_space_id is distinct from old.care_space_id
    or new.created_by is distinct from old.created_by
    or new.scope is distinct from old.scope
    or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Schedule ownership and scope are immutable; create a new proposal instead'
      using errcode = '42501';
  end if;
  return new;
end;
$;
create trigger guard_schedule_identity_before_update
before update on public.care_schedules
for each row execute function private.guard_schedule_identity();

create or replace function private.guard_message_identity()
returns trigger language plpgsql set search_path = ''
as $
begin
  if new.care_space_id is distinct from old.care_space_id
    or new.sender_user_id is distinct from old.sender_user_id
    or new.recipient_user_id is distinct from old.recipient_user_id then
    raise exception 'Message conversation participants are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$;
create trigger guard_message_identity_before_update
before update on public.care_messages
for each row execute function private.guard_message_identity();

create or replace function private.guard_checkin_identity()
returns trigger language plpgsql set search_path = ''
as $
begin
  if new.care_space_id is distinct from old.care_space_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Check-in owner, care space and creation time are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$;
create trigger guard_checkin_identity_before_update
before update on public.check_ins
for each row execute function private.guard_checkin_identity();

create or replace function private.sync_checkin_summary()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_consent boolean;
begin
  select coalesce(bool_or((cr.scope ->> 'daily_summary') = 'true'), false)
  into v_consent
  from public.consent_records cr
  where cr.care_space_id = new.care_space_id and cr.user_id = new.user_id
    and cr.consent_type = 'shared_care' and cr.revoked_at is null;

  if new.share_daily_summary and v_consent then
    insert into public.shared_check_in_summaries(check_in_id, care_space_id, user_id, mood, energy, created_at)
    values (new.id, new.care_space_id, new.user_id, new.mood, new.energy, new.created_at)
    on conflict (check_in_id) do update
      set mood = excluded.mood, energy = excluded.energy, shared_at = now();
  else
    delete from public.shared_check_in_summaries where check_in_id = new.id;
  end if;
  return new;
end;
$$;
create trigger sync_checkin_summary_after_write
after insert or update of mood, energy, share_daily_summary on public.check_ins
for each row execute function private.sync_checkin_summary();

revoke all on function private.is_active_member(uuid) from public, anon;
revoke all on function private.current_member_role(uuid) from public, anon;
revoke all on function private.add_owner_membership() from public, anon, authenticated;
revoke all on function private.sync_checkin_summary() from public, anon, authenticated;
revoke all on function private.guard_schedule_identity() from public, anon, authenticated;
revoke all on function private.guard_message_identity() from public, anon, authenticated;
revoke all on function private.guard_checkin_identity() from public, anon, authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.current_member_role(uuid) to authenticated;

create or replace function public.create_care_space_with_consent(
  p_name text,
  p_timezone text,
  p_consent_scope jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $
declare v_space_id uuid; v_scope jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 80 then
    raise exception 'Care space name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then raise exception 'Invalid timezone' using errcode = '22023'; end if;
  v_scope := jsonb_build_object(
    'shared_schedules', coalesce((p_consent_scope ->> 'shared_schedules')::boolean, false),
    'daily_summary', coalesce((p_consent_scope ->> 'daily_summary')::boolean, false),
    'message_history', coalesce((p_consent_scope ->> 'message_history')::boolean, false)
  );
  if v_scope ->> 'shared_schedules' <> 'true' or v_scope ->> 'message_history' <> 'true' then
    raise exception 'Consent to shared schedules and message history is required' using errcode = '22023';
  end if;
  insert into public.care_spaces(name, timezone, created_by)
    values (btrim(p_name), p_timezone, auth.uid()) returning id into v_space_id;
  update public.consent_records set scope = v_scope, granted_at = now()
    where care_space_id = v_space_id and user_id = auth.uid()
      and consent_type = 'shared_care' and revoked_at is null;
  insert into public.audit_events(care_space_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (v_space_id, auth.uid(), 'care_space', v_space_id, 'created', '{"consent_recorded":true}'::jsonb);
  return v_space_id;
end;
$;

create or replace function public.create_care_invitation(p_care_space_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_token text; v_friend_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if private.current_member_role(p_care_space_id) is distinct from 'admin' then
    raise exception 'Only the care admin can invite a member' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.consent_records cr
    where cr.care_space_id = p_care_space_id and cr.user_id = auth.uid()
      and cr.consent_type = 'shared_care' and cr.revoked_at is null
      and cr.scope ->> 'shared_schedules' = 'true'
      and cr.scope ->> 'message_history' = 'true'
  ) then
    raise exception 'Record your care-sharing consent before inviting a friend' using errcode = '42501';
  end if;
  update public.care_invitations set revoked_at = now()
    where care_space_id = p_care_space_id and accepted_at is null and revoked_at is null;
  select count(*) into v_friend_count from public.care_members
    where care_space_id = p_care_space_id and role = 'friend' and membership_status = 'active';
  if v_friend_count > 0 then raise exception 'This care space already has its friend member' using errcode = '23505'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.care_invitations(care_space_id, created_by, token_hash, expires_at)
    values (p_care_space_id, auth.uid(), encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days');
  return v_token;
end;
$$;

create or replace function public.accept_care_invitation(
  p_token text,
  p_consent_scope jsonb default '{"shared_schedules":true,"daily_summary":false,"message_history":true}'::jsonb,
  p_timezone text default 'Asia/Kolkata'
)
returns uuid language plpgsql security definer set search_path = ''
as $
declare v_invite public.care_invitations%rowtype; v_active_count integer; v_scope jsonb; v_timezone text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invitation token' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  v_timezone := p_timezone;
  v_scope := jsonb_build_object(
    'shared_schedules', coalesce((p_consent_scope ->> 'shared_schedules')::boolean, false),
    'daily_summary', coalesce((p_consent_scope ->> 'daily_summary')::boolean, false),
    'message_history', coalesce((p_consent_scope ->> 'message_history')::boolean, false)
  );
  if v_scope ->> 'shared_schedules' <> 'true' or v_scope ->> 'message_history' <> 'true' then
    raise exception 'Shared schedules and message history consent are required to join this care space' using errcode = '22023';
  end if;
  select * into v_invite from public.care_invitations
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Invitation is invalid, expired, or already used' using errcode = '22023'; end if;
  if v_invite.created_by = auth.uid() then raise exception 'The inviter cannot accept their own invitation' using errcode = '42501'; end if;
  select count(*) into v_active_count from public.care_members
    where care_space_id = v_invite.care_space_id and membership_status = 'active';
  if v_active_count >= 2 then raise exception 'This care space is already full' using errcode = '23505'; end if;
  insert into public.care_members(care_space_id, user_id, role, membership_status)
    values (v_invite.care_space_id, auth.uid(), 'friend', 'active');
  insert into public.consent_records(care_space_id, user_id, consent_type, scope, version)
    values (v_invite.care_space_id, auth.uid(), 'shared_care', v_scope, 1);
  insert into public.member_preferences(care_space_id, user_id, timezone)
    values (v_invite.care_space_id, auth.uid(), v_timezone);
  update public.care_spaces set timezone = v_timezone where id = v_invite.care_space_id;
  update public.care_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_invite.id;
  insert into public.audit_events(care_space_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (v_invite.care_space_id, auth.uid(), 'care_invitation', v_invite.id, 'accepted', '{"source":"invitation_link"}'::jsonb);
  return v_invite.care_space_id;
end;
$$;

create or replace function public.review_shared_schedule(
  p_schedule_id uuid, p_schedule_version integer, p_decision text, p_note text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_schedule public.care_schedules%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'declined', 'revision_requested') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  select * into v_schedule from public.care_schedules where id = p_schedule_id for update;
  if not found or v_schedule.scope <> 'shared' or v_schedule.status <> 'proposed'
    or v_schedule.version <> p_schedule_version
    or private.current_member_role(v_schedule.care_space_id) is distinct from 'friend'
    or v_schedule.created_by = auth.uid() then
    raise exception 'This proposal cannot be reviewed by this user' using errcode = '42501';
  end if;
  insert into public.schedule_approvals(schedule_id, schedule_version, reviewer_user_id, decision, note)
    values (p_schedule_id, p_schedule_version, auth.uid(), p_decision, left(p_note, 500));
  update public.care_schedules set status = case p_decision
    when 'approved' then 'active' when 'declined' then 'declined' else 'paused' end, updated_at = now()
    where id = p_schedule_id;
  insert into public.audit_events(care_space_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (v_schedule.care_space_id, auth.uid(), 'care_schedule', p_schedule_id, 'reviewed',
      jsonb_build_object('version', p_schedule_version, 'decision', p_decision));
end;
$$;

revoke all on function public.create_care_space_with_consent(text, text, jsonb) from public, anon;
grant execute on function public.create_care_space_with_consent(text, text, jsonb) to authenticated;
revoke all on function public.create_care_invitation(uuid) from public, anon;
revoke all on function public.accept_care_invitation(text, jsonb, text) from public, anon;
revoke all on function public.review_shared_schedule(uuid, integer, text, text) from public, anon;
grant execute on function public.create_care_invitation(uuid) to authenticated;
grant execute on function public.accept_care_invitation(text, jsonb, text) to authenticated;
grant execute on function public.review_shared_schedule(uuid, integer, text, text) to authenticated;

alter table public.care_spaces enable row level security;
alter table public.care_members enable row level security;
alter table public.member_preferences enable row level security;
alter table public.care_invitations enable row level security;
alter table public.consent_records enable row level security;
alter table public.care_schedules enable row level security;
alter table public.schedule_approvals enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.care_messages enable row level security;
alter table public.check_ins enable row level security;
alter table public.shared_check_in_summaries enable row level security;
alter table public.journal_entries enable row level security;
alter table public.help_requests enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_jobs enable row level security;
alter table public.delivery_attempts enable row level security;
alter table public.audit_events enable row level security;
alter table public.retention_runs enable row level security;

grant select on public.care_spaces to authenticated;
grant update (name) on public.care_spaces to authenticated;
grant select, update (timezone, quiet_hours_start, quiet_hours_end, push_enabled)
  on public.member_preferences to authenticated;
grant select on public.care_members to authenticated;
grant select on public.consent_records to authenticated;
grant select, insert, update, delete on public.care_schedules to authenticated;
grant select on public.schedule_approvals to authenticated;
grant select on public.task_occurrences to authenticated;
grant select, insert, update on public.care_messages to authenticated;
grant select, insert, update, delete on public.check_ins to authenticated;
grant select on public.shared_check_in_summaries to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;
grant select, insert, update on public.help_requests to authenticated;
grant select on public.audit_events to authenticated;
revoke all on public.care_invitations from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.reminder_jobs from anon, authenticated;
revoke all on public.delivery_attempts from anon, authenticated;
revoke all on public.retention_runs from anon, authenticated;
revoke all on public.shared_check_in_summaries from anon, authenticated;
grant select on public.shared_check_in_summaries to authenticated;

create policy "care spaces readable by active members" on public.care_spaces for select to authenticated
  using (private.is_active_member(id));
create policy "admins update care space settings" on public.care_spaces for update to authenticated
  using (private.current_member_role(id) = 'admin')
  with check (private.current_member_role(id) = 'admin');

create policy "members read membership in their space" on public.care_members for select to authenticated
  using (user_id = auth.uid() or private.is_active_member(care_space_id));
create policy "users read their own consent" on public.consent_records for select to authenticated
  using (user_id = auth.uid());
create policy "users read their own member preferences" on public.member_preferences for select to authenticated
  using (user_id = auth.uid() and private.is_active_member(care_space_id));
create policy "users update their own member preferences" on public.member_preferences for update to authenticated
  using (user_id = auth.uid() and private.is_active_member(care_space_id))
  with check (user_id = auth.uid() and private.is_active_member(care_space_id));

create policy "members read permitted schedules" on public.care_schedules for select to authenticated
  using (private.is_active_member(care_space_id) and (
    owner_user_id = auth.uid() or
    (scope = 'shared' and (status in ('proposed', 'active', 'paused') or created_by = auth.uid()))
  ));
create policy "members create allowed schedules" on public.care_schedules for insert to authenticated
  with check (private.is_active_member(care_space_id) and created_by = auth.uid() and (
    (scope = 'personal' and owner_user_id = auth.uid() and status = 'active') or
    (scope = 'shared' and owner_user_id is null and private.current_member_role(care_space_id) = 'admin' and status = 'proposed')
  ));
create policy "owners update personal schedules only" on public.care_schedules for update to authenticated
  using (scope = 'personal' and owner_user_id = auth.uid() and private.is_active_member(care_space_id))
  with check (scope = 'personal' and owner_user_id = auth.uid() and created_by = auth.uid()
    and private.is_active_member(care_space_id));
create policy "owners delete personal schedules" on public.care_schedules for delete to authenticated
  using (scope = 'personal' and owner_user_id = auth.uid() and private.is_active_member(care_space_id));

create policy "members read schedule approvals" on public.schedule_approvals for select to authenticated
  using (exists (select 1 from public.care_schedules s where s.id = schedule_id and private.is_active_member(s.care_space_id)));
create policy "members read task occurrences for visible schedules" on public.task_occurrences for select to authenticated
  using (exists (select 1 from public.care_schedules s where s.id = schedule_id and private.is_active_member(s.care_space_id)
    and (s.owner_user_id = auth.uid() or (s.scope = 'shared' and s.status = 'active'))));
create policy "members update visible task occurrences" on public.task_occurrences for update to authenticated
  using (exists (select 1 from public.care_schedules s where s.id = schedule_id and private.is_active_member(s.care_space_id)
    and (s.owner_user_id = auth.uid() or (s.scope = 'shared' and s.status = 'active'))))
  with check (exists (select 1 from public.care_schedules s where s.id = schedule_id and private.is_active_member(s.care_space_id)
    and (s.owner_user_id = auth.uid() or (s.scope = 'shared' and s.status = 'active'))));

create policy "members read messages with mutual history consent" on public.care_messages for select to authenticated
  using (private.is_active_member(care_space_id)
    and (sender_user_id = auth.uid() or recipient_user_id = auth.uid())
    and exists (select 1 from public.consent_records cr where cr.care_space_id = care_messages.care_space_id
      and cr.user_id = care_messages.sender_user_id and cr.consent_type = 'shared_care'
      and cr.revoked_at is null and cr.scope ->> 'message_history' = 'true')
    and exists (select 1 from public.consent_records cr where cr.care_space_id = care_messages.care_space_id
      and cr.user_id = care_messages.recipient_user_id and cr.consent_type = 'shared_care'
      and cr.revoked_at is null and cr.scope ->> 'message_history' = 'true'));
create policy "members send messages with mutual history consent" on public.care_messages for insert to authenticated
  with check (sender_user_id = auth.uid() and status in ('draft', 'scheduled') and private.is_active_member(care_space_id)
    and exists (select 1 from public.care_members cm where cm.care_space_id = care_messages.care_space_id
      and cm.user_id = care_messages.recipient_user_id and cm.membership_status = 'active')
    and exists (select 1 from public.consent_records cr where cr.care_space_id = care_messages.care_space_id
      and cr.user_id = care_messages.sender_user_id and cr.consent_type = 'shared_care'
      and cr.revoked_at is null and cr.scope ->> 'message_history' = 'true')
    and exists (select 1 from public.consent_records cr where cr.care_space_id = care_messages.care_space_id
      and cr.user_id = care_messages.recipient_user_id and cr.consent_type = 'shared_care'
      and cr.revoked_at is null and cr.scope ->> 'message_history' = 'true'));
create policy "senders update their own unsent messages" on public.care_messages for update to authenticated
  using (sender_user_id = auth.uid() and status in ('draft', 'scheduled') and private.is_active_member(care_space_id))
  with check (sender_user_id = auth.uid() and status in ('draft', 'scheduled', 'cancelled') and private.is_active_member(care_space_id));

create policy "users read their own check-ins" on public.check_ins for select to authenticated
  using (user_id = auth.uid() and private.is_active_member(care_space_id));
create policy "users create their own check-ins" on public.check_ins for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_member(care_space_id));
create policy "users update their own check-ins" on public.check_ins for update to authenticated
  using (user_id = auth.uid() and private.is_active_member(care_space_id))
  with check (user_id = auth.uid() and private.is_active_member(care_space_id));
create policy "users delete their own check-ins" on public.check_ins for delete to authenticated
  using (user_id = auth.uid() and private.is_active_member(care_space_id));
create policy "members read shared summaries only with current consent" on public.shared_check_in_summaries for select to authenticated
  using (private.is_active_member(care_space_id) and user_id <> auth.uid()
    and exists (select 1 from public.consent_records cr where cr.care_space_id = shared_check_in_summaries.care_space_id
      and cr.user_id = shared_check_in_summaries.user_id and cr.consent_type = 'shared_care'
      and cr.revoked_at is null and cr.scope ->> 'daily_summary' = 'true'));

create policy "authors manage their journal entries" on public.journal_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "requesters and designated supporters read help requests" on public.help_requests for select to authenticated
  using (private.is_active_member(care_space_id) and (requester_user_id = auth.uid() or designated_supporter_id = auth.uid()));
create policy "members create help requests for the other member" on public.help_requests for insert to authenticated
  with check (requester_user_id = auth.uid() and designated_supporter_id <> auth.uid()
    and private.is_active_member(care_space_id)
    and exists (select 1 from public.care_members cm where cm.care_space_id = help_requests.care_space_id
      and cm.user_id = help_requests.designated_supporter_id and cm.membership_status = 'active'));
create policy "designated supporter acknowledges requests" on public.help_requests for update to authenticated
  using (designated_supporter_id = auth.uid() and private.is_active_member(care_space_id) and status = 'open')
  with check (designated_supporter_id = auth.uid() and private.is_active_member(care_space_id) and status in ('acknowledged', 'closed'));
create policy "members read audit events for their space" on public.audit_events for select to authenticated
  using (care_space_id is not null and private.is_active_member(care_space_id));

commit;