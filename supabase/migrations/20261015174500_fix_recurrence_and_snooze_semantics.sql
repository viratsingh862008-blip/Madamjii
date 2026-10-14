alter table public.task_occurrences add column if not exists snooze_count integer not null default 0 check(snooze_count>=0);
create or replace function public.snooze_task_occurrence(p_occurrence_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_occ public.task_occurrences%rowtype; v_next timestamptz:=now()+interval '5 minutes';
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select o.* into v_occ from public.task_occurrences o join public.care_schedules s on s.id=o.schedule_id where o.id=p_occurrence_id and private.is_active_member(s.care_space_id) and (s.owner_user_id=auth.uid() or (s.scope='shared' and s.status='active')) for update;
 if not found or v_occ.status<>'pending' then raise exception 'Task cannot be snoozed'; end if;
 if v_occ.snooze_count>=3 then raise exception 'Snooze limit reached for this occurrence'; end if;
 update public.task_occurrences set snoozed_until=v_next,snooze_count=snooze_count+1 where id=p_occurrence_id;
 insert into public.reminder_jobs(occurrence_id,recipient_user_id,job_type,due_at,status,idempotency_key) values(v_occ.id,auth.uid(),'initial',v_next,'queued','occurrence:'||v_occ.id::text||':snooze:'||(v_occ.snooze_count+1)) on conflict(idempotency_key) do nothing;
 return v_next;
end; $$;
revoke all on function public.snooze_task_occurrence(uuid) from public,anon;
grant execute on function public.snooze_task_occurrence(uuid) to authenticated;
create or replace function public.generate_recurring_occurrences(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_schedule record; v_last timestamptz; v_next timestamptz; v_added integer:=0; v_days integer; v_freq text; v_occ uuid; v_recipient uuid;
begin
 for v_schedule in select s.* from public.care_schedules s where s.status='active' and s.recurrence_rule->>'frequency' in ('daily','weekly') order by s.created_at limit greatest(1,least(coalesce(p_limit,100),500)) loop
  v_freq:=v_schedule.recurrence_rule->>'frequency'; select max(scheduled_for) into v_last from public.task_occurrences where schedule_id=v_schedule.id;
  if v_last is null or v_last>now() then continue; end if;
  v_days:=case when v_freq='weekly' then 7 else 1 end;v_next:=v_last+(v_days||' days')::interval;
  if v_next<=now() then v_days:=greatest(v_days,ceil(extract(epoch from(now()-v_last))/86400)::integer+1);if v_freq='weekly' then v_days:=greatest(7,ceil(v_days/7.0)::integer*7);end if;v_next:=v_last+(v_days||' days')::interval;end if;
  insert into public.task_occurrences(schedule_id,scheduled_for,status) values(v_schedule.id,v_next,'pending') on conflict(schedule_id,scheduled_for) do nothing returning id into v_occ;
  if v_occ is not null then v_recipient:=coalesce(v_schedule.owner_user_id,(select cm.user_id from public.care_members cm where cm.care_space_id=v_schedule.care_space_id and cm.role='friend' and cm.membership_status='active' limit 1));if v_recipient is not null then insert into public.reminder_jobs(occurrence_id,recipient_user_id,job_type,due_at,status,idempotency_key) values(v_occ,v_recipient,'initial',v_next,'queued','occurrence:'||v_occ::text||':initial') on conflict(idempotency_key) do nothing;end if;v_added:=v_added+1;end if;
 end loop;return v_added;
end; $$;
revoke all on function public.generate_recurring_occurrences(integer) from public,anon,authenticated;
grant execute on function public.generate_recurring_occurrences(integer) to service_role;
