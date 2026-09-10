-- Let a company admin actually record a review decision.
--
-- Returning or approving a daily log issues a plain UPDATE. The permissive
-- UPDATE policies on daily_logs are:
--
--   018  is_qc_reviewer()            -- profiles.role in (qc, qc_approver,
--                                    --   qc_manager, admin)
--   021  technician_id = auth.uid()  -- the author
--   036  reviewer_user_id = auth.uid() -- the routed reviewer
--
-- A company admin matches none of them: 018 predates the SaaS roles and never
-- learned about 'company_admin', they did not write the log, and reviewer
-- routing is optional and mostly unset (reviewer_user_id is NULL on the rows
-- in production today).
--
-- Postgres does not error when RLS filters an UPDATE - it simply matches no
-- rows - so the client saw success, the manager's screen showed "Returned For
-- Correction" from its own local copy, and the row stayed 'submitted'. Both
-- Returned tabs then read empty, because they read the database.
--
-- The restrictive module gate already grants company admins 'manage'
-- (034 user_module_level), so this only supplies the missing permissive half,
-- scoped to their own company.

-- Rows written before 023 backfilled the column, or by a path that skipped the
-- default, would otherwise fail the company check below.
update public.daily_logs dl
set company_id = cu.company_id
from public.company_users cu
where dl.company_id is null
  and cu.user_id = dl.technician_id
  and cu.status = 'active';

drop policy if exists "Company admins review daily logs" on public.daily_logs;
create policy "Company admins review daily logs"
on public.daily_logs
for update to authenticated
using (
  public.is_platform_admin()
  or (
    public.has_company_role(array['company_admin'])
    and company_id = public.auth_company_id()
  )
)
with check (
  public.is_platform_admin()
  or (
    public.has_company_role(array['company_admin'])
    and company_id = public.auth_company_id()
  )
);
