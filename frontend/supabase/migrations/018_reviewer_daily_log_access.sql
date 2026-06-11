-- QC reviewers / managers / admins must be able to read submitted daily logs
-- (the original policies limited every table to the owning technician, which
-- left the manager dashboard and review screens empty) and to update logs
-- when approving or returning them.

create or replace function public.is_qc_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('qc', 'qc_approver', 'qc_manager', 'admin')
  );
$$;

drop policy if exists "Reviewers can read daily logs" on public.daily_logs;
create policy "Reviewers can read daily logs"
on public.daily_logs
for select
to authenticated
using (public.is_qc_reviewer());

drop policy if exists "Reviewers can update daily logs" on public.daily_logs;
create policy "Reviewers can update daily logs"
on public.daily_logs
for update
to authenticated
using (public.is_qc_reviewer())
with check (public.is_qc_reviewer());

drop policy if exists "Reviewers can read daily log activities" on public.daily_log_activities;
create policy "Reviewers can read daily log activities"
on public.daily_log_activities
for select
to authenticated
using (public.is_qc_reviewer());

drop policy if exists "Reviewers can read daily log activity reports" on public.daily_log_activity_reports;
create policy "Reviewers can read daily log activity reports"
on public.daily_log_activity_reports
for select
to authenticated
using (public.is_qc_reviewer());

drop policy if exists "Reviewers can read daily log activity photos" on public.daily_log_activity_photos;
create policy "Reviewers can read daily log activity photos"
on public.daily_log_activity_photos
for select
to authenticated
using (public.is_qc_reviewer());

drop policy if exists "Reviewers can read daily log comments" on public.daily_log_comments;
create policy "Reviewers can read daily log comments"
on public.daily_log_comments
for select
to authenticated
using (public.is_qc_reviewer());

drop policy if exists "Reviewers can manage daily log reviews" on public.daily_log_reviews;
create policy "Reviewers can manage daily log reviews"
on public.daily_log_reviews
for all
to authenticated
using (public.is_qc_reviewer())
with check (public.is_qc_reviewer());

drop policy if exists "Reviewers can read daily log signatures" on public.daily_log_signatures;
create policy "Reviewers can read daily log signatures"
on public.daily_log_signatures
for select
to authenticated
using (public.is_qc_reviewer());
