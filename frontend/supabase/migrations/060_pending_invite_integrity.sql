-- One pending invitation per address per company, and a record of when it
-- was issued.
--
-- company_users enforces unique (company_id, user_id), but user_id stays null
-- until the invitation is accepted, so nothing stopped a second, third or
-- tenth pending row for the same address: two admins inviting at once, or one
-- admin working from a stale page, made duplicates. claim_company_invite()
-- then updates a single row and leaves the rest stuck at 'invited' for good.
--
-- The browser checked the roster it happened to have loaded. That is a
-- courtesy, not a rule, so the rule goes here.

-- 1. Collapse existing duplicates, keeping the oldest pending row per address
--    (the one whose link was sent first; later ones are re-invites).
delete from public.company_users cu
using public.company_users keep
where cu.status = 'invited'
  and cu.user_id is null
  and keep.status = 'invited'
  and keep.user_id is null
  and keep.company_id = cu.company_id
  and lower(keep.invited_email) = lower(cu.invited_email)
  and (keep.created_at < cu.created_at or (keep.created_at = cu.created_at and keep.id < cu.id));

-- 2. A pending invitation is unique per company and address, case-insensitive.
--    Accepted rows are excluded: those are governed by (company_id, user_id).
drop index if exists company_users_pending_invite_key;
create unique index company_users_pending_invite_key
  on public.company_users (company_id, lower(invited_email))
  where user_id is null and status = 'invited';

-- 3. When the invitation was last issued, so the roster can show its age and
--    an admin can see which links have gone stale. Existing rows adopt their
--    creation time; resendInvite() stamps it from here on.
alter table public.company_users
  add column if not exists invited_at timestamptz;

update public.company_users
set invited_at = created_at
where invited_at is null and status = 'invited';

-- New invitations stamp themselves, so no client can forget to.
create or replace function public.stamp_invited_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and coalesce(new.status, 'invited') = 'invited' then
    new.invited_at := coalesce(new.invited_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists company_users_stamp_invited_at on public.company_users;
create trigger company_users_stamp_invited_at
before insert on public.company_users
for each row execute function public.stamp_invited_at();
