-- Removing an employee only ever deleted their roster row, so the auth.users
-- account outlived the membership. Nothing else in the app deletes an auth
-- account (only hard_delete_company does), so those logins accumulated
-- permanently -- and an orphan blocks re-onboarding: inviting that address
-- again fails with "already registered", invite-company-user falls back to a
-- magic link, and the person is signed straight in instead of being asked to
-- set a password.
--
-- Removal now also deletes the login, under the same guards hard_delete_company
-- uses: never a platform admin, and never an account that still belongs to
-- another company.
create or replace function public.remove_company_member(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m company_users%rowtype;
  removed_login boolean := false;
begin
  select * into m from company_users where id = p_member;
  if m.id is null then
    raise exception 'member not found';
  end if;

  -- Platform admins, or a company admin acting within their own company.
  if not (
    public.is_platform_admin()
    or exists (
      select 1 from company_users cu
      where cu.company_id = m.company_id
        and cu.user_id = auth.uid()
        and cu.role = 'company_admin'
        and cu.status = 'active'
    )
  ) then
    raise exception 'not authorised to remove this member';
  end if;

  -- Never let an admin remove themselves out of the company this way.
  if m.user_id is not null and m.user_id = auth.uid() then
    raise exception 'you cannot remove your own membership';
  end if;

  if m.user_id is not null then
    delete from project_assignments
     where company_id = m.company_id and user_id = m.user_id;
  end if;

  delete from company_users where id = m.id;

  -- Detach surviving audit rows first: audit_logs.actor_user_id has no ON
  -- DELETE action, so a platform-level row (company_id is null) would make the
  -- delete below raise a foreign-key violation.
  update audit_logs set actor_user_id = null
   where actor_user_id = m.user_id
      or actor_user_id in (select id from auth.users where lower(email) = lower(m.invited_email));

  -- The login, when it is exclusive to the company just left. Matched by id for
  -- an accepted member, and by address for one who never accepted (their
  -- account exists from the invitation, but user_id was never populated).
  delete from auth.users u
  where (u.id = m.user_id
         or (m.user_id is null and lower(u.email) = lower(m.invited_email)))
    and not exists (select 1 from platform_admins pa where pa.user_id = u.id)
    and not exists (select 1 from company_users cu where cu.user_id = u.id);
  removed_login := found;

  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, old_value, new_value)
  values (m.company_id, auth.uid(), 'user_removed', 'company_user', m.id::text,
          jsonb_build_object('email', m.invited_email, 'role', m.role),
          jsonb_build_object('login_deleted', removed_login));

  return jsonb_build_object('removed', true, 'login_deleted', removed_login);
end;
$$;

revoke all on function public.remove_company_member(uuid) from public;
grant execute on function public.remove_company_member(uuid) to authenticated;
