-- An employee can always open their own timesheet PDF.
--
-- 054 gave timesheet PDFs to their uploader (the storage owner test) and to
-- company timesheet reviewers. But approving a timesheet re-uploads its PDF
-- in the manager's session, which makes the manager the file's owner, so the
-- employee lost access to their own approved timesheet. The timesheet row
-- names the employee; that decides, not who uploaded the latest copy.
--
-- Everything else is unchanged from 054.

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
    when 'timesheet-pdfs' then exists (
      select 1 from public.timesheets t
      where t.company_id = public.auth_company_id()
        and p_name in (t.payload ->> 'pdfStoragePath', t.payload ->> 'pdf_storage_path')
        and (
          -- the employee the timesheet belongs to
          t.owner_user_id = auth.uid()
          or (t.owner_user_id is null
              and t.technician_name = (select full_name from public.profiles where id = auth.uid()))
          -- or the company's timesheet reviewers
          or public.is_platform_admin()
          or public.has_company_role(array['company_admin', 'project_manager', 'deputy_project_manager'])
        ))
    else false
  end;
$$;
revoke execute on function public.storage_object_in_my_company(text, text) from anon, public;
grant execute on function public.storage_object_in_my_company(text, text) to authenticated;
