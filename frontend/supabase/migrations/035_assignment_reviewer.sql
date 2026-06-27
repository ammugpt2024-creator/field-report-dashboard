-- Per-project reporting line: who reviews a given person's work on a project.
-- reviewer_user_id points at another team member on the same project (typically
-- a PM / deputy PM / inspector). Submitted reports route to that reviewer
-- (routing wired in a follow-up). Nullable — no reviewer means it falls back to
-- the company's default QC recipient, as today.
alter table public.project_assignments
  add column if not exists reviewer_user_id uuid references auth.users (id) on delete set null;
