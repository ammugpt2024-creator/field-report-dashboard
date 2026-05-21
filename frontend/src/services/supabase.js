import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tjuahoyhjgefpeklyvzi.supabase.co'
// const supabaseKey = 'sb_publishable_zjFsbIpBYvu5ndX-H18uYQ_blRAzK33'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdWFob3loamdlZnBla2x5dnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDA4NTQsImV4cCI6MjA5NDc3Njg1NH0.UQCITJ5AMyosArTpI8LAb8FNo3UqfT1_OXAVHW3ef7s'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)