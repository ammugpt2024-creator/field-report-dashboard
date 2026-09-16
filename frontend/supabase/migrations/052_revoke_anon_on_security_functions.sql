-- Signed-in callers only for the functions added in 050.
--
-- Supabase's default privileges grant EXECUTE on new public functions to the
-- anon role, and "revoke ... from public" does not remove that grant. A probe
-- with only the published anon key could call set_daily_log_pdf_metadata:
-- it changed nothing (the author/reviewer check refused), but "daily log not
-- found" versus "not authorised" told an outsider whether a log id existed.
-- The lookup now answers the same way either way, and anon cannot call any of
-- these at all.

revoke execute on function public.set_daily_log_pdf_metadata(text, jsonb) from anon, public;
revoke execute on function public.is_qc_reviewer_for_company(uuid) from anon, public;
revoke execute on function public.can_review_daily_log(bigint) from anon, public;
revoke execute on function public.can_review_daily_log_activity(bigint) from anon, public;
revoke execute on function public.can_read_daily_log_attachment(bigint, text, uuid) from anon, public;
revoke execute on function public.storage_object_in_my_company(text, text) from anon, public;
revoke execute on function public.user_is_in_another_company(uuid, uuid) from anon, public;

grant execute on function public.set_daily_log_pdf_metadata(text, jsonb) to authenticated;
grant execute on function public.is_qc_reviewer_for_company(uuid) to authenticated;
grant execute on function public.can_review_daily_log(bigint) to authenticated;
grant execute on function public.can_review_daily_log_activity(bigint) to authenticated;
grant execute on function public.can_read_daily_log_attachment(bigint, text, uuid) to authenticated;
grant execute on function public.storage_object_in_my_company(text, text) to authenticated;
grant execute on function public.user_is_in_another_company(uuid, uuid) to authenticated;

-- Same message whether the log is missing or not yours.
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

  -- The author, a reviewer in the same company, or a platform admin.
  if target.id is null
     or not (target.technician_id = auth.uid() or public.can_review_daily_log(target.id)) then
    raise exception 'daily log not found or not authorised';
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
revoke execute on function public.set_daily_log_pdf_metadata(text, jsonb) from anon, public;
grant execute on function public.set_daily_log_pdf_metadata(text, jsonb) to authenticated;
