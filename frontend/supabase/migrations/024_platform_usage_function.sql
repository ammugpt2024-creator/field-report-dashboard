-- Aggregated, non-sensitive usage counts for the platform dashboard. SECURITY
-- DEFINER so platform admins get numbers without standing read access to
-- tenant tables; hard-guarded to platform admins.
create or replace function public.get_company_usage(target_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  usage jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin only';
  end if;
  select jsonb_build_object(
    'users', (select count(*) from company_users where company_id = target_company and status = 'active'),
    'projects', (select count(*) from projects where company_id = target_company),
    'daily_reports', (select count(*) from daily_logs where company_id = target_company),
    'field_test_reports', (select count(*) from concrete_test_logs where company_id = target_company),
    'lab_reports', (select count(*) from lab_reports where company_id = target_company),
    'timesheets', (select count(*) from timesheets where company_id = target_company),
    'storage_objects', (select count(*) from storage.objects where bucket_id = 'company-files' and (storage.foldername(name))[1] = 'company-' || target_company::text)
  ) into usage;
  return usage;
end;
$$;
