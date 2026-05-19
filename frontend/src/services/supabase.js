import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tjuahoyhjgefpeklyvzi.supabase.co'
const supabaseKey = 'sb_publishable_zjFsbIpBYvu5ndX-H18uYQ_blRAzK33'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)