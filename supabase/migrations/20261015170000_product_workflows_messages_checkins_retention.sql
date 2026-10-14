-- Product milestone: persistent messages, check-ins, journals, reporting, retention and reminder worker support.
create table if not exists public.message_delivery (
 id uuid primary key default gen_random_uuid(), care_space_id uuid not null references public.care_spaces(id) on delete cascade,
 sender_user_id uuid not null references auth.users(id) on delete cascade, recipient_user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(btrim(body)) between 1 and 2000), scheduled_at timestamptz,
 status text not null default 'sent' check (status in ('scheduled','sent','cancelled','failed')), created_at timestamptz not null default now(), sent_at timestamptz,
 check (sender_user_id <> recipient_user_id)
);
create index if not exists message_delivery_history_idx on public.message_delivery(care_space_id, created_at desc);
alter table public.message_delivery enable row level security;
revoke all on public.message_delivery from anon;
grant select,insert,update on public.message_delivery to authenticated;
drop policy if exists "members read own conversation messages" on public.message_delivery;
create policy "members read own conversation messages" on public.message_delivery for select to authenticated using ((sender_user_id=auth.uid() or recipient_user_id=auth.uid()) and private.is_active_member(care_space_id));
drop policy if exists "members send messages in their care space" on public.message_delivery;
create policy "members send messages in their care space" on public.message_delivery for insert to authenticated with check (sender_user_id=auth.uid() and recipient_user_id<>auth.uid() and private.is_active_member(care_space_id) and exists(select 1 from public.care_members cm where cm.care_space_id=message_delivery.care_space_id and cm.user_id=recipient_user_id and cm.membership_status='active'));
drop policy if exists "sender cancels own scheduled messages" on public.message_delivery;
create policy "sender cancels own scheduled messages" on public.message_delivery for update to authenticated using(sender_user_id=auth.uid() and status='scheduled') with check(sender_user_id=auth.uid() and status='cancelled');
alter table public.check_ins enable row level security;
grant select,insert,update,delete on public.check_ins to authenticated;
drop policy if exists "users manage their own checkins" on public.check_ins;
create policy "users manage their own checkins" on public.check_ins for all to authenticated using(user_id=auth.uid() and private.is_active_member(care_space_id)) with check(user_id=auth.uid() and private.is_active_member(care_space_id));
alter table public.journal_entries enable row level security;
grant select,insert,update,delete on public.journal_entries to authenticated;
drop policy if exists "users manage private journal entries" on public.journal_entries;
create policy "users manage private journal entries" on public.journal_entries for all to authenticated using(user_id=auth.uid() and (care_space_id is null or private.is_active_member(care_space_id))) with check(user_id=auth.uid() and (care_space_id is null or private.is_active_member(care_space_id)));
create or replace function public.get_shared_checkin_summaries(p_care_space_id uuid, p_limit integer default 30)
returns table(user_id uuid, mood text, energy smallint, created_at timestamptz) language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not private.is_active_member(p_care_space_id) then raise exception 'Active membership required'; end if;
 if not exists(select 1 from public.consent_records cr where cr.care_space_id=p_care_space_id and cr.user_id<>auth.uid() and cr.consent_type='daily_summary' and cr.revoked_at is null and coalesce((cr.scope->>'daily_summary')::boolean,false)) then return; end if;
 return query select s.user_id,s.mood,s.energy,s.created_at from public.shared_check_in_summaries s where s.care_space_id=p_care_space_id order by s.created_at desc limit greatest(1,least(coalesce(p_limit,30),90));
end; $$;
revoke all on function public.get_shared_checkin_summaries(uuid,integer) from public,anon;
grant execute on function public.get_shared_checkin_summaries(uuid,integer) to authenticated;
create or replace function public.save_checkin(p_care_space_id uuid,p_mood text,p_energy smallint,p_private_note text,p_share_summary boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
 if v_user is null or not private.is_active_member(p_care_space_id) then raise exception 'Active membership required'; end if;
 if p_mood is not null and p_mood not in ('great','okay','low','anxious','tired','heavy') then raise exception 'Invalid mood'; end if;
 if p_energy is not null and p_energy not between 1 and 5 then raise exception 'Energy must be 1–5'; end if;
 insert into public.check_ins(care_space_id,user_id,mood,energy,private_note,share_daily_summary) values(p_care_space_id,v_user,p_mood,p_energy,left(coalesce(p_private_note,''),3000),coalesce(p_share_summary,false)) returning id into v_id;
 if p_share_summary then insert into public.shared_check_in_summaries(check_in_id,care_space_id,user_id,mood,energy,created_at) values(v_id,p_care_space_id,v_user,p_mood,p_energy,now()) on conflict(check_in_id) do nothing; end if;
 return v_id;
end; $$;
revoke all on function public.save_checkin(uuid,text,smallint,text,boolean) from public,anon;
grant execute on function public.save_checkin(uuid,text,smallint,text,boolean) to authenticated;
create or replace function public.claim_due_reminder_jobs(p_limit integer default 25)
returns setof public.reminder_jobs language plpgsql security definer set search_path = '' as $$
begin return query with candidates as (select r.id from public.reminder_jobs r where r.status in ('queued','retry_wait') and r.due_at<=now() and (r.lease_expires_at is null or r.lease_expires_at<now()) order by r.due_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))), claimed as (update public.reminder_jobs r set status='processing',lease_expires_at=now()+interval '2 minutes',attempt_count=r.attempt_count+1 from candidates c where r.id=c.id returning r.*) select * from claimed; end; $$;
revoke all on function public.claim_due_reminder_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_due_reminder_jobs(integer) to service_role;
create or replace function public.finish_reminder_job(p_job_id uuid,p_result text,p_error_code text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_job public.reminder_jobs%rowtype;
begin
 if p_result not in ('dispatched','temporary_failure','permanent_failure','cancelled') then raise exception 'Invalid delivery result'; end if;
 select * into v_job from public.reminder_jobs where id=p_job_id for update; if not found then raise exception 'Job not found'; end if;
 insert into public.delivery_attempts(reminder_job_id,result,error_code) values(p_job_id,p_result,left(p_error_code,120));
 update public.reminder_jobs set status=case when p_result='dispatched' then 'dispatched' when p_result='cancelled' then 'cancelled' when p_result='permanent_failure' or attempt_count>=5 then 'failed' else 'retry_wait' end,due_at=case when p_result='temporary_failure' and attempt_count<5 then now()+(least(60,power(2,least(attempt_count,6))::int)||' minutes')::interval else due_at end,lease_expires_at=null where id=p_job_id;
end; $$;
revoke all on function public.finish_reminder_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_reminder_job(uuid,text,text) to service_role;
create or replace function public.run_retention_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_counts jsonb:='{}'::jsonb; v_n integer;
begin
 delete from public.app_notifications where expires_at<now() or created_at<now()-interval '90 days';get diagnostics v_n=row_count;v_counts:=v_counts||jsonb_build_object('app_notifications',v_n);
 delete from public.message_delivery where created_at<now()-interval '90 days';get diagnostics v_n=row_count;v_counts:=v_counts||jsonb_build_object('message_delivery',v_n);
 delete from public.delivery_attempts where attempted_at<now()-interval '90 days';get diagnostics v_n=row_count;v_counts:=v_counts||jsonb_build_object('delivery_attempts',v_n);
 delete from public.audit_events where created_at<now()-interval '90 days';get diagnostics v_n=row_count;v_counts:=v_counts||jsonb_build_object('audit_events',v_n);
 delete from public.journal_entries where created_at<now()-interval '90 days';get diagnostics v_n=row_count;v_counts:=v_counts||jsonb_build_object('journal_entries',v_n);
 delete from public.check_ins where created_at<now()-interval '90 days';get diagnostics v_n=row_count;v_counts:=v_counts||jsonb_build_object('check_ins',v_n);
 delete from public.shared_check_in_summaries where created_at<now()-interval '90 days';get diagnostics v_n=row_count;v_counts:=v_counts||jsonb_build_object('shared_check_in_summaries',v_n);
 return v_counts;
end; $$;
revoke all on function public.run_retention_cleanup() from public,anon,authenticated;
grant execute on function public.run_retention_cleanup() to service_role;
