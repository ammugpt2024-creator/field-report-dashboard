-- The reporting structure was advisory: a daily log was routed to the reviewer
-- the admin picked for that person on that project, and it notified them, but
-- anyone holding Approve & Manage on the project could approve anybody's work.
-- On a project with two managers there was nothing keeping each manager to
-- their own team.
--
-- Approval now follows the reporting line. Enforced with a trigger rather than
-- an RLS policy because the rule depends on the status TRANSITION, which a
-- policy cannot see.
--
-- Who may approve or return a daily log:
--   * the reviewer it was routed to (daily_logs.reviewer_user_id), or
--   * a company admin / platform admin, who keep an override, or
--   * when the log was never routed (no reviewer assigned for that person on
--     that project), anyone with approve+ on the project's Daily Logs.
--
-- That last branch is the safety valve: reporting lines are optional and mostly
-- unset today, so without it every unrouted log would become approvable only by
-- an admin the moment this ships.
create or replace function public.enforce_daily_log_reviewer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_decision boolean;
begin
  -- Only guard the moment a log becomes approved or returned. Drafting,
  -- submitting, and editing are untouched.
  is_decision := new.status in ('approved', 'returned_corrections')
                 and coalesce(old.status, '') is distinct from new.status;
  if not is_decision then
    return new;
  end if;

  if public.is_platform_admin() or public.has_company_role(array['company_admin']) then
    return new;
  end if;

  if new.reviewer_user_id is not null then
    if new.reviewer_user_id = auth.uid() then
      return new;
    end if;
    raise exception
      'This daily log is assigned to a different reviewer. Only their reporting manager or a company admin can approve or return it.'
      using errcode = 'check_violation';
  end if;

  -- Never routed: fall back to the project's approvers.
  if public.user_can_module(new.project_id, 'daily_logs', 'approve') then
    return new;
  end if;

  raise exception
    'You are not the assigned reviewer for this daily log.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_enforce_daily_log_reviewer on public.daily_logs;
create trigger trg_enforce_daily_log_reviewer
  before update on public.daily_logs
  for each row
  execute function public.enforce_daily_log_reviewer();
