-- Security repair: company isolation, least privilege, and self-escalation.
--
-- The audit found that several rules granted far more than the screens they
-- were written for, and Postgres ORs permissive policies together, so one wide
-- rule made every narrow one beside it irrelevant. Specifically:
--
--   * "Reviewers can read/update daily logs" checked only profiles.role, with
--     no company test, so any user carrying a QC role (every Inspector, via
--     046) could read and decide EVERY company's daily logs, plus their
--     activities, photos, reports, comments, signatures and attachments.
--   * user_module_level() returned 'manage' to a company_admin for ANY
--     project id, in any company, so "Module oversight reads daily logs" gave
--     each company admin every tenant's logs.
--   * profiles allowed a user to update their own row with no column limit
--     (and UPDATE was granted on every column), so anyone could award
--     themselves a QC role, rename themselves on signed reports, or point
--     another user's notifications at their own address.
--   * "Technicians can manage own daily logs" allowed ALL commands with no
--     status test: a technician could approve, rewrite, or delete their own
--     submitted report.
--   * The four "Authenticated storage *" policies covered every bucket except
--     company-files, so any signed-in user could read, overwrite or delete
--     every company's PDFs, attachments and signatures.
--   * Inside a company, every member had full CRUD on project_assignments
--     (self-granted permissions), timesheets, PTO decisions, clients,
--     equipment, invoices, lab reports and the notification queue, and could
--     write audit entries attributed to anyone.
--
-- Everything below is written so the screens keep working: the same people can
-- do the same jobs, on their own company's data only.

-- ── 1. Profiles: identity is not self-service ───────────────────────────────
-- The app never writes this table from the browser (the invite RPC and the
-- company_users trigger do, both SECURITY DEFINER), so removing the grant
-- costs no feature. Column grants, not just the policy, have to go: the policy
-- allowed the row and the grant allowed every column of it.
revoke update on public.profiles from authenticated;
drop policy if exists "Profiles self update" on public.profiles;

-- ── 2. Module permissions are company-scoped ────────────────────────────────
-- A company admin manages projects in THEIR company; a platform admin is
-- unscoped by design.
create or replace function public.user_module_level(p_project_id bigint, p_module text)
  returns text language sql security definer stable set search_path = public as $$
  select case
    when public.is_platform_admin() then 'manage'
    when public.has_company_role(array['company_admin'])
         and exists (
           select 1 from public.projects p
           where p.id = p_project_id and p.company_id = public.auth_company_id()
         ) then 'manage'
    else coalesce((
      select permissions ->> p_module
      from public.project_assignments
      where project_id = p_project_id and user_id = auth.uid()
      limit 1
    ), 'none')
  end;
$$;

-- Same idea for the legacy QC role check: it answers "is this person a
-- reviewer", and every policy that uses it must also test the row's company.
create or replace function public.is_qc_reviewer_for_company(p_company uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select public.is_qc_reviewer()
     and p_company is not null
     and p_company = public.auth_company_id();
$$;
grant execute on function public.is_qc_reviewer_for_company(uuid) to authenticated;

-- ── 3. Daily logs ───────────────────────────────────────────────────────────
drop policy if exists "Reviewers can read daily logs" on public.daily_logs;
drop policy if exists "Reviewers can update daily logs" on public.daily_logs;
drop policy if exists "Module oversight reads daily logs" on public.daily_logs;
drop policy if exists "Technicians can manage own daily logs" on public.daily_logs;
drop policy if exists "Technicians can manage own draft daily logs" on public.daily_logs;
drop policy if exists "Technicians can read own daily logs" on public.daily_logs;

-- Author: reads their own always; writes only while the log is theirs to
-- write. Submitting (draft -> submitted) is allowed; approving it is not, and
-- neither is editing or deleting it once it has gone to review.
drop policy if exists "Technicians read own daily logs" on public.daily_logs;
create policy "Technicians read own daily logs" on public.daily_logs
  for select to authenticated using (technician_id = auth.uid());
drop policy if exists "Technicians create own daily logs" on public.daily_logs;
create policy "Technicians create own daily logs" on public.daily_logs
  for insert to authenticated
  with check (
    technician_id = auth.uid()
    and coalesce(status, 'draft') in ('draft', 'active', 'submitted', 'pending_manager_review')
  );
drop policy if exists "Technicians edit own open daily logs" on public.daily_logs;
create policy "Technicians edit own open daily logs" on public.daily_logs
  for update to authenticated
  using (
    technician_id = auth.uid()
    and coalesce(status, 'draft') in ('draft', 'active', 'returned_corrections')
  )
  with check (
    technician_id = auth.uid()
    and coalesce(status, 'draft') in ('draft', 'active', 'returned_corrections', 'submitted', 'pending_manager_review')
  );
drop policy if exists "Technicians delete own draft daily logs" on public.daily_logs;
create policy "Technicians delete own draft daily logs" on public.daily_logs
  for delete to authenticated
  using (technician_id = auth.uid() and coalesce(status, 'draft') in ('draft', 'active'));

-- Reviewers: the routed reviewer (036 policies stay), QC roles and oversight,
-- both now inside the reviewer's own company.
drop policy if exists "Company reviewers read daily logs" on public.daily_logs;
create policy "Company reviewers read daily logs" on public.daily_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or (
      company_id = public.auth_company_id()
      and (
        public.is_qc_reviewer()
        or public.has_company_role(array['company_admin'])
        or public.user_can_module(project_id, 'daily_logs', 'approve')
      )
    )
  );
drop policy if exists "Company reviewers update daily logs" on public.daily_logs;
create policy "Company reviewers update daily logs" on public.daily_logs
  for update to authenticated
  using (
    public.is_platform_admin()
    or (
      company_id = public.auth_company_id()
      and (public.is_qc_reviewer() or public.user_can_module(project_id, 'daily_logs', 'approve'))
    )
  )
  with check (
    public.is_platform_admin()
    or (
      company_id = public.auth_company_id()
      and (public.is_qc_reviewer() or public.user_can_module(project_id, 'daily_logs', 'approve'))
    )
  );

-- The restrictive gate keeps its job, with the company test added.
drop policy if exists "Module gate insert daily_logs" on public.daily_logs;
create policy "Module gate insert daily_logs" on public.daily_logs
  as restrictive for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_qc_reviewer_for_company(company_id)
    or public.user_can_module(project_id, 'daily_logs', 'create_edit')
  );
drop policy if exists "Module gate update daily_logs" on public.daily_logs;
create policy "Module gate update daily_logs" on public.daily_logs
  as restrictive for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_qc_reviewer_for_company(company_id)
    or reviewer_user_id = auth.uid()
    or public.user_can_module(project_id, 'daily_logs', 'create_edit')
  )
  with check (
    public.is_platform_admin()
    or public.is_qc_reviewer_for_company(company_id)
    or reviewer_user_id = auth.uid()
    or public.user_can_module(project_id, 'daily_logs', 'create_edit')
  );

-- Nobody deletes another person's report. Technicians keep the draft-only
-- delete above; admins clean up through 'archived'.
drop policy if exists "Company admins delete daily logs" on public.daily_logs;
create policy "Company admins delete daily logs" on public.daily_logs
  for delete to authenticated
  using (
    public.is_platform_admin()
    or (public.has_company_role(array['company_admin']) and company_id = public.auth_company_id())
  );

-- ── 4. Daily log child records follow the parent, inside one company ────────
drop policy if exists "Reviewers can read daily log activities" on public.daily_log_activities;
drop policy if exists "Reviewers can read daily log activity photos" on public.daily_log_activity_photos;
drop policy if exists "Reviewers can read daily log activity reports" on public.daily_log_activity_reports;
drop policy if exists "Reviewers can read daily log comments" on public.daily_log_comments;
drop policy if exists "Reviewers can manage daily log reviews" on public.daily_log_reviews;
drop policy if exists "Reviewers can read daily log signatures" on public.daily_log_signatures;
drop policy if exists "Daily log attachment reviewer read" on public.daily_log_attachments;

-- One predicate for all of them: the parent log is in my company and I am a
-- reviewer there. Written as a function so the policies stay readable and the
-- company test can never be forgotten.
create or replace function public.can_review_daily_log(p_daily_log_id bigint)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.daily_logs dl
    where dl.id = p_daily_log_id
      and (
        public.is_platform_admin()
        or (
          dl.company_id = public.auth_company_id()
          and (
            public.is_qc_reviewer()
            or public.has_company_role(array['company_admin'])
            or dl.reviewer_user_id = auth.uid()
            or public.user_can_module(dl.project_id, 'daily_logs', 'approve')
          )
        )
      )
  );
$$;
grant execute on function public.can_review_daily_log(bigint) to authenticated;

-- Photos, reports and comments hang off the activity, not the log.
create or replace function public.can_review_daily_log_activity(p_activity_id bigint)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.daily_log_activities a
    where a.id = p_activity_id and public.can_review_daily_log(a.daily_log_id)
  );
$$;
grant execute on function public.can_review_daily_log_activity(bigint) to authenticated;

drop policy if exists "Company reviewers read activities" on public.daily_log_activities;
create policy "Company reviewers read activities" on public.daily_log_activities
  for select to authenticated using (public.can_review_daily_log(daily_log_id));
drop policy if exists "Company reviewers read activity photos" on public.daily_log_activity_photos;
create policy "Company reviewers read activity photos" on public.daily_log_activity_photos
  for select to authenticated using (public.can_review_daily_log_activity(activity_id));
drop policy if exists "Company reviewers read activity reports" on public.daily_log_activity_reports;
create policy "Company reviewers read activity reports" on public.daily_log_activity_reports
  for select to authenticated using (public.can_review_daily_log_activity(activity_id));
drop policy if exists "Company reviewers read log comments" on public.daily_log_comments;
create policy "Company reviewers read log comments" on public.daily_log_comments
  for select to authenticated using (public.can_review_daily_log_activity(activity_id));
drop policy if exists "Company reviewers manage log reviews" on public.daily_log_reviews;
create policy "Company reviewers manage log reviews" on public.daily_log_reviews
  for all to authenticated
  using (public.can_review_daily_log(daily_log_id))
  with check (public.can_review_daily_log(daily_log_id));
drop policy if exists "Company reviewers read signatures" on public.daily_log_signatures;
create policy "Company reviewers read signatures" on public.daily_log_signatures
  for select to authenticated using (public.can_review_daily_log(daily_log_id));

-- Attachments: the uploader keeps their own rows; reviewers in the same
-- company can read them. Rows are keyed by the local uuid, so match either.
create or replace function public.can_read_daily_log_attachment(
  p_daily_log_id bigint, p_local_daily_log_id text, p_company uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select case
    when public.is_platform_admin() then true
    when p_daily_log_id is not null then public.can_review_daily_log(p_daily_log_id)
    when p_local_daily_log_id is not null then exists (
      select 1 from public.daily_logs dl
      where dl.client_log_id = p_local_daily_log_id
        and public.can_review_daily_log(dl.id)
    )
    else p_company is not null and p_company = public.auth_company_id()
         and (public.is_qc_reviewer() or public.has_company_role(array['company_admin']))
  end;
$$;
grant execute on function public.can_read_daily_log_attachment(bigint, text, uuid) to authenticated;

drop policy if exists "Company reviewers read attachments" on public.daily_log_attachments;
create policy "Company reviewers read attachments" on public.daily_log_attachments
  for select to authenticated
  using (deleted_at is null and public.can_read_daily_log_attachment(daily_log_id, local_daily_log_id, company_id));

-- ── 5. Storage: per-bucket, per-company ─────────────────────────────────────
-- These four were the widest rules in the database.
drop policy if exists "Authenticated storage read" on storage.objects;
drop policy if exists "Authenticated storage insert" on storage.objects;
drop policy if exists "Authenticated storage update" on storage.objects;
drop policy if exists "Authenticated storage delete" on storage.objects;
drop policy if exists "Daily log attachment storage owner read" on storage.objects;
drop policy if exists "Daily log attachment storage owner insert" on storage.objects;
drop policy if exists "Daily log attachment storage owner update" on storage.objects;
drop policy if exists "Daily log attachment storage owner delete" on storage.objects;

-- Whether this object belongs to a record my company owns. Uploads are
-- allowed before the owning row exists, which the owner test below covers.
create or replace function public.storage_object_in_my_company(p_bucket text, p_name text)
  returns boolean language sql security definer stable set search_path = public as $$
  select case p_bucket
    when 'daily-log-pdfs' then exists (
      select 1 from public.daily_logs dl
      where dl.pdf_storage_path = p_name and dl.company_id = public.auth_company_id())
    when 'daily-log-attachments' then exists (
      select 1 from public.daily_log_attachments a
      left join public.daily_logs dl on dl.client_log_id = a.local_daily_log_id or dl.id = a.daily_log_id
      where a.storage_path = p_name
        and coalesce(a.company_id, dl.company_id) = public.auth_company_id())
    when 'report-pdfs' then exists (
      select 1 from public.concrete_test_logs c
      where c.pdf_storage_path = p_name and c.company_id = public.auth_company_id())
    when 'signatures' then exists (
      select 1 from public.concrete_test_logs c
      where p_name in (c.technician_signature_storage_path, c.qc_signature_storage_path)
        and c.company_id = public.auth_company_id())
    when 'concrete-test-attachments' then exists (
      select 1 from public.concrete_attachments a
      join public.concrete_test_logs c on c.id = a.log_id
      where a.storage_path = p_name and c.company_id = public.auth_company_id())
    -- timesheet-pdfs carries no link back to a row, so it stays owner-only
    -- through the owner test in the policies below.
    else false
  end;
$$;
grant execute on function public.storage_object_in_my_company(text, text) to authenticated;

drop policy if exists "Tenant storage read" on storage.objects;
create policy "Tenant storage read" on storage.objects
  for select to authenticated
  using (
    bucket_id <> 'company-files'
    and (owner = auth.uid() or public.storage_object_in_my_company(bucket_id, name))
  );
drop policy if exists "Tenant storage insert" on storage.objects;
create policy "Tenant storage insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id <> 'company-files'
    and (owner = auth.uid() or public.storage_object_in_my_company(bucket_id, name))
  );
drop policy if exists "Tenant storage update" on storage.objects;
create policy "Tenant storage update" on storage.objects
  for update to authenticated
  using (
    bucket_id <> 'company-files'
    and (owner = auth.uid() or public.storage_object_in_my_company(bucket_id, name))
  )
  with check (
    bucket_id <> 'company-files'
    and (owner = auth.uid() or public.storage_object_in_my_company(bucket_id, name))
  );
-- Deleting a stored report is not part of any workflow; only the uploader may.
drop policy if exists "Tenant storage delete" on storage.objects;
create policy "Tenant storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id <> 'company-files' and owner = auth.uid());

-- Buckets the code writes to that were never created (uploads fail with
-- "Bucket not found"): company logos/files, concrete report PDFs, and the
-- daily-log attachment fallback.
insert into storage.buckets (id, name, public)
values ('company-files', 'company-files', false),
       ('concrete-report-pdfs', 'concrete-report-pdfs', false),
       ('report-attachments', 'report-attachments', false)
on conflict (id) do update set public = false;

-- ── 6. A PDF rebuild may write PDF details only ─────────────────────────────
-- Storing a regenerated PDF is the one write a technician makes against a log
-- that is already submitted or approved. Rather than leave the whole row
-- writable for it, this records exactly the PDF columns and merges the PDF
-- keys into the payload.
create or replace function public.set_daily_log_pdf_metadata(p_client_log_id text, p_patch jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target public.daily_logs%rowtype;
  allowed_keys text[] := array[
    'pdfStoragePath', 'pdf_storage_path', 'pdfUrl', 'pdf_url', 'finalPdfUrl', 'final_pdf_url',
    'pdfGeneratedAt', 'pdf_generated_at', 'pdfGenerationStatus', 'pdf_generation_status',
    'pdfGenerationFailureReason', 'pdf_generation_failure_reason', 'pdfGenerationError',
    'pdfStorageMode', 'pdf_storage_mode', 'pdfLayoutVersion', 'pdf_layout_version'];
  pdf_payload jsonb;
begin
  select * into target from public.daily_logs where client_log_id = p_client_log_id;
  if target.id is null then
    raise exception 'daily log not found';
  end if;

  -- The author, a reviewer in the same company, or a platform admin.
  if not (target.technician_id = auth.uid() or public.can_review_daily_log(target.id)) then
    raise exception 'not authorised to update this daily log';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into pdf_payload
  from jsonb_each(coalesce(p_patch, '{}'::jsonb))
  where key = any (allowed_keys);

  update public.daily_logs set
    pdf_storage_path = coalesce(p_patch ->> 'pdfStoragePath', p_patch ->> 'pdf_storage_path', pdf_storage_path),
    pdf_url = coalesce(p_patch ->> 'pdfUrl', p_patch ->> 'pdf_url', pdf_url),
    pdf_generated_at = coalesce((p_patch ->> 'pdfGeneratedAt')::timestamptz, now()),
    pdf_generated = true,
    pdf_generation_status = coalesce(p_patch ->> 'pdfGenerationStatus', 'generated'),
    pdf_generation_failure_reason = coalesce(p_patch ->> 'pdfGenerationFailureReason', ''),
    payload = coalesce(payload, '{}'::jsonb) || pdf_payload,
    updated_at = now()
  where id = target.id;

  return jsonb_build_object('updated', true, 'id', target.id);
end;
$$;
revoke all on function public.set_daily_log_pdf_metadata(text, jsonb) from public;
grant execute on function public.set_daily_log_pdf_metadata(text, jsonb) to authenticated;

-- ── 7. Timesheets: your own, or your company's reviewers ────────────────────
alter table public.timesheets add column if not exists owner_user_id uuid references auth.users (id);
-- Rows synced before this column existed are matched back to their author by
-- the name they were filed under.
update public.timesheets t
set owner_user_id = p.id
from public.profiles p
where t.owner_user_id is null
  and t.technician_name is not null
  and p.full_name = t.technician_name
  and p.company_id = t.company_id;
alter table public.timesheets alter column owner_user_id set default auth.uid();
create index if not exists idx_timesheets_owner on public.timesheets (owner_user_id);

drop policy if exists "Company scoped timesheets" on public.timesheets;
drop policy if exists "Own timesheets" on public.timesheets;
create policy "Own timesheets" on public.timesheets
  for select to authenticated
  using (
    company_id = public.auth_company_id()
    and (
      owner_user_id = auth.uid()
      or (owner_user_id is null and technician_name = (select full_name from public.profiles where id = auth.uid()))
    )
  );
drop policy if exists "Own timesheet writes" on public.timesheets;
create policy "Own timesheet writes" on public.timesheets
  for insert to authenticated
  with check (
    company_id = public.auth_company_id()
    and coalesce(owner_user_id, auth.uid()) = auth.uid()
    and coalesce(status, 'draft') not in ('approved', 'completed')
  );
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
    -- An employee may submit, correct and withdraw their own card. Approving
    -- it is the reviewer's decision, not theirs.
    and coalesce(status, 'draft') not in ('approved', 'completed', 'rejected')
  );
drop policy if exists "Reviewers manage company timesheets" on public.timesheets;
create policy "Reviewers manage company timesheets" on public.timesheets
  for all to authenticated
  using (
    public.is_platform_admin()
    or (
      company_id = public.auth_company_id()
      and public.has_company_role(array['company_admin', 'project_manager', 'deputy_project_manager'])
    )
  )
  with check (
    public.is_platform_admin()
    or (
      company_id = public.auth_company_id()
      and public.has_company_role(array['company_admin', 'project_manager', 'deputy_project_manager'])
    )
  );

-- ── 8. Time off: an employee files, an admin decides ────────────────────────
drop policy if exists "Members manage own pto" on public.pto_requests;
drop policy if exists "Members read own pto" on public.pto_requests;
create policy "Members read own pto" on public.pto_requests
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Members file own pto" on public.pto_requests;
create policy "Members file own pto" on public.pto_requests
  for insert to authenticated
  with check (user_id = auth.uid() and coalesce(status, 'pending') = 'pending');
drop policy if exists "Members withdraw own pto" on public.pto_requests;
create policy "Members withdraw own pto" on public.pto_requests
  for update to authenticated
  using (user_id = auth.uid() and coalesce(status, 'pending') = 'pending')
  with check (user_id = auth.uid() and coalesce(status, 'pending') in ('pending', 'cancelled'));

-- ── 9. Project assignments decide permissions, so only admins may write ─────
drop policy if exists "Company members access" on public.project_assignments;
drop policy if exists "Members read own assignments" on public.project_assignments;
create policy "Members read own assignments" on public.project_assignments
  for select to authenticated
  using (
    company_id = public.auth_company_id()
    and (
      user_id = auth.uid()
      or public.has_company_role(array['company_admin', 'project_manager', 'deputy_project_manager'])
    )
  );
drop policy if exists "Admins manage assignments" on public.project_assignments;
create policy "Admins manage assignments" on public.project_assignments
  for all to authenticated
  using (
    public.is_platform_admin()
    or (company_id = public.auth_company_id()
        and public.has_company_role(array['company_admin', 'project_manager']))
  )
  with check (
    public.is_platform_admin()
    or (company_id = public.auth_company_id()
        and public.has_company_role(array['company_admin', 'project_manager']))
  );

-- ── 10. Company business records: everyone reads, admins write ──────────────
do $$
declare t text;
begin
  foreach t in array array['clients', 'equipment', 'equipment_calibrations', 'invoices', 'lab_reports'] loop
    execute format('drop policy if exists "Company members access" on public.%I', t);
    execute format('drop policy if exists "Company members read %1$s" on public.%1$I', t);
    execute format(
      'create policy "Company members read %1$s" on public.%1$I for select to authenticated
         using (company_id = public.auth_company_id())', t);
    execute format('drop policy if exists "Company admins manage %1$s" on public.%1$I', t);
    execute format(
      'create policy "Company admins manage %1$s" on public.%1$I for all to authenticated
         using (public.is_platform_admin() or (company_id = public.auth_company_id()
                and public.has_company_role(array[''company_admin'', ''project_manager''])))
         with check (public.is_platform_admin() or (company_id = public.auth_company_id()
                and public.has_company_role(array[''company_admin'', ''project_manager''])))', t);
  end loop;
end $$;

-- ── 11. Concrete reports: the author writes, reviewers decide ───────────────
do $$
declare t text;
begin
  foreach t in array array['concrete_specifications', 'concrete_delivery_testing_records', 'concrete_attachments'] loop
    execute format('drop policy if exists "Company scoped access" on public.%I', t);
    execute format('drop policy if exists "Company scoped child access" on public.%I', t);
    execute format(
      'create policy "Company scoped child access" on public.%I for all to authenticated
         using (exists (select 1 from public.concrete_test_logs c
                        where c.id = log_id and c.company_id = public.auth_company_id()))
         with check (exists (select 1 from public.concrete_test_logs c
                        where c.id = log_id and c.company_id = public.auth_company_id()))', t);
  end loop;
end $$;

drop policy if exists "Company scoped access" on public.concrete_test_logs;
drop policy if exists "Company members read concrete logs" on public.concrete_test_logs;
create policy "Company members read concrete logs" on public.concrete_test_logs
  for select to authenticated using (company_id = public.auth_company_id());
drop policy if exists "Authors and reviewers write concrete logs" on public.concrete_test_logs;
create policy "Authors and reviewers write concrete logs" on public.concrete_test_logs
  for all to authenticated
  using (
    company_id = public.auth_company_id()
    and (
      submitted_by = auth.uid()
      or public.is_qc_reviewer()
      or public.has_company_role(array['company_admin', 'project_manager'])
      or public.user_can_module(project_id, 'field_test_reports', 'approve')
    )
  )
  with check (
    company_id = public.auth_company_id()
    and (
      submitted_by = auth.uid()
      or public.is_qc_reviewer()
      or public.has_company_role(array['company_admin', 'project_manager'])
      or public.user_can_module(project_id, 'field_test_reports', 'approve')
    )
  );
-- A member with create_edit still needs to create their first report.
drop policy if exists "Members create concrete logs" on public.concrete_test_logs;
create policy "Members create concrete logs" on public.concrete_test_logs
  for insert to authenticated
  with check (
    company_id = public.auth_company_id()
    and public.user_can_module(project_id, 'field_test_reports', 'create_edit')
  );

-- ── 12. Audit log entries name their real author ────────────────────────────
drop policy if exists "Members write own company audit" on public.audit_logs;
create policy "Members write own company audit" on public.audit_logs
  for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and (company_id = public.auth_company_id() or public.is_platform_admin())
  );

-- ── 13. Queued email is not general reading ─────────────────────────────────
drop policy if exists "Company scoped queue" on public.notification_queue;
drop policy if exists "Members queue own company notifications" on public.notification_queue;
create policy "Members queue own company notifications" on public.notification_queue
  for insert to authenticated with check (company_id = public.auth_company_id() or company_id is null);
drop policy if exists "Admins read notification queue" on public.notification_queue;
create policy "Admins read notification queue" on public.notification_queue
  for select to authenticated
  using (
    public.is_platform_admin()
    or (company_id = public.auth_company_id()
        and public.has_company_role(array['company_admin', 'project_manager']))
  );
-- The sender marks its own queued row sent/failed; the id is only known to it.
drop policy if exists "Members update notification status" on public.notification_queue;
create policy "Members update notification status" on public.notification_queue
  for update to authenticated
  using (company_id = public.auth_company_id() or company_id is null)
  with check (company_id = public.auth_company_id() or company_id is null);

-- Platform-wide mail settings are admin information.
drop policy if exists "notification_settings_read_authenticated" on public.notification_settings;
drop policy if exists "Admins read notification settings" on public.notification_settings;
create policy "Admins read notification settings" on public.notification_settings
  for select to authenticated
  using (public.is_platform_admin() or public.has_company_role(array['company_admin']));

-- ── 14. A roster row may not claim another company's user ───────────────────
create or replace function public.user_is_in_another_company(p_user uuid, p_company uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select p_user is not null and exists (
    select 1 from public.company_users
    where user_id = p_user and company_id is distinct from p_company and status = 'active'
  );
$$;
grant execute on function public.user_is_in_another_company(uuid, uuid) to authenticated;

drop policy if exists "Roster rows stay in one company" on public.company_users;
create policy "Roster rows stay in one company" on public.company_users
  as restrictive for all to authenticated
  using (true)
  with check (public.is_platform_admin() or not public.user_is_in_another_company(user_id, company_id));
