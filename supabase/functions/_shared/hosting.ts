// Shared helpers for the zut hosting Edge Functions (GitHub / Vercel / Claude).
// Uses only platform env vars and the fetch API — no external deps.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, apikey, x-client-info, x-application-name, content-type',
}

export interface ZutUser {
  id: string
  email?: string | null
}

export function json(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...headers },
  })
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS })
}

export function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url, ...CORS } })
}

export function errorResponse(status: number, message: string): Response {
  return json(status, { error: message })
}

/** Handle request dispatch with std CORS/preflight + error wrapping. */
export function serve(req: Request, handler: (req: Request) => Promise<Response>): Promise<Response> {
  if (req.method === 'OPTIONS') return Promise.resolve(corsPreflight())
  return handler(req).catch((err) => {
    const e = err as { status?: number; message?: string }
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500
    if (status >= 500) console.error('[zut]', e)
    return errorResponse(status, e.message ?? 'Internal error')
  })
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Server is missing env var ${name}`)
  return v
}

function httpError(status: number, message: string): Error & { status: number } {
  const e = new Error(message) as Error & { status: number }
  e.status = status
  return e
}

function supabaseUrl(): string {
  return requireEnv('SUPABASE_URL')
}

function serviceRole(): string {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY')
}

/** Call the Auth endpoint to validate the user's JWT (no SDK needed). */
export async function requireUser(req: Request): Promise<ZutUser> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) throw httpError(401, 'Not signed in')

  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: requireEnv('SUPABASE_ANON_KEY') },
  })
  if (!res.ok) throw httpError(401, 'Not signed in')
  const user = (await res.json()) as { id?: string; email?: string | null }
  if (!user.id) throw httpError(401, 'Not signed in')
  return { id: user.id, email: user.email ?? null }
}

/** PostgREST helper using the service role. */
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${supabaseUrl()}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceRole(),
      Authorization: `Bearer ${serviceRole()}`,
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    },
  })
  return res
}

export interface StoredConnection {
  id?: string
  owner_id: string
  provider: 'github' | 'vercel'
  access_token: string
  refresh_token?: string | null
  scope?: string | null
  meta: Record<string, unknown>
}

export async function saveConnection(conn: StoredConnection): Promise<void> {
  const res = await rest('/connections?on_conflict=owner_id,provider', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ ...conn, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`Database error (${res.status})`)
}

export async function getConnection(
  ownerId: string,
  provider: 'github' | 'vercel',
): Promise<{ access_token: string; meta: Record<string, unknown>; refresh_token?: string | null } | null> {
  const res = await rest(
    `/connections?owner_id=eq.${ownerId}&provider=eq.${provider}&select=access_token,refresh_token,meta&limit=1`,
  )
  if (!res.ok) throw new Error(`Database error (${res.status})`)
  const rows = (await res.json()) as Array<{
    access_token: string
    refresh_token?: string | null
    meta: Record<string, unknown>
  }>
  return rows[0] ?? null
}

export async function deleteConnection(ownerId: string, provider: 'github' | 'vercel'): Promise<void> {
  const res = await rest(`/connections?owner_id=eq.${ownerId}&provider=eq.${provider}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw new Error(`Database error (${res.status})`)
}

export async function listConnections(
  ownerId: string,
): Promise<Array<{ provider: string; meta: Record<string, unknown> }>> {
  const res = await rest(
    `/connections?select=provider,meta&owner_id=eq.${ownerId}&order=provider`,
  )
  if (!res.ok) throw new Error(`Database error (${res.status})`)
  return (await res.json()) as Array<{ provider: string; meta: Record<string, unknown> }>
}

// ---------------------------------------------------------------------------
// OAuth state: HMAC-signed { uid, redirectTo } so the callback can attribute
// the token without storing server-side state.
// ---------------------------------------------------------------------------

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function base64Url(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function signOAuthState(
  payload: { uid: string; redirectTo: string },
): Promise<string> {
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await hmacKey(requireEnv('OAUTH_STATE_SECRET'))
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${base64Url(new Uint8Array(sig))}`
}

export async function verifyOAuthState(state: string): Promise<{ uid: string; redirectTo: string }> {
  const [body, sig] = state.split('.')
  if (!body || !sig) throw httpError(400, 'Invalid state')
  const key = await hmacKey(requireEnv('OAUTH_STATE_SECRET'))
  const ok = await crypto.subtle.verify('HMAC', key, b64UrlToBytes(sig), new TextEncoder().encode(body))
  if (!ok) throw httpError(400, 'Invalid state')
  const payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(body))) as {
    uid: string
    redirectTo: string
  }
  if (!payload.uid || !payload.redirectTo) throw httpError(400, 'Invalid state')
  return payload
}

/** Derive the public callback URL for a function from the incoming origin. */
export function callbackUrl(req: Request, functionName: string): string {
  const u = new URL(req.url)
  return `${u.protocol}//${u.host}/${functionName}`
}

export function slugRepoName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 100)
  return s || 'project'
}

export function slugProjectName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || 'project'
}