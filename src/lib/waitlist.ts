// Closed waitlist: the IDE at /app stays locked for everyone until launch.
// Flip IDE_OPEN to true on launch day — hasJoinedWaitlist() then honours
// the landing-page flag again. Local dev bypasses the gate so `npm run dev`
// never blocks.

export const WAITLIST_KEY = 'zut:waitlist-joined';

// Launch switch. false = marketing phase, nobody gets into /app.
// true = open phase, joiners get into /app.
export const IDE_OPEN = false;

// Same project the landing page posts to (public anon insert-only).
// Env wins when configured; hardcoded fallback keeps Vercel working
// even if VITE_SUPABASE_* is missing at build time.
const FALLBACK_URL = 'https://tmajgvivaizcjpysggod.supabase.co';
const FALLBACK_KEY = 'sb_publishable_mjeMCS-80ht6EV04Zdc7hA_VWiyssbs';

function supabaseRest(): { url: string; key: string } | null {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL;
  const key =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    FALLBACK_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export function hasJoinedWaitlist(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    const host = window.location.hostname;
    // Dev bypass: never gate localhost / 127.0.0.1 or explicit ?nowait.
    if (host === 'localhost' || host === '127.0.0.1') return true;
    const q = new URLSearchParams(window.location.search);
    if (q.has('nowait') || q.has('skip_waitlist')) return true;
    // Closed phase: joining records the flag for launch day, but unlocks nothing.
    if (!IDE_OPEN) return false;
    return !!localStorage.getItem(WAITLIST_KEY);
  } catch {
    return false;
  }
}

export function markWaitlistJoined(email: string): void {
  try {
    localStorage.setItem(
      WAITLIST_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), at: Date.now() }),
    );
  } catch {
    /* storage full / private mode — gate will ask again next visit */
  }
}

export async function joinWaitlist(email: string): Promise<'joined' | 'exists'> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email to join.');
  const rest = supabaseRest();
  if (!rest) throw new Error('Waitlist is not configured.');
  const res = await fetch(`${rest.url}/rest/v1/waitlist`, {
    method: 'POST',
    headers: {
      apikey: rest.key,
      Authorization: `Bearer ${rest.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ email: clean }),
  });
  if (res.status === 201 || res.status === 204) {
    markWaitlistJoined(clean);
    return 'joined';
  }
  if (res.status === 409) {
    markWaitlistJoined(clean);
    return 'exists';
  }
  throw new Error('Could not join right now — please try again.');
}
