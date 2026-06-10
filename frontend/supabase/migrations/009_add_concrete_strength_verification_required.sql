alter table public.concrete_delivery_testing_records
  add column if not exists strength_verification_required boolean not null default false;
