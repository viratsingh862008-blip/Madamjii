create or replace function public.create_schedule_with_reminder(
  p_care_space_id uuid, p_scope text, p_type text, p_title text, p_instructions text,
  p_scheduled_for timestamptz, p_timezone text, p_recurrence_rule jsonb default '{"frequency":"once"}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();v_role text;v_schedule_id uuid;v_occurrence_id uuid;v_frequency text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if char_length(btrim(coalesce(p_title,'')))<1 or char_length(p_title)>120 then raise exception 'Title must be 1–120 characters'; end if;
 if p_scheduled_for<=now() then raise exception 'Choose a future time'; end if;
 if p_scope not in ('personal','shared') then raise exception 'Invalid schedule scope'; end if;
 if p_type not in ('meal','hydration','medicine','rest','task','check_in') then raise exception 'Invalid schedule type'; end if;
 if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone'; end if;
 v_frequency:=coalesce(p_recurrence_rule->>'frequency','once');
 if v_frequency not in ('once','daily','weekly') then raise exception 'Frequency must be once, daily or weekly'; end if;
 if not private.is_active_member(p_care_space_id) then raise exception 'Active care-space membership required'; end if;
 v_role:=private.current_member_role(p_care_space_id);
 if p_scope='shared' and v_role<>'admin' then raise exception 'Only the care-space admin can propose shared schedules'; end if;
 insert into public.care_schedules(care_space_id,owner_user_id,created_by,scope,type,title,instructions,local_time,timezone,recurrence_rule,status)
 values(p_care_space_id,case when p_scope='personal' then v_user else null end,v_user,p_scope,p_type,btrim(p_title),nullif(btrim(coalesce(p_instructions,'')),''),(p_scheduled_for at time zone p_timezone)::time,p_timezone,jsonb_build_object('frequency',v_frequency),case when p_scope='shared' then 'proposed' else 'active' end)
 returning id into v_schedule_id;
 insert into public.task_occurrences(schedule_id,scheduled_for,status) values(v_schedule_id,p_scheduled_for,'pending') returning id into v_occurrence_id;
 if p_scope='personal' then
  insert into public.reminder_jobs(occurrence_id,recipient_user_id,job_type,due_at,status,idempotency_key) values(v_occurrence_id,v_user,'initial',p_scheduled_for,'queued','occurrence:'||v_occurrence_id::text||':initial') on conflict(idempotency_key) do nothing;
 end if;
 return v_schedule_id;
end; $$;
revoke all on function public.create_schedule_with_reminder(uuid,text,text,text,text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.create_schedule_with_reminder(uuid,text,text,text,text,timestamptz,text,jsonb) to authenticated;

create or replace function public.generate_recurring_occurrences(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_schedule record;v_last timestamptz;v_next timestamptz;v_local_date date;v_added integer:=0;v_step integer;v_occ uuid;v_recipient uuid;v_frequency text;
begin
 for v_schedule in select s.* from public.care_schedules s where s.status='active' and s.recurrence_rule->>'frequency' in ('daily','weekly') order by s.created_at limit greatest(1,least(coalesce(p_limit,100),500)) loop
  v_frequency:=v_schedule.recurrence_rule->>'frequency';
  select max(scheduled_for) into v_last from public.task_occurrences where schedule_id=v_schedule.id;
  if v_last is null or v_last>now() then continue; end if;
  v_local_date:=(v_last at time zone v_schedule.timezone)::date;
  v_step:=case when v_frequency='weekly' then 7 else 1 end;
  v_local_date:=v_local_date+v_step;
  v_next:=(v_local_date+v_schedule.local_time) at time zone v_schedule.timezone;
  while v_next<=now() loop
   v_local_date:=v_local_date+v_step;
   v_next:=(v_local_date+v_schedule.local_time) at time zone v_schedule.timezone;
  end loop;
  insert into public.task_occurrences(schedule_id,scheduled_for,status) values(v_schedule.id,v_next,'pending') on conflict(schedule_id,scheduled_for) do nothing returning id into v_occ;
  if v_occ is not null then
   v_recipient:=coalesce(v_schedule.owner_user_id,(select cm.user_id from public.care_members cm where cm.care_space_id=v_schedule.care_space_id and cm.role='friend' and cm.membership_status='active' limit 1));
   if v_recipient is not null then insert into public.reminder_jobs(occurrence_id,recipient_user_id,job_type,due_at,status,idempotency_key) values(v_occ,v_recipient,'initial',v_next,'queued','occurrence:'||v_occ::text||':initial') on conflict(idempotency_key) do nothing;end if;
   v_added:=v_added+1;
  end if;
 end loop;
 return v_added;
end; $$;
revoke all on function public.generate_recurring_occurrences(integer) from public,anon,authenticated;
grant execute on function public.generate_recurring_occurrences(integer) to service_role;
