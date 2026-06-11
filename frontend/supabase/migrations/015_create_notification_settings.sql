-- Notification settings live in the database so addresses are configurable
-- without code changes. The send-qc-email edge function reads these with the
-- service role; authenticated clients may read them for display purposes.

create table if not exists public.notification_settings (
  key text primary key,
  value text not null,
  description text null,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists "notification_settings_read_authenticated" on public.notification_settings;
create policy "notification_settings_read_authenticated"
  on public.notification_settings for select
  to authenticated
  using (true);

insert into public.notification_settings (key, value, description)
values (
  'email_from_address',
  'QCore <notifications@qcoreapp.com>',
  'From address used for outbound notification emails (Resend verified domain).'
)
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now();
