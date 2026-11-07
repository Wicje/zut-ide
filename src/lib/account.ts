// Accounts: create one, sign in to it, and remember how the agent runs.
//
// Two providers, one interface:
//   - Supabase  (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) — email+password
//   - Mudbase   (VITE_MUDBASE_PROJECT_ID) — email+password, verification email
//
// The agent has two homes, and the user picks one when they sign up:
//   - 'self'   — the agent runs on your own machine (opencode / zut host).
//                Free, your keys, your quota. Available now.
//   - 'hosted' — the agent runs on our server. Coming online with the VPS.
//
// The choice is a local flag, not a lock: nothing here stops you from
// running both. It only tells the UI which one to offer first.

import { getSupabase, authConfigured } from '../adapters/zut';
import { mudAuthConfigured, mudLogin, mudRegister, mudSession } from '../adapters/mudauth';
import { K, readKey, writeKey, removeKey } from './storage-keys';

export type AgentMode = 'self' | 'hosted';

export const AGENT_MODE_KEY = K.agentMode;

export type AccountProvider = 'supabase' | 'mudbase' | null;

const SUPABASE_ENV_SET = Boolean(import.meta.env.VITE_SUPABASE_URL as string | undefined);

/**
 * Which backend can create accounts on this deployment:
 *   - an explicit VITE_SUPABASE_URL makes Supabase the provider;
 *   - otherwise a configured Mudbase project does;
 *   - otherwise the default Zut Supabase project (the landing page talks to
 *     the same project, so the session the landing stores works here too).
 */
export function accountProvider(): AccountProvider {
  if (SUPABASE_ENV_SET) return 'supabase';
  if (mudAuthConfigured()) return 'mudbase';
  // The hardcoded Supabase fallback is the public project's credentials.
  // It is fine on a deployed build (the public signup door), but on localhost
  // it would let `npm run dev` signups land in the shared project with real
  // confirmation emails — gate it so dev stays env-only.
  if (authConfigured() && !isLocalhost()) return 'supabase';
  return null;
}

export function accountsConfigured(): boolean {
  return accountProvider() !== null;
}

/** Is this browser on localhost / 127.0.0.1 / [::1]? Browser-only. */
export function isLocalhost(): boolean {
  try {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/** ---- The agent's home -------------------------------------------------- */

export function getAgentMode(): AgentMode | null {
  const raw = readKey(K.agentMode);
  return raw === 'self' || raw === 'hosted' ? raw : null;
}

export function setAgentMode(mode: AgentMode): void {
  writeKey(K.agentMode, mode);
}

export function clearAgentMode(): void {
  removeKey(K.agentMode);
}

/**
 * Is our hosted agent reachable? It runs on our VPS, which is not up yet, so
 * this is false until the server exists (and VITE_OPENCODE_URL points at it).
 */
export function hostedAgentAvailable(): boolean {
  const url = import.meta.env.VITE_OPENCODE_URL as string | undefined;
  return Boolean(url && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url));
}

/** ---- Accounts ---------------------------------------------------------- */

export interface AccountResult {
  /** True when the user is signed in right now. */
  signedIn: boolean;
  /** True when the provider sent a verification email and the user must confirm. */
  needsVerification: boolean;
}

export interface AccountUser {
  name: string;
  email: string;
}

/** Create an account. Throws with a human-readable message on failure. */
export async function createAccount(
  email: string,
  password: string,
  name?: string,
): Promise<AccountResult> {
  const address = email.trim().toLowerCase();
  if (!address) throw new Error('Enter your email address.');
  if (password.length < 8) throw new Error('Passwords need at least 8 characters.');

  if (accountProvider() === 'mudbase') {
    await mudRegister(address, password, name?.trim() || undefined);
    return { signedIn: false, needsVerification: true };
  }

  const sb = getSupabase();
  if (!sb) throw new Error('Accounts are not configured on this deployment.');
  const { data, error } = await sb.auth.signUp({
    email: address,
    password,
    options: { data: { name: name?.trim() || address.split('@')[0] } },
  });
  if (error) throw new Error(error.message);
  // Supabase signs you in immediately unless the project requires email
  // confirmation — then the session is empty and a mail is on its way.
  return {
    signedIn: Boolean(data.session),
    needsVerification: !data.session && Boolean(data.user),
  };
}

/** Sign in with the password the account was created with. */
export async function signInWithPassword(email: string, password: string): Promise<AccountUser> {
  const address = email.trim().toLowerCase();
  if (!address || !password) throw new Error('Enter your email address and password.');

  if (accountProvider() === 'mudbase') {
    const u = await mudLogin(address, password);
    return { name: u.name?.trim() || address.split('@')[0], email: u.email };
  }

  const sb = getSupabase();
  if (!sb) throw new Error('Accounts are not configured on this deployment.');
  const { data, error } = await sb.auth.signInWithPassword({ email: address, password });
  if (error) throw new Error(error.message);
  const u = data.user;
  return {
    name: (u.user_metadata?.name as string | undefined) ?? address.split('@')[0],
    email: u.email ?? address,
  };
}

/** The signed-in account, or null. Checks Mudbase first, then Supabase. */
export async function currentAccount(): Promise<AccountUser | null> {
  try {
    const mud = await mudSession();
    if (mud?.email) return { name: mud.name?.trim() || mud.email.split('@')[0], email: mud.email };
  } catch {
    /* fall through to Supabase */
  }
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u?.email) return null;
    return {
      name: (u.user_metadata?.name as string | undefined) ?? u.email.split('@')[0],
      email: u.email,
    };
  } catch {
    return null;
  }
}

/**
 * Local development (and the `?nowait` escape hatch) skips the account
 * gate. Nothing else does: an account is how the product works now.
 */
export function accessBypassed(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    const q = new URLSearchParams(window.location.search);
    return q.has('nowait') || q.has('skip_waitlist') || q.has('local');
  } catch {
    return false;
  }
}
