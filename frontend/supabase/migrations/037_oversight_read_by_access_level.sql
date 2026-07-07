-- Visibility follows the admin-set access level. A reviewer with approve+ on a
-- module for a project can read all of that module's reports on that project
-- (oversight). This replaces hardcoded role-based "see everything" with a
-- decision the company admin controls via the access levels they grant.
drop policy if exists "Module oversight reads daily logs" on public.daily_logs;
create policy "Module oversight reads daily logs" on public.daily_logs
  for select to authenticated
  using (public.user_can_module(project_id, 'daily_logs', 'approve'));
