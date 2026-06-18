-- Consent-based, time-limited, masked support access.
--
-- Flow: platform admin REQUESTS access to a report type on a company → the
-- company admin APPROVES (picking the exact reports to share, a duration, and
-- whether to also reveal names) or DENIES → the platform admin can then view
-- ONLY the approved reports, read-only, with sensitive fields masked
-- server-side, until the grant expires. Every step is audited on both sides.
--
-- Platform admins have no standing RLS access to tenant data; all viewing goes
-- through the SECURITY DEFINER functions below, which enforce the grant and do
-- the masking so it can never be bypassed from the browser.

set check_function_bodies = off;

-- Lifecycle + scope columns on the existing session table.
alter table public.platform_support_sessions
  add column if not exists status text not null default 'requested',
  add column if not exists requested_scope text,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_by uuid references auth.users (id),
  add column if not exists approved_at timestamptz,
  add column if not exists denied_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists approved_resource_ids text[] not null default '{}',
  add column if not exists approved_resources jsonb not null default '[]'::jsonb,
  add column if not exists unmask boolean not null default false;

-- Pre-existing sessions from before this model (no scope was ever recorded)
-- are stale test rows; close them out. New requests always set a scope, so
-- this never touches a genuine pending request, even if the migration re-runs.
update public.platform_support_sessions
   set status = 'ended', ended_at = coalesce(ended_at, now())
 where requested_scope is null and ended_at is null;

-- Name → initials (e.g. "John A. Smith" → "J.A.S.").
create or replace function public._mask_name(p_name text)
returns text language sql immutable as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    else (select string_agg(upper(left(w, 1)) || '.', '')
          from regexp_split_to_table(btrim(p_name), '\s+') as w)
  end;
$$;

-- Platform admin opens a request (no access yet).
create or replace function public.request_support_access(p_company uuid, p_scope text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin only';
  end if;
  insert into platform_support_sessions (company_id, platform_admin_id, reason, requested_scope, status, read_only)
  values (p_company, auth.uid(), p_reason, p_scope, 'requested', true)
  returning id into new_id;
  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, new_value)
  values (p_company, auth.uid(), 'support_access_requested', 'platform_support_session', new_id::text,
          jsonb_build_object('scope', p_scope, 'reason', p_reason));
  return new_id;
end;
$$;

-- Company admin approves, choosing exactly which reports to share, for how
-- long, and whether to reveal names. p_resources is [{id, label}, ...].
create or replace function public.approve_support_request(
  p_session uuid, p_resources jsonb, p_duration_hours int, p_unmask boolean
) returns void language plpgsql security definer set search_path = public as $$
declare s platform_support_sessions%rowtype;
begin
  select * into s from platform_support_sessions where id = p_session;
  if s.id is null then raise exception 'request not found'; end if;
  if not (s.company_id = public.auth_company_id() and public.has_company_role(array['company_admin'])) then
    raise exception 'only the company admin can approve';
  end if;
  if s.status <> 'requested' then raise exception 'request is not pending'; end if;

  update platform_support_sessions set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    started_at = now(),
    expires_at = now() + (greatest(coalesce(p_duration_hours, 24), 1) || ' hours')::interval,
    approved_resources = coalesce(p_resources, '[]'::jsonb),
    approved_resource_ids = coalesce(
      (select array_agg(r->>'id') from jsonb_array_elements(coalesce(p_resources, '[]'::jsonb)) r), '{}'),
    unmask = coalesce(p_unmask, false)
  where id = p_session;

  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, new_value)
  values (s.company_id, auth.uid(), 'support_access_approved', 'platform_support_session', s.id::text,
          jsonb_build_object('scope', s.requested_scope,
                             'reports', jsonb_array_length(coalesce(p_resources, '[]'::jsonb)),
                             'hours', p_duration_hours, 'unmask', coalesce(p_unmask, false)));
end;
$$;

create or replace function public.deny_support_request(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s platform_support_sessions%rowtype;
begin
  select * into s from platform_support_sessions where id = p_session;
  if s.id is null then raise exception 'request not found'; end if;
  if not (s.company_id = public.auth_company_id() and public.has_company_role(array['company_admin'])) then
    raise exception 'only the company admin can deny';
  end if;
  update platform_support_sessions set status = 'denied', denied_at = now() where id = p_session;
  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id)
  values (s.company_id, auth.uid(), 'support_access_denied', 'platform_support_session', s.id::text);
end;
$$;

-- Either side can end an active grant.
create or replace function public.end_support_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s platform_support_sessions%rowtype;
begin
  select * into s from platform_support_sessions where id = p_session;
  if s.id is null then raise exception 'session not found'; end if;
  if not (public.is_platform_admin() and s.platform_admin_id = auth.uid())
     and not (s.company_id = public.auth_company_id() and public.has_company_role(array['company_admin'])) then
    raise exception 'not authorized to end this session';
  end if;
  update platform_support_sessions set status = 'ended', ended_at = now() where id = p_session;
  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id)
  values (s.company_id, auth.uid(), 'support_access_ended', 'platform_support_session', s.id::text);
end;
$$;

-- The masked, read-only window into a single approved daily log.
create or replace function public.get_support_daily_log(p_session uuid, p_log_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s platform_support_sessions%rowtype;
  do_unmask boolean;
  tech_name text;
  result jsonb;
begin
  select * into s from platform_support_sessions where id = p_session;
  if s.id is null then raise exception 'session not found'; end if;
  if s.platform_admin_id <> auth.uid() then raise exception 'not your session'; end if;
  if s.status <> 'approved' then raise exception 'access has not been approved'; end if;
  if s.ended_at is not null then raise exception 'this support session has ended'; end if;
  if s.expires_at is null or s.expires_at <= now() then raise exception 'this support access has expired'; end if;
  if s.requested_scope <> 'daily_log' then raise exception 'wrong scope for this report type'; end if;
  if not (p_log_id::text = any(s.approved_resource_ids)) then raise exception 'this report was not shared'; end if;

  do_unmask := coalesce(s.unmask, false);

  select coalesce(p.full_name, '') into tech_name
  from daily_logs dl left join profiles p on p.id = dl.technician_id
  where dl.id = p_log_id;

  select jsonb_build_object(
    'id', dl.id,
    'log_date', dl.log_date,
    'shift', dl.shift,
    'status', dl.status,
    'supervisor_name', case when do_unmask then dl.supervisor_name else public._mask_name(dl.supervisor_name) end,
    'technician', case when do_unmask then nullif(tech_name, '') else public._mask_name(tech_name) end,
    'weather', jsonb_build_object('summary', dl.weather_summary, 'condition', dl.weather_condition,
       'temperature', dl.temperature, 'humidity', dl.humidity, 'wind_speed', dl.wind_speed,
       'rain_probability', dl.rain_probability),
    'site_conditions', dl.site_conditions,
    'submitted_at', dl.submitted_at,
    'approved_at', dl.approved_at,
    'returned_at', dl.returned_at,
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activity_type', a.activity_type, 'title', a.title, 'description', a.description,
        'location', a.location, 'start_time', a.start_time, 'end_time', a.end_time,
        'crew_size', a.crew_size, 'equipment_used', a.equipment_used,
        'material_used', a.material_used, 'status', a.status, 'notes', a.notes) order by a.id)
      from daily_log_activities a where a.daily_log_id = dl.id), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object('file_name', t.file_name, 'file_type', t.file_type,
        'attachment_type', t.attachment_type))
      from daily_log_attachments t where t.daily_log_id = dl.id and t.deleted_at is null), '[]'::jsonb),
    'signatures_on_file', (select count(*) from daily_log_signatures sg where sg.daily_log_id = dl.id)
  ) into result
  from daily_logs dl
  where dl.id = p_log_id and dl.company_id = s.company_id;

  if result is null then raise exception 'report not found'; end if;

  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, new_value)
  values (s.company_id, auth.uid(), 'support_data_viewed', 'daily_log', p_log_id::text,
          jsonb_build_object('session', s.id, 'masked', not do_unmask));

  return result;
end;
$$;

grant execute on function public.request_support_access(uuid, text, text) to authenticated;
grant execute on function public.approve_support_request(uuid, jsonb, int, boolean) to authenticated;
grant execute on function public.deny_support_request(uuid) to authenticated;
grant execute on function public.end_support_session(uuid) to authenticated;
grant execute on function public.get_support_daily_log(uuid, bigint) to authenticated;
