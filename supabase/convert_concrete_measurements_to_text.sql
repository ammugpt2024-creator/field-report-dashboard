-- Allow technicians to enter field-recorded ranges and non-numeric values
-- such as "3-5", "5-2", "N/A", and "Refused" without PostgreSQL numeric
-- cast errors. Run this once in the Supabase SQL Editor.

alter table public.concrete_specifications
  alter column air_content type text using air_content::text,
  alter column unit_weight type text using unit_weight::text,
  alter column spread type text using spread::text,
  alter column slump type text using slump::text,
  alter column concrete_temp type text using concrete_temp::text,
  alter column j_ring type text using j_ring::text,
  alter column speed_of_stress type text using speed_of_stress::text;

alter table public.concrete_delivery_testing_records
  alter column test_number type text using test_number::text,
  alter column cubic_yards type text using cubic_yards::text,
  alter column actual_minutes type text using actual_minutes::text,
  alter column water_added_gal type text using water_added_gal::text,
  alter column air_temp_f type text using air_temp_f::text,
  alter column concrete_temp_f type text using concrete_temp_f::text,
  alter column slump_in type text using slump_in::text,
  alter column air_content_percent type text using air_content_percent::text,
  alter column unit_weight_lbs_ft3 type text using unit_weight_lbs_ft3::text,
  alter column j_ring_in type text using j_ring_in::text,
  alter column spread_in type text using spread_in::text,
  alter column lab_cylinders type text using lab_cylinders::text,
  alter column field_cylinders type text using field_cylinders::text;
