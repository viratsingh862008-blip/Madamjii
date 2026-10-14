-- Preserve the first scheduled timestamp for shared proposals; only queue delivery after friend approval.
create or replace function public.create_schedule_with_reminder(
  p_care_space_id uuid, p_scope text, p_type text, p_title text, p_instructions text,
  p_scheduled_for timestamptz, p_timezone text, p_recurrence_rule jsonb default '{"frequency":"once"}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_role text; v_schedule_id uuid; v_occurrence_id uuid; v_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_title,''))) < 1 or char_length(p_title) > 120 then raise exception 'Title must be 1–120 characters'; end if;
  if p_scheduled_for <= now() then raise exception 'Choose a future time'; end if;
  if p_scope not in ('personal','shared') then raise exception 'Invalid schedule scope'; end if;
  if p_type not in ('meal','hydration','medicine','rest','task','check_in') then raise exception 'Invalid schedule type'; end if;
  if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then raise exception 'Invalid timezone'; end if;
  if not private.is_active_member(p_care_space_id) then raise exception 'Active care-space membership required'; end if;
  v_role := private.current_member_role(p_care_space_id);
  if p_scope = 'shared' and v_role <> 'admin' then raise exception 'Only the care-space admin can propose shared schedules'; end if;
  v_status := case when p_scope = 'shared' then 'proposed' else 'active' end;
  insert into public.care_schedules(care_space_id, owner_user_id, created_by, scope, type, title, instructions, local_time, timezone, recurrence_rule, status)
  values (p_care_space_id, case when p_scope='personal' then v_user else null end, v_user, p_scope, p_type, btrim(p_title), nullif(btrim(coalesce(p_instructions,'')),''), (p_scheduled_for at time zone p_timezone)::time, p_timezone, coalesce(p_recurrence_rule,'{"frequency":"once"}'::jsonb), v_status)
  returning id into v_schedule_id;
  insert into public.task_occurrences(schedule_id, scheduled_for, status)
  values (v_schedule_id, p_scheduled_for, 'pending') returning id into v_occurrence_id;
  if p_scope = 'personal' then
    insert into public.reminder_jobs(occurrence_id, recipient_user_id, job_type, due_at, status, idempotency_key)
    values (v_occurrence_id, v_user, 'initial', p_scheduled_for, 'queued', 'occurrence:' || v_occurrence_id::text || ':initial')
    on conflict (idempotency_key) do nothing;
  end if;
  return v_schedule_id;
end;
$$;
revoke all on function public.create_schedule_with_reminder(uuid,text,text,text,text,timestamptz,text,jsonb) from public, anon;
grant execute on function public.create_schedule_with_reminder(uuid,text,text,text,text,timestamptz,text,jsonb) to authenticated;

create or replace function public.review_shared_schedule(p_schedule_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_schedule public.care_schedules%rowtype; v_user uuid := auth.uid(); v_occurrence public.task_occurrences%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('approved','declined','revision_requested') then raise exception 'Invalid review decision'; end if;
  select * into v_schedule from public.care_schedules where id=p_schedule_id for update;
  if not found or v_schedule.scope <> 'shared' then raise exception 'Shared schedule not found'; end if;
  if not private.is_active_member(v_schedule.care_space_id) then raise exception 'Active membership required'; end if;
  if private.current_member_role(v_schedule.care_space_id) <> 'friend' then raise exception 'Only the invited friend can review shared schedules'; end if;
  if v_schedule.status <> 'proposed' then raise exception 'This schedule is no longer awaiting review'; end if;
  insert into public.schedule_approvals(schedule_id, schedule_version, reviewer_user_id, decision, note)
  values (v_schedule.id, v_schedule.version, v_user, p_decision, left(coalesce(p_note,''),500));
  update public.care_schedules set status=case when p_decision='approved' then 'active' when p_decision='declined' then 'declined' else 'proposed' end, updated_at=now()
  where id=v_schedule.id;
  if p_decision='approved' then
    select * into v_occurrence from public.task_occurrences where schedule_id=v_schedule.id order by scheduled_for asc limit 1;
    if found and v_occurrence.scheduled_for > now() then
      insert into public.reminder_jobs(occurrence_id, recipient_user_id, job_type, due_at, status, idempotency_key)
      values (v_occurrence.id, v_user, 'initial', v_occurrence.scheduled_for, 'queued', 'occurrence:' || v_occurrence.id::text || ':initial')
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  insert into public.audit_events(care_space_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_schedule.care_space_id, v_user, 'care_schedule', v_schedule.id, 'shared_schedule_' || p_decision, jsonb_build_object('version',v_schedule.version));
end;
$$;
revoke all on function public.review_shared_schedule(uuid,text,text) from public, anon;
grant execute on function public.review_shared_schedule(uuid,text,text) to authenticated;
