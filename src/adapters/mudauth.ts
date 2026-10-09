// Mudbase end-user auth (local email+password provider).
// Docs: /docs/guides/user-authentication — register, login -> JWT (24h) +
// refreshToken, GET /api/auth/session to validate. Project API keys stay
// server-side; only the user's own token lives here (localStorage).
const BASE = (import.meta.env.VITE_MUDBASE_URL as string | undefined)?.replace(/\/+$/, '') ?? 'https://api.mudbase.dev';
const PROJECT_ID = import.meta.env.VITE_MUDBASE_PROJECT_ID as string | undefined;

const TOKEN_KEY = 'gpide:mud:token';
const REFRESH_KEY = 'gpide:mud:refresh';
const EXP_KEY = 'gpide:mud:exp';
const USER_KEY = 'gpide:mud:user';

export interface MudUser {
  id?: string;
  email: string;
  name?: string;
}

export function mudAuthConfigured(): boolean {
  return Boolean(PROJECT_ID);
}

function store() {
  const mem = new Map<string, string>();
  try {
    if (typeof localStorage !== 'undefined') {
      return {
        get: (k: string) => localStorage.getItem(k),
        set: (k: string, v: string) => localStorage.setItem(k, v),
        del: (k: string) => localStorage.removeItem(k),
      };
    }
  } catch {
    /* fall through */
  }
  return {
    get: (k: string) => mem.get(k) ?? null,
    set: (k: string, v: string) => {
      mem.set(k, v);
    },
    del: (k: string) => {
      mem.delete(k);
    },
  };
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
  const st = store();
  st.set(TOKEN_KEY, s.token);
  if (s.refreshToken) st.set(REFRESH_KEY, s.refreshToken);
  st.set(EXP_KEY, String(Date.now() + (s.expiresIn ?? 86400) * 1000));
  if (s.user) st.set(USER_KEY, JSON.stringify(s.user));
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
  const data = await call<{ token: string; refreshToken?: string; expiresIn?: number; user?: MudUser }>(
    '/api/auth/local/login',
    { email: email.trim(), password },
  );
  if (!data?.token) throw new Error('Sign-in did not return a session.');
  const user: MudUser = data.user ?? { email: email.trim() };
  persistSession({ token: data.token, refreshToken: data.refreshToken, expiresIn: data.expiresIn, user });
  return user;
}

/** Current token, refreshing once when expired (docs: refresh on 401). */
export async function mudToken(): Promise<string | null> {
  const st = store();
  const token = st.get(TOKEN_KEY);
  if (!token) return null;
  const exp = Number(st.get(EXP_KEY) ?? '0');
  if (Date.now() < exp - 60_000) return token;
  const refreshToken = st.get(REFRESH_KEY);
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
  try {
    const raw = store().get(USER_KEY);
    return raw ? (JSON.parse(raw) as MudUser) : null;
  } catch {
    return null;
  }
}

/** Validate the stored session against the server (null = signed out). */
export async function mudSession(): Promise<MudUser | null> {
  const token = await mudToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    mudLogout();
    return null;
  }
  const data = (await res.json().catch(() => null)) as { user?: MudUser } | MudUser | null;
  const user = (data as { user?: MudUser })?.user ?? (data as MudUser | null);
  if (user && (user as MudUser).email) {
    try {
      store().set(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    return user as MudUser;
  }
  return mudUser();
}

export function mudLogout(): void {
  const st = store();
  st.del(TOKEN_KEY);
  st.del(REFRESH_KEY);
  st.del(EXP_KEY);
  st.del(USER_KEY);
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
