alter table public.concrete_delivery_testing_records
  add column if not exists start_placement text,
  add column if not exists strength_verification_required text;
