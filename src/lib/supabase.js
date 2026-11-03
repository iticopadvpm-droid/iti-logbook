import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const usingShim = import.meta.env.VITE_USE_SHIM === '1'
export const configured = usingShim || !!(url && key)

// PKCE keeps the reset-password / confirm-email links as  ?code=…  (instead of a #hash),
// which does not clash with the hash-based routing used for GitHub Pages.
export const supabase = configured
  ? createClient(url || 'http://shim', key || 'shim', {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
