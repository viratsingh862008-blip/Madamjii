-- Restrict notification/subscription policies to authenticated sessions; remove inherited PUBLIC access.
revoke all on public.app_notifications from anon;
revoke all on public.browser_push_subscriptions from anon;
drop policy if exists app_notifications_select_own on public.app_notifications;
drop policy if exists app_notifications_insert_own on public.app_notifications;
drop policy if exists app_notifications_update_own on public.app_notifications;
create policy app_notifications_select_own on public.app_notifications for select to authenticated using (user_id=auth.uid());
create policy app_notifications_insert_own on public.app_notifications for insert to authenticated with check (user_id=auth.uid());
create policy app_notifications_update_own on public.app_notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists browser_push_select_own on public.browser_push_subscriptions;
drop policy if exists browser_push_insert_own on public.browser_push_subscriptions;
drop policy if exists browser_push_update_own on public.browser_push_subscriptions;
drop policy if exists browser_push_delete_own on public.browser_push_subscriptions;
create policy browser_push_select_own on public.browser_push_subscriptions for select to authenticated using (user_id=auth.uid());
create policy browser_push_insert_own on public.browser_push_subscriptions for insert to authenticated with check (user_id=auth.uid());
create policy browser_push_update_own on public.browser_push_subscriptions for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy browser_push_delete_own on public.browser_push_subscriptions for delete to authenticated using (user_id=auth.uid());
