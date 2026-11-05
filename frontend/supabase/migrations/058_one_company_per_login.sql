-- A login belongs to one company.
--
-- Inviting an address that already belongs to another company created a
-- SECOND active row in company_users for that person, because
-- claim_company_invite() runs as SECURITY DEFINER and so passes straight
-- through the restrictive roster policy added in 050.
--
-- Everything that decides "which company am I in" then became a coin toss:
-- auth_company_id() ends in "limit 1" with no ORDER BY, and every RLS policy
-- in the product is built on it. The person could open the new company and be
-- shown the other company's projects and reports -- a tenant isolation
-- failure, not merely a confusing screen.
--
-- Three changes:
--   1. auth_company_id() becomes deterministic (oldest membership wins), so a
--      session can never drift between companies between queries.
--   2. An invite cannot be created for an address that is already an active
--      member elsewhere; the admin is told whose it is.
--   3. Claiming an invite refuses if the claimer already belongs to another
--      company, instead of quietly making a second membership.

-- ── 1. One answer, always the same ─────────────────────────────────────────
create or replace function public.auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.company_users
  where user_id = auth.uid() and status = 'active'
  order by created_at, id
  limit 1;
$$;

-- ── 2. Refuse a roster row that takes someone from another company ─────────
create or replace function public.enforce_one_company_per_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_company text;
begin
  -- By user id (an accepted account), ignoring this row itself.
  if new.user_id is not null and coalesce(new.status, 'invited') <> 'disabled' then
    select c.company_name into other_company
    from public.company_users cu
    join public.companies c on c.id = cu.company_id
    where cu.user_id = new.user_id
      and cu.company_id <> new.company_id
      and cu.status = 'active'
      and cu.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    limit 1;
    if other_company is not null then
      raise exception 'That person already has a QCore account with %. One login belongs to one company: use a different email address for this company.', other_company
        using errcode = 'unique_violation';
    end if;
  end if;

  -- By invited address, before the account exists.
  if new.invited_email is not null and coalesce(new.status, 'invited') <> 'disabled' then
    select c.company_name into other_company
    from public.company_users cu
    join public.companies c on c.id = cu.company_id
    join public.profiles p on p.id = cu.user_id
    where lower(p.email) = lower(new.invited_email)
      and cu.company_id <> new.company_id
      and cu.status = 'active'
    limit 1;
    if other_company is not null then
      raise exception 'That email already belongs to % on QCore. One login belongs to one company: use a different email address for this company.', other_company
        using errcode = 'unique_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists company_users_one_company_per_login on public.company_users;
create trigger company_users_one_company_per_login
before insert or update on public.company_users
for each row execute function public.enforce_one_company_per_login();

-- ── 3. Claiming cannot create a second membership ──────────────────────────
create or replace function public.claim_company_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed company_users%rowtype;
  legacy_role text;
  existing_company text;
begin
  -- Already a member somewhere? Then this invitation is not claimable, and
  -- the caller keeps the company they already have.
  select c.company_name into existing_company
  from public.company_users cu
  join public.companies c on c.id = cu.company_id
  where cu.user_id = auth.uid() and cu.status = 'active'
  limit 1;

  if existing_company is not null then
    return jsonb_build_object('claimed', false, 'reason', 'already_in_company', 'company_name', existing_company);
  end if;

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

-- ── Existing duplicates ────────────────────────────────────────────────────
-- The trigger only guards new rows. List anyone who is already active in more
-- than one company; each needs a decision (which company they keep) before
-- their sessions stop depending on row order:
--
--   select p.email, c.company_name, cu.role, cu.created_at
--   from company_users cu
--   join companies c on c.id = cu.company_id
--   left join profiles p on p.id = cu.user_id
--   where cu.status = 'active'
--     and cu.user_id in (
--       select user_id from company_users
--       where status = 'active' and user_id is not null
--       group by user_id having count(distinct company_id) > 1)
--   order by p.email, cu.created_at;
