-- Route daily logs to their assigned reviewer. A daily log carries the reviewer
-- chosen for its submitter on that project (stamped at submit). The reviewer can
-- read and act on logs routed to them even if they aren't a QC reviewer.
alter table public.daily_logs
  add column if not exists reviewer_user_id uuid references auth.users (id) on delete set null;

-- The assigned reviewer can read logs routed to them.
drop policy if exists "Assigned reviewer reads daily logs" on public.daily_logs;
create policy "Assigned reviewer reads daily logs" on public.daily_logs
  for select to authenticated using (reviewer_user_id = auth.uid());

-- ...and update them (approve / return).
drop policy if exists "Assigned reviewer updates daily logs" on public.daily_logs;
create policy "Assigned reviewer updates daily logs" on public.daily_logs
  for update to authenticated
  using (reviewer_user_id = auth.uid())
  with check (reviewer_user_id = auth.uid());

-- Make sure the restrictive module gate doesn't block a reviewer's approval:
-- the assigned reviewer is allowed through regardless of their create_edit level.
drop policy if exists "Module gate update daily_logs" on public.daily_logs;
create policy "Module gate update daily_logs" on public.daily_logs
  as restrictive for update to authenticated
  using (public.is_qc_reviewer() or reviewer_user_id = auth.uid() or public.user_can_module(project_id, 'daily_logs', 'create_edit'))
  with check (public.is_qc_reviewer() or reviewer_user_id = auth.uid() or public.user_can_module(project_id, 'daily_logs', 'create_edit'));
