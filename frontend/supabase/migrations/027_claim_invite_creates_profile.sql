-- Claiming an invitation now also creates the legacy profiles row, mapping
-- the SaaS roster role onto the profile role that drives existing routing
-- and flows. Without it, invited technicians and managers landed on the
-- viewer fallback because profiles.role was missing entirely.
create or replace function public.claim_company_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed company_users%rowtype;
  legacy_role text;
begin
  update public.company_users
     set user_id = auth.uid(),
         status = 'active',
         updated_at = now()
   where user_id is null
     and status = 'invited'
     and lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  returning * into claimed;

  if claimed.id is not null then
    legacy_role := case claimed.role
      when 'company_admin' then 'company_admin'
      when 'project_manager' then 'project_manager'
      when 'deputy_project_manager' then 'project_manager'
      when 'technician' then 'technician'
      when 'lab_technician' then 'technician'
      when 'inspector' then 'qc'
      else 'viewer'
    end;

    insert into public.profiles (id, email, full_name, role, company_id, company_name)
    select auth.uid(), claimed.invited_email, claimed.full_name, legacy_role, claimed.company_id,
           (select company_name from companies where id = claimed.company_id)
    on conflict (id) do update
      set company_id = excluded.company_id,
          role = coalesce(profiles.role, excluded.role);

    insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, new_value)
    values (claimed.company_id, auth.uid(), 'user_invite_claimed', 'company_user', claimed.id::text,
            jsonb_build_object('email', claimed.invited_email, 'role', claimed.role));
    return jsonb_build_object('claimed', true, 'company_id', claimed.company_id, 'role', claimed.role);
  end if;
  return jsonb_build_object('claimed', false);
end;
$$;
