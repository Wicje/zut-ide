// User token helper (Supabase today, Mudbase next).
// Broker routes need `Authorization: Bearer <user token>` — never a service key.
// The browser holds only the user's own token.

import { supabaseOrNull } from './supabase'

const LS_KEY = 'zut:auth:token'

export async function getUserToken(): Promise<string | null> {
  const supabase = supabaseOrNull()
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      const t = data.session?.access_token
      if (t) return t
    } catch {
      /* fall through to local */
    }
  }
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

/** Dev/local escape hatch: store a Mudbase user token for broker calls. */
export function setUserToken(token: string): void {
  try {
    localStorage.setItem(LS_KEY, token)
  } catch {
    /* ignore */
  }
}
