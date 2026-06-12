import { createClient } from '@supabase/supabase-js'

// Environment-driven database selection:
// - `npm run dev` loads .env.development → field-dashboard-dev project
// - `npm run build` (production mode) falls back to the production project
//   unless VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are provided at build time.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tjuahoyhjgefpeklyvzi.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdWFob3loamdlZnBla2x5dnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDA4NTQsImV4cCI6MjA5NDc3Njg1NH0.UQCITJ5AMyosArTpI8LAb8FNo3UqfT1_OXAVHW3ef7s'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)
