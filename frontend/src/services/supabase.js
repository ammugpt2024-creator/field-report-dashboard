/* global __DB_URL__, __DB_ANON_KEY__, __DB_TARGET__, __DB_BRANCH__ */
import { createClient } from '@supabase/supabase-js'

// Database selection (the build-time branch mapping lives in vite.config.js):
// - `npm run dev` loads .env.development → dev project.
// - Deploys resolve by git branch: `main` → production; every other branch
//   (feature / Roopa / Hari / Indra / …) → dev. Feature/dev deployments never
//   touch the production database.
// - An explicit VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY always wins.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || __DB_URL__
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || __DB_ANON_KEY__

// Surface which database this build talks to — catches env misconfiguration.
if (typeof console !== 'undefined') {
  console.info(`[QCore] Database: ${__DB_TARGET__} (branch: ${__DB_BRANCH__})`)
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
