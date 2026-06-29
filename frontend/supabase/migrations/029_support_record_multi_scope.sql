-- Generalize masked support viewing to multiple report types. One guarded
-- SECURITY DEFINER function returns the masked record for whatever scope the
-- session was approved for: daily logs, field test reports, or lab reports.
-- Same guarantees as before — platform admin only, approved + unexpired +
-- not ended grant, the record must be in the approved set, masking server-side.

set check_function_bodies = off;

create or replace function public.get_support_record(p_session uuid, p_record_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s platform_support_sessions%rowtype;
  do_unmask boolean;
  result jsonb;
  tname text;
begin
  select * into s from platform_support_sessions where id = p_session;
  if s.id is null then raise exception 'session not found'; end if;
  if s.platform_admin_id <> auth.uid() then raise exception 'not your session'; end if;
  if s.status <> 'approved' then raise exception 'access has not been approved'; end if;
  if s.ended_at is not null then raise exception 'this support session has ended'; end if;
  if s.expires_at is null or s.expires_at <= now() then raise exception 'this support access has expired'; end if;
  if not (p_record_id = any(s.approved_resource_ids)) then raise exception 'this report was not shared'; end if;
  do_unmask := coalesce(s.unmask, false);

  if s.requested_scope = 'daily_log' then
    select coalesce(p.full_name, '') into tname
    from daily_logs dl left join profiles p on p.id = dl.technician_id
    where dl.id = p_record_id::bigint;
    select jsonb_build_object(
      'scope', 'daily_log', 'id', dl.id, 'title', 'Daily Log',
      'log_date', dl.log_date, 'shift', dl.shift, 'status', dl.status,
      'supervisor_name', case when do_unmask then dl.supervisor_name else public._mask_name(dl.supervisor_name) end,
      'technician', case when do_unmask then nullif(tname, '') else public._mask_name(tname) end,
      'weather', jsonb_build_object('summary', dl.weather_summary, 'condition', dl.weather_condition, 'temperature', dl.temperature),
      'site_conditions', dl.site_conditions, 'submitted_at', dl.submitted_at,
      'activities', coalesce((select jsonb_agg(jsonb_build_object(
        'activity_type', a.activity_type, 'title', a.title, 'description', a.description,
        'location', a.location, 'start_time', a.start_time, 'end_time', a.end_time,
        'crew_size', a.crew_size, 'equipment_used', a.equipment_used, 'material_used', a.material_used,
        'status', a.status, 'notes', a.notes) order by a.id)
        from daily_log_activities a where a.daily_log_id = dl.id), '[]'::jsonb),
      'attachments', coalesce((select jsonb_agg(jsonb_build_object('file_name', t.file_name, 'attachment_type', t.attachment_type))
        from daily_log_attachments t where t.daily_log_id = dl.id and t.deleted_at is null), '[]'::jsonb),
      'signatures_on_file', (select count(*) from daily_log_signatures sg where sg.daily_log_id = dl.id)
    ) into result from daily_logs dl where dl.id = p_record_id::bigint and dl.company_id = s.company_id;

  elsif s.requested_scope = 'field_test_report' then
    select jsonb_build_object(
      'scope', 'field_test_report', 'id', c.id, 'title', coalesce(c.dfr_number, 'Field Test Report'),
      'dfr_number', c.dfr_number, 'report_type', c.report_type, 'status', c.status, 'date_sampled', c.date_sampled,
      'location', c.location, 'weather', c.weather, 'batch_plant', c.batch_plant,
      'time_in', c.time_in, 'time_out', c.time_out, 'total_quantity_placed', c.total_quantity_placed,
      'technician', case when do_unmask then c.technician_name else public._mask_name(c.technician_name) end,
      'submitted_by', case when do_unmask then c.submitted_by_name else public._mask_name(c.submitted_by_name) end,
      'general_contractor', c.gc, 'sub_contractor', c.sub_contractor,
      'specs', jsonb_build_object('slump', c.slump_spec, 'air', c.air_content_spec,
        'strength', c.strength_spec, 'unit_weight', c.unit_weight_spec, 'mix_no', c.mix_no_spec),
      'signatures_on_file', (case when c.technician_signature_url is not null or c.qc_signature_url is not null then 'on file' else 'none' end)
    ) into result from concrete_test_logs c where c.id = p_record_id::bigint and c.company_id = s.company_id;

  elsif s.requested_scope = 'lab_report' then
    select jsonb_build_object(
      'scope', 'lab_report', 'id', l.id, 'title', coalesce(l.report_number, l.sample_id, 'Lab Report'),
      'report_number', l.report_number, 'sample_id', l.sample_id, 'test_type', l.test_type,
      'specimen_date', l.specimen_date, 'break_date', l.break_date, 'status', l.status,
      'result', l.result
    ) into result from lab_reports l where l.id = p_record_id::uuid and l.company_id = s.company_id;

  else
    raise exception 'unsupported scope: %', s.requested_scope;
  end if;

  if result is null then raise exception 'report not found'; end if;

  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, new_value)
  values (s.company_id, auth.uid(), 'support_data_viewed', s.requested_scope, p_record_id,
          jsonb_build_object('session', s.id, 'masked', not do_unmask));

  return result;
end;
$$;

grant execute on function public.get_support_record(uuid, text) to authenticated;
