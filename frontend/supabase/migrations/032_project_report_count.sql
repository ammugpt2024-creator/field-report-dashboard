-- Accurate report count for a project, used to guard project deletion. Company
-- admins can't read technicians' daily_logs directly under RLS, so a naive
-- client count under-reports and would allow a destructive delete that orphans
-- reports. This SECURITY DEFINER function counts across the report tables,
-- bypassing RLS but only for a company admin of that project's company.

create or replace function public.project_report_count(p_project_id bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare
  proj_company uuid;
  cnt integer;
begin
  select company_id into proj_company from projects where id = p_project_id;
  if proj_company is null then
    return 0;
  end if;
  if not ((proj_company = public.auth_company_id() and public.has_company_role(array['company_admin'])) or public.is_platform_admin()) then
    raise exception 'not authorized';
  end if;
  select coalesce((select count(*) from daily_logs where project_id = p_project_id), 0)
       + coalesce((select count(*) from concrete_test_logs where project_id = p_project_id), 0)
    into cnt;
  return cnt;
end;
$$;

grant execute on function public.project_report_count(bigint) to authenticated;
