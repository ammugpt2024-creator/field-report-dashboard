-- Scope project visibility by assignment. Only the COMPANY ADMIN sees every
-- project in the company. Everyone else — project managers, deputy PMs,
-- technicians, inspectors, lab techs, viewers — sees ONLY the projects the
-- admin has assigned them via project_assignments. This makes each person's
-- dashboard and report pickers show just their work, auto-populating the right
-- project details, without leaking other projects.

drop policy if exists "Company members read projects" on public.projects;
drop policy if exists "Members read assigned or managed projects" on public.projects;
create policy "Members read assigned or managed projects" on public.projects
  for select to authenticated using (
    company_id = public.auth_company_id()
    and (
      public.has_company_role(array['company_admin'])
      or exists (
        select 1 from public.project_assignments pa
        where pa.project_id = projects.id and pa.user_id = auth.uid()
      )
    )
  );
