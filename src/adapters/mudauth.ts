// Mudbase end-user auth (local email+password provider).
// Docs: register, login -> JWT (24h) + refreshToken, GET /api/auth/local/session
// to validate. Project API keys stay server-side; only the user's own token
// lives here (localStorage).
const BASE = (import.meta.env.VITE_MUDBASE_URL as string | undefined)?.replace(/\/+$/, '') ?? 'https://api.mudbase.dev';
const PROJECT_ID = import.meta.env.VITE_MUDBASE_PROJECT_ID as string | undefined;

import { K, readKey, writeKey, removeKey } from '../lib/storage-keys';

export interface MudUser {
  id?: string;
  email: string;
  name?: string;
}

export function mudAuthConfigured(): boolean {
  return Boolean(PROJECT_ID);
}

async function call<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null;
  if (!res.ok) {
    const detail = data && Array.isArray((data as { details?: string[] }).details)
      ? `: ${(data as { details?: string[] }).details?.join(', ')}`
      : '';
    throw new Error(`${data?.error ?? `Request failed (${res.status})`}${detail}`);
  }
  return data as T;
}

function persistSession(s: { token: string; refreshToken?: string; expiresIn?: number; user?: MudUser }) {
  writeKey(K.mudToken, s.token);
  if (s.refreshToken) writeKey(K.mudRefresh, s.refreshToken);
  writeKey(K.mudExp, String(Date.now() + (s.expiresIn ?? 86400) * 1000));
  if (s.user) writeKey(K.mudUser, JSON.stringify(s.user));
}

/** Register a new end-user (verification email is sent automatically). */
export async function mudRegister(email: string, password: string, name?: string): Promise<void> {
  if (!PROJECT_ID) throw new Error('Mudbase is not configured (VITE_MUDBASE_PROJECT_ID).');
  const [firstName, ...rest] = (name ?? '').trim().split(/\s+/);
  await call<unknown>('/api/auth/local/register', {
    projectId: PROJECT_ID,
    email: email.trim(),
    password,
    ...(firstName ? { firstName, lastName: rest.join(' ') || undefined } : {}),
  });
}

/** Sign in. Returns the user; tokens are persisted for later calls. */
export async function mudLogin(email: string, password: string): Promise<MudUser> {
  if (!PROJECT_ID) throw new Error('Mudbase is not configured (VITE_MUDBASE_PROJECT_ID).');
  const data = await call<{ token: string; refreshToken?: string; expiresIn?: number; user?: MudUser }>(
    '/api/auth/local/login',
    { projectId: PROJECT_ID, email: email.trim(), password },
  );
  if (!data?.token) throw new Error('Sign-in did not return a session.');
  const user: MudUser = data.user ?? { email: email.trim() };
  persistSession({ token: data.token, refreshToken: data.refreshToken, expiresIn: data.expiresIn, user });
  return user;
}

/** Current token, refreshing once when expired (docs: refresh on 401). */
export async function mudToken(): Promise<string | null> {
  const token = readKey(K.mudToken);
  if (!token) return null;
  const exp = Number(readKey(K.mudExp) ?? '0');
  if (Date.now() < exp - 60_000) return token;
  const refreshToken = readKey(K.mudRefresh);
  if (!refreshToken) {
    mudLogout();
    return null;
  }
  try {
    const data = await call<{ token: string; refreshToken?: string; expiresIn?: number }>('/api/auth/refresh', {
      refreshToken,
    });
    if (!data?.token) throw new Error('Refresh failed.');
    persistSession({ token: data.token, refreshToken: data.refreshToken ?? refreshToken, expiresIn: data.expiresIn });
    return data.token;
  } catch {
    mudLogout();
    return null;
  }
}

export function mudUser(): MudUser | null {
  const raw = readKey(K.mudUser);
  return raw ? (JSON.parse(raw) as MudUser) : null;
}

/** Validate the stored session against the server (null = signed out). */
export async function mudSession(): Promise<MudUser | null> {
  const token = await mudToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/api/auth/local/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    mudLogout();
    return null;
  }
  const data = (await res.json().catch(() => null)) as { user?: MudUser } | MudUser | null;
  const user = (data as { user?: MudUser })?.user ?? (data as MudUser | null);
  if (user && (user as MudUser).email) {
    writeKey(K.mudUser, JSON.stringify(user));
    return user as MudUser;
  }
  return mudUser();
}

export function mudLogout(): void {
  removeKey(K.mudToken);
  removeKey(K.mudRefresh);
  removeKey(K.mudExp);
  removeKey(K.mudUser);
}

/** Re-send the verification email (no auth). For users stuck at sign-in
 *  with an unverified address. */
export async function mudResendVerification(email: string): Promise<string> {
  if (!PROJECT_ID) throw new Error('Mudbase is not configured (VITE_MUDBASE_PROJECT_ID).');
  await call<unknown>('/api/auth/resend-verification', { projectId: PROJECT_ID, email: email.trim() });
  return 'Verification email sent — check your inbox, then sign in.';
}

/** Send a password-reset email for this project + email. */
export async function mudResetPassword(email: string): Promise<string> {
  if (!PROJECT_ID) throw new Error('Mudbase is not configured (VITE_MUDBASE_PROJECT_ID).');
  await call<unknown>('/api/auth/local/password-reset', { projectId: PROJECT_ID, email: email.trim() });
  return 'Check your email for the reset link.';
}

/** Send a passwordless magic link (lands back on this app with a session). */
export async function mudMagicLink(email: string): Promise<string> {
  if (!PROJECT_ID) throw new Error('Mudbase is not configured (VITE_MUDBASE_PROJECT_ID).');
  await call<unknown>('/api/auth/magic-link/send', {
    email: email.trim(),
    projectId: PROJECT_ID,
    redirectUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
  });
  return 'Check your email for the sign-in link.';
}

/**
 * OAuth providers enabled for this project (for the button row).
 * Returns null when the list can't be determined (show both buttons).
 */
export async function mudOAuthProviders(): Promise<string[] | null> {
  if (!PROJECT_ID) return [];
  try {
    const res = await fetch(
      `${BASE}/api/auth/oauth/projects/${encodeURIComponent(PROJECT_ID)}/providers`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { providers?: Array<string | { name?: string; provider?: string }> } | Array<string> | null;
    const list = Array.isArray(data) ? data : data?.providers ?? [];
    return list
      .map((p) => (typeof p === 'string' ? p : p.provider ?? p.name ?? ''))
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** Start a project-scoped OAuth flow (top-level navigation, per the docs). */
export function mudOAuthStart(provider: string): void {
  if (!PROJECT_ID) throw new Error('Mudbase is not configured (VITE_MUDBASE_PROJECT_ID).');
  const redirect = typeof window !== 'undefined' ? window.location.origin : '';
  window.location.href = `${BASE}/api/auth/oauth/${encodeURIComponent(provider)}/${encodeURIComponent(PROJECT_ID)}?redirectUrl=${encodeURIComponent(redirect)}`;
}

/** Persist a session handed back via redirect (?token=&refreshToken=[&expiresIn=]). */
export function persistMudCallback(params: { token: string; refreshToken?: string; expiresIn?: string | number }): void {
  persistSession({
    token: params.token,
    refreshToken: params.refreshToken,
    expiresIn: params.expiresIn ? Number(params.expiresIn) : 86400,
  });
}

/** Read a Mudbase auth callback out of the current URL, if present. */
export function readMudCallback(): { token: string; refreshToken?: string; expiresIn?: string } | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const token = q.get('token');
    if (!token) return null;
    return {
      token,
      refreshToken: q.get('refreshToken') ?? undefined,
      expiresIn: q.get('expiresIn') ?? undefined,
    };
  } catch {
    return null;
  }
}

export function clearMudCallbackFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('refreshToken');
    url.searchParams.delete('expiresIn');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}
