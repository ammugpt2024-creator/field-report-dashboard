-- Three narrower gaps visible in the policy export taken after 050.

-- 1. Log routing stays inside the company. reviewer_user_id is stamped by the
--    submitter's own browser, and the "Assigned reviewer" policies trusted it
--    alone: a log routed to someone outside the company became readable and
--    writable by them.
drop policy if exists "Assigned reviewer reads daily logs" on public.daily_logs;
create policy "Assigned reviewer reads daily logs" on public.daily_logs
  for select to authenticated
  using (reviewer_user_id = auth.uid() and company_id = public.auth_company_id());

drop policy if exists "Assigned reviewer updates daily logs" on public.daily_logs;
create policy "Assigned reviewer updates daily logs" on public.daily_logs
  for update to authenticated
  using (reviewer_user_id = auth.uid() and company_id = public.auth_company_id())
  with check (reviewer_user_id = auth.uid() and company_id = public.auth_company_id());

-- 2. The legacy activity-row policies (granted to public, ALL commands) let an
--    author rewrite activity rows on a log that had already been submitted or
--    approved. Reads stay; writes follow the same draft/returned rule as the log.
drop policy if exists "Daily log child records follow parent write access" on public.daily_log_activities;
drop policy if exists "Daily log child records follow parent read access" on public.daily_log_activities;
drop policy if exists "Authors read own log activities" on public.daily_log_activities;
create policy "Authors read own log activities" on public.daily_log_activities
  for select to authenticated
  using (exists (
    select 1 from public.daily_logs dl
    where dl.id = daily_log_activities.daily_log_id and dl.technician_id = auth.uid()
  ));
drop policy if exists "Authors edit activities on open logs" on public.daily_log_activities;
create policy "Authors edit activities on open logs" on public.daily_log_activities
  for all to authenticated
  using (exists (
    select 1 from public.daily_logs dl
    where dl.id = daily_log_activities.daily_log_id
      and dl.technician_id = auth.uid()
      and coalesce(dl.status, 'draft') in ('draft', 'active', 'returned_corrections')
  ))
  with check (exists (
    select 1 from public.daily_logs dl
    where dl.id = daily_log_activities.daily_log_id
      and dl.technician_id = auth.uid()
      and coalesce(dl.status, 'draft') in ('draft', 'active', 'returned_corrections')
  ));

-- 3. An employee editing their own timesheet could hand the row to someone
--    else (the check tested only company and status). The row stays theirs.
drop policy if exists "Own timesheet edits" on public.timesheets;
create policy "Own timesheet edits" on public.timesheets
  for update to authenticated
  using (
    company_id = public.auth_company_id()
    and (
      owner_user_id = auth.uid()
      or (owner_user_id is null and technician_name = (select full_name from public.profiles where id = auth.uid()))
    )
    and coalesce(status, 'draft') not in ('approved', 'completed')
  )
  with check (
    company_id = public.auth_company_id()
    and coalesce(owner_user_id, auth.uid()) = auth.uid()
    and coalesce(status, 'draft') not in ('approved', 'completed', 'rejected')
  );
