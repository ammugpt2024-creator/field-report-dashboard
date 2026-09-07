-- Deleting a company left behind the logins of people who were invited but
-- never finished accepting.
--
-- generateLink({type:'invite'}) creates the auth.users row the moment the
-- invitation is sent, but company_users.user_id is only populated later, by
-- claim_company_invite(). hard_delete_company() collected accounts to remove
-- from company_users.user_id, so a never-accepted invitee was skipped and the
-- account outlived the company.
--
-- The orphan then breaks re-onboarding: inviting that same address again fails
-- with "already registered", the invite falls back to a magic link, and the
-- person is signed straight in instead of being asked to set a password.
--
-- Pending-invite accounts are now swept too, under deliberately narrow
-- conditions so a real person is never caught by a recycled address:
--   * the address matches a pending (user_id is null) invite of this company
--   * it never signed in, OR has no profiles row -> setup genuinely unfinished
--     (clicking an invite signs you in, so "never signed in" alone is too
--      strict: a click that failed to claim still leaves an unusable account)
--   * it is not a platform admin
--   * it belongs to no other company
create or replace function public.hard_delete_company(target_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  company_row companies%rowtype;
  member_ids uuid[];
  pending_emails text[];
  counts jsonb := '{}'::jsonb;
  n bigint;
  n_pending bigint;
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

  -- Addresses invited to this company that never completed acceptance.
  select coalesce(array_agg(lower(invited_email)), '{}') into pending_emails
  from company_users
  where company_id = target_company and user_id is null and invited_email is not null;

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
  update profiles set company_id = null where company_id = target_company;
  delete from companies where id = target_company;

  -- Accepted members whose login belonged only to this company.
  delete from auth.users u
  where u.id = any (member_ids)
    and not exists (select 1 from platform_admins pa where pa.user_id = u.id)
    and not exists (select 1 from company_users cu where cu.user_id = u.id);
  get diagnostics n = row_count;

  -- Never-accepted invitees: the account exists (the invite created it) but was
  -- never linked to the roster row, so the sweep above cannot see it.
  delete from auth.users u
  where lower(u.email) = any (pending_emails)
    and (u.last_sign_in_at is null
         or not exists (select 1 from profiles p where p.id = u.id))
    and not exists (select 1 from platform_admins pa where pa.user_id = u.id)
    and not exists (select 1 from company_users cu where cu.user_id = u.id);
  get diagnostics n_pending = row_count;

  counts := counts || jsonb_build_object('auth_users', n + n_pending);

  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, old_value, new_value)
  values (null, auth.uid(), 'company_hard_deleted', 'company', target_company::text,
          jsonb_build_object('companyName', company_row.company_name, 'status', company_row.status), counts);

  return counts;
end;
$$;
