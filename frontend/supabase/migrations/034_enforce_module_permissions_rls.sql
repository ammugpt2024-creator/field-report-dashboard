-- Database-level enforcement of per-project, per-module permissions.
--
-- Restrictive policies (AND'd with the existing permissive ones) require that a
-- non-reviewer have at least create_edit on the relevant module for the row's
-- project before they can INSERT or UPDATE. QC reviewers/managers, company
-- admins, and platform admins are unaffected. Timesheets carry no project_id,
-- so they stay enforced app-side only.

-- Safety: make sure no assignment is left with empty permissions right before
-- enforcement turns on (otherwise that person would be silently blocked).
update public.project_assignments pa
set permissions = jsonb_build_object(
  'daily_logs', x.l, 'timesheets', x.l, 'field_test_reports', x.l, 'lab_reports', x.l)
from (
  select id, case access_level
    when 'full' then 'manage' when 'review_approve' then 'approve'
    when 'view_only' then 'view' else 'create_edit' end l
  from public.project_assignments
) x
where x.id = pa.id and (pa.permissions is null or pa.permissions = '{}'::jsonb);

create or replace function public._level_rank(lvl text) returns int
  language sql immutable as $$
  select coalesce(array_position(array['none','view','create_edit','approve','manage'], lvl), 0);
$$;

-- The caller's access level for a module on a project. Admins are unscoped.
create or replace function public.user_module_level(p_project_id bigint, p_module text)
  returns text language sql security definer stable set search_path = public as $$
  select case
    when public.is_platform_admin() then 'manage'
    when public.has_company_role(array['company_admin']) then 'manage'
    else coalesce((
      select permissions ->> p_module
      from public.project_assignments
      where project_id = p_project_id and user_id = auth.uid()
      limit 1
    ), 'none')
  end;
$$;
grant execute on function public.user_module_level(bigint, text) to authenticated;

create or replace function public.user_can_module(p_project_id bigint, p_module text, p_required text)
  returns boolean language sql security definer stable set search_path = public as $$
  select public._level_rank(public.user_module_level(p_project_id, p_module))
       >= public._level_rank(p_required);
$$;
grant execute on function public.user_can_module(bigint, text, text) to authenticated;

-- Daily logs → module daily_logs
drop policy if exists "Module gate insert daily_logs" on public.daily_logs;
create policy "Module gate insert daily_logs" on public.daily_logs
  as restrictive for insert to authenticated
  with check (public.is_qc_reviewer() or public.user_can_module(project_id, 'daily_logs', 'create_edit'));
drop policy if exists "Module gate update daily_logs" on public.daily_logs;
create policy "Module gate update daily_logs" on public.daily_logs
  as restrictive for update to authenticated
  using (public.is_qc_reviewer() or public.user_can_module(project_id, 'daily_logs', 'create_edit'))
  with check (public.is_qc_reviewer() or public.user_can_module(project_id, 'daily_logs', 'create_edit'));

-- Field/concrete test reports → module field_test_reports
drop policy if exists "Module gate insert concrete" on public.concrete_test_logs;
create policy "Module gate insert concrete" on public.concrete_test_logs
  as restrictive for insert to authenticated
  with check (public.is_qc_reviewer() or public.user_can_module(project_id, 'field_test_reports', 'create_edit'));
drop policy if exists "Module gate update concrete" on public.concrete_test_logs;
create policy "Module gate update concrete" on public.concrete_test_logs
  as restrictive for update to authenticated
  using (public.is_qc_reviewer() or public.user_can_module(project_id, 'field_test_reports', 'create_edit'))
  with check (public.is_qc_reviewer() or public.user_can_module(project_id, 'field_test_reports', 'create_edit'));
