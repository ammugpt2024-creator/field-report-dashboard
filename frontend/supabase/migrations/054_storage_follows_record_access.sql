-- File access follows the access rule of the record the file belongs to.
--
-- 050 scoped storage to the company, which closed the cross-tenant hole but
-- left two mismatches with the table rules:
--
--   * timesheet-pdfs had no branch at all, so only the uploader could open a
--     timesheet PDF. Managers approving timesheets could until 050 (through
--     the catch-all rule it removed) and lost that.
--   * daily-log PDFs and attachments were readable by ANY member of the
--     company, although daily_logs itself limits a log to its author and the
--     company's reviewers. Another technician could open a colleague's report
--     by path.
--
-- Concrete report files stay company-wide, matching concrete_test_logs, which
-- every company member may read.

create or replace function public.storage_object_in_my_company(p_bucket text, p_name text)
  returns boolean language sql security definer stable set search_path = public as $$
  select case p_bucket
    when 'daily-log-pdfs' then exists (
      select 1 from public.daily_logs dl
      where dl.pdf_storage_path = p_name
        and (dl.technician_id = auth.uid() or public.can_review_daily_log(dl.id)))
    when 'daily-log-attachments' then exists (
      select 1 from public.daily_log_attachments a
      where a.storage_path = p_name
        and a.deleted_at is null
        and (a.uploaded_by = auth.uid()
             or public.can_read_daily_log_attachment(a.daily_log_id, a.local_daily_log_id, a.company_id)))
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
    -- The timesheet row carries its PDF path in the synced card payload. The
    -- author is covered by the owner test in the storage policies; this is
    -- the company's timesheet reviewers.
    when 'timesheet-pdfs' then exists (
      select 1 from public.timesheets t
      where t.company_id = public.auth_company_id()
        and p_name in (t.payload ->> 'pdfStoragePath', t.payload ->> 'pdf_storage_path')
        and (public.is_platform_admin()
             or public.has_company_role(array['company_admin', 'project_manager', 'deputy_project_manager'])))
    else false
  end;
$$;
revoke execute on function public.storage_object_in_my_company(text, text) from anon, public;
grant execute on function public.storage_object_in_my_company(text, text) to authenticated;

-- The owner-only timesheet PDF policies from 012 are covered by the tenant
-- policies (owner OR the record rule above); keeping them adds nothing.
drop policy if exists "Timesheet PDF storage owner read" on storage.objects;
drop policy if exists "Timesheet PDF storage owner insert" on storage.objects;
drop policy if exists "Timesheet PDF storage owner update" on storage.objects;
drop policy if exists "Timesheet PDF storage owner delete" on storage.objects;
