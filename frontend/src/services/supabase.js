/* global __DB_URL__, __DB_ANON_KEY__, __DB_TARGET__, __DB_BRANCH__ */
import { createClient } from '@supabase/supabase-js'

// Database selection (the build-time branch mapping lives in vite.config.js):
// - Deploys resolve by git branch: `main`/`master` → production; every other
//   branch (feature / Roopa / Hari / Indra / …) → dev.
// - NON-PRODUCTION BRANCHES ARE PINNED TO DEV. An env var (e.g. a stray
//   VITE_SUPABASE_URL in Vercel) can NOT point a feature/dev deploy at the
//   production database — this is a hard safety rail so dev work never writes
//   to production. Env overrides are honored only on the production branch.
const supabaseUrl = __DB_TARGET__ === 'production'
  ? (import.meta.env.VITE_SUPABASE_URL || __DB_URL__)
  : __DB_URL__
const supabaseKey = __DB_TARGET__ === 'production'
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY || __DB_ANON_KEY__)
  : __DB_ANON_KEY__

// Log the ACTUAL project this build talks to (ref + branch), so a misconfig is
// obvious in the console.
if (typeof console !== 'undefined') {
  const ref = String(supabaseUrl).replace('https://', '').split('.')[0]
  console.info(`[QCore] Database: ${__DB_TARGET__} → ${ref} (branch: ${__DB_BRANCH__})`)
}

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
