-- Per-person access level on a project assignment. When a company admin
-- assigns someone to a project, they decide what that person can do there.
-- This column stores that decision; Phase B enforcement reads it.
--   full           — manage project & team, create, approve/return, view all
--   review_approve — view all reports + approve/return (no team management)
--   create_edit    — create/edit own logs & reports, submit for review
--   view_only      — read-only access to the project's reports

alter table public.project_assignments
  add column if not exists access_level text not null default 'create_edit'
  check (access_level in ('full', 'review_approve', 'create_edit', 'view_only'));

-- Backfill sensible defaults for any rows created before this column existed,
-- inferring access from the role they were assigned with.
update public.project_assignments
set access_level = case
  when assignment_role in ('project_manager', 'deputy_project_manager') then 'full'
  when assignment_role = 'inspector' then 'review_approve'
  else 'create_edit'
end
where access_level = 'create_edit';
