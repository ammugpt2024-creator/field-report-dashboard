-- QC review emails go to the project manager. When no profile carries the
-- qc_manager role, the send-qc-email function falls back to this address.

insert into public.notification_settings (key, value, description)
values (
  'qc_reviewer_email',
  'indrav2025@gmail.com',
  'Recipient for QC review notifications when no qc_manager profile is found.'
)
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now();

-- If the project manager already has a profile, make sure it carries the
-- qc_manager role so the role-based lookup resolves it directly (never
-- downgrade an admin).
update public.profiles
set role = 'qc_manager'
where lower(email) = 'indrav2025@gmail.com'
  and lower(coalesce(role, '')) not in ('admin', 'qc_manager');
