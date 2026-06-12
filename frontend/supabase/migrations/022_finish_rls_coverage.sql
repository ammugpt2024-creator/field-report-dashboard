-- Close out RLS coverage on the dev project.
--
-- daily_log_signatures was created by 001 without the RLS flag (its policies
-- arrived via 018/021 but never applied). project_members and
-- concrete_test_log_attachments are dev-only relics: absent from production,
-- zero rows, and referenced only by dead code that is being removed.
-- Everything here no-ops on production.

alter table if exists public.daily_log_signatures enable row level security;

drop table if exists public.project_members;
drop table if exists public.concrete_test_log_attachments;
