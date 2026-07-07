-- Full clean sweep of a dead company: every tenant record, the roster, and
-- the company's employee logins (auth accounts that belong to no other
-- company and are not platform admins). Guarded twice: platform admins only,
-- and never against an ACTIVE company — suspend or cancel first.
--
-- Storage files are removed by the delete-company edge function before it
-- calls this (S3 objects need the storage API, not SQL).

create or replace function public.hard_delete_company(target_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  company_row companies%rowtype;
  member_ids uuid[];
  counts jsonb := '{}'::jsonb;
  n bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin only';
  end if;

  select * into company_row from companies where id = target_company;
  if company_row.id is null then
    raise exception 'company not found';
  end if;
  if company_row.status = 'active' then
    raise exception 'company is active — suspend or cancel it before deleting';
  end if;

  select coalesce(array_agg(user_id), '{}') into member_ids
  from company_users where company_id = target_company and user_id is not null;

  -- Children of concrete reports.
  delete from notification_queue where company_id = target_company
     or report_id in (select id from concrete_test_logs where company_id = target_company);
  delete from report_review_history where company_id = target_company
     or report_id in (select id from concrete_test_logs where company_id = target_company);
  delete from concrete_attachments where company_id = target_company
     or log_id in (select id from concrete_test_logs where company_id = target_company);
  delete from concrete_delivery_testing_records where company_id = target_company
     or log_id in (select id from concrete_test_logs where company_id = target_company);
  delete from concrete_specifications where company_id = target_company
     or log_id in (select id from concrete_test_logs where company_id = target_company);

  -- Children of daily logs, then both report families.
  -- ai_* tables: company_id is a LEGACY bigint (not the tenant key) and
  -- daily_log_id is a text-typed client-side id, so sweep via a cast join.
  delete from ai_audit_events where daily_log_id in (select id::text from daily_logs where company_id = target_company);
  delete from ai_summarys where daily_log_id in (select id::text from daily_logs where company_id = target_company);
  delete from daily_log_activities where daily_log_id in (select id from daily_logs where company_id = target_company);
  delete from daily_log_reviews where daily_log_id in (select id from daily_logs where company_id = target_company);
  delete from daily_log_signatures where daily_log_id in (select id from daily_logs where company_id = target_company);
  delete from daily_log_attachments where company_id = target_company
     or daily_log_id in (select id from daily_logs where company_id = target_company);

  delete from concrete_test_logs where company_id = target_company;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('field_test_reports', n);
  delete from daily_logs where company_id = target_company;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('daily_reports', n);

  delete from timesheets where company_id = target_company;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('timesheets', n);
  delete from lab_reports where company_id = target_company;
  delete from invoices where company_id = target_company;
  delete from equipment_calibrations where company_id = target_company;
  delete from equipment where company_id = target_company;
  delete from clients where company_id = target_company;
  delete from project_assignments where company_id = target_company;
  delete from projects where company_id = target_company;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('projects', n);

  delete from platform_support_sessions where company_id = target_company;
  delete from audit_logs where company_id = target_company;
  delete from company_users where company_id = target_company;
  delete from company_settings where company_id = target_company;
  delete from company_subscriptions where company_id = target_company;
  -- Profiles of surviving accounts (platform admins, multi-company members)
  -- must not keep pointing at the doomed company.
  update profiles set company_id = null where company_id = target_company;
  delete from companies where id = target_company;

  -- Employee logins exclusive to this company (never platform admins, never
  -- members of any surviving company). Cascades their profiles.
  delete from auth.users u
  where u.id = any (member_ids)
    and not exists (select 1 from platform_admins pa where pa.user_id = u.id)
    and not exists (select 1 from company_users cu where cu.user_id = u.id);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('auth_users', n);

  -- Platform-level audit record (the company-scoped trail is gone with it).
  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, old_value, new_value)
  values (null, auth.uid(), 'company_hard_deleted', 'company', target_company::text,
          jsonb_build_object('companyName', company_row.company_name, 'status', company_row.status), counts);

  return counts;
end;
$$;
