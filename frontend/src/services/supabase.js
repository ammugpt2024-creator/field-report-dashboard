import { createClient } from '@supabase/supabase-js'

// Environment-driven database selection:
// - `npm run dev` loads .env.development → field-dashboard-dev project
// - `npm run build` (production mode) falls back to the production project
//   unless VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are provided at build time.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tjuahoyhjgefpeklyvzi.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdWFob3loamdlZnBla2x5dnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDA4NTQsImV4cCI6MjA5NDc3Njg1NH0.UQCITJ5AMyosArTpI8LAb8FNo3UqfT1_OXAVHW3ef7s'

// Invitation and recovery links land with the token type in the URL hash,
// which the client consumes while establishing the session. Capture it first
// so the app can route the new user to the set-password screen.
const authHashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
const authFlowType = authHashParams.get('type')
if (authFlowType === 'invite' || authFlowType === 'recovery') {
  sessionStorage.setItem('qcore-auth-flow', authFlowType)
}
// Re-clicked or expired invite/recovery links arrive as an error hash; let
// the login screen explain instead of failing silently.
if (authHashParams.get('error_code') === 'otp_expired') {
  sessionStorage.setItem('qcore-auth-error', 'otp_expired')
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)
