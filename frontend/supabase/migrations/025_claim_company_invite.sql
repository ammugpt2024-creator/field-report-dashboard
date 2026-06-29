-- When an invited user signs in for the first time, attach their auth account
-- to the pending company_users invitation matching their email. SECURITY
-- DEFINER because the invitee has no company yet and so no RLS access to the
-- roster row they are claiming.
create or replace function public.claim_company_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed company_users%rowtype;
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
    insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, new_value)
    values (claimed.company_id, auth.uid(), 'user_invite_claimed', 'company_user', claimed.id::text,
            jsonb_build_object('email', claimed.invited_email, 'role', claimed.role));
    return jsonb_build_object('claimed', true, 'company_id', claimed.company_id, 'role', claimed.role);
  end if;
  return jsonb_build_object('claimed', false);
end;
$$;
