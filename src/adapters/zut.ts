// zut backend adapter: broker HTTP API + Supabase auth + local draft.
// Framework-agnostic (no React). Service keys never enter the browser —
// only the signed-in user's token is sent, per request.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FileMap } from './filemap';

export interface StoredProject {
  id: string;
  name: string;
  files: FileMap;
  share_token: string | null;
  updated_at: string | null;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  truncated?: boolean;
}

export interface AgentTurnResult {
  reply: string;
  updated: Record<string, string>;
  created: Record<string, string>;
  deleted: string[];
}

const brokerUrl = (import.meta.env.VITE_BROKER_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const cloudUrl = (import.meta.env.VITE_CLOUD_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function brokerEnabled(): boolean {
  return Boolean(brokerUrl);
}

export function cloudEnabled(): boolean {
  return Boolean(cloudUrl);
}

export function authConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

let supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!supabase) supabase = createClient(supabaseUrl, supabaseAnonKey);
  return supabase;
}

export async function getUserToken(): Promise<string | null> {
  // Mudbase user token first (verified server-side via /api/auth/session),
  // then the Supabase session. Either way only the user's own token leaves
  // the browser — service keys never do.
  try {
    const { mudToken } = await import('./mudauth');
    const t = await mudToken();
    if (t) return t;
  } catch {
    /* fall through to Supabase */
  }
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function authed(path: string, init?: RequestInit): Promise<Response> {
  const token = await getUserToken();
  if (!token) throw new Error('Sign in required.');
  return fetch(`${brokerUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

async function asJson<T>(res: Response): Promise<T> {
  if (res.status === 402) throw new Error('Run time used up for today — try again tomorrow or ask for a higher quota.');
  if (res.status === 401 || res.status === 403) throw new Error('Sign in required.');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

// ---- projects (broker BaaS; ownership enforced server-side) ----
export async function listProjects(): Promise<StoredProject[]> {
  return asJson<StoredProject[]>(await authed('/api/baas/projects'));
}

export async function getProject(id: string): Promise<StoredProject> {
  return asJson<StoredProject>(await authed(`/api/baas/projects/${encodeURIComponent(id)}`));
}

export async function createProject(name: string, files: FileMap): Promise<string> {
  const r = await asJson<{ id: string }>(
    await authed('/api/baas/projects', { method: 'POST', body: JSON.stringify({ name, files }) }),
  );
  return r.id;
}

export async function updateProject(id: string, name: string, files: FileMap): Promise<void> {
  await asJson<unknown>(
    await authed(`/api/baas/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, files }),
    }),
  );
}

export async function setProjectShared(id: string, shared: boolean): Promise<string | null> {
  const r = await asJson<{ token: string | null }>(
    await authed('/api/baas/share', { method: 'POST', body: JSON.stringify({ id, shared }) }),
  );
  return r.token ?? null;
}

export function buildShareLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/p/${token}`;
}

export async function getSharedProject(token: string): Promise<{ name: string; files: FileMap }> {
  const res = await fetch(`${brokerUrl}/api/baas/shared/${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error('Shared project not found.');
  return (await res.json()) as { name: string; files: FileMap };
}

// ---- run (broker executes in a Cell; same contract as the IDE) ----
export async function runEntry(files: FileMap, entry: string, stdin = ''): Promise<RunResult> {
  if (!brokerUrl) throw new Error('Run backend is not configured (VITE_BROKER_URL).');
  const res = await authed('/api/broker/run', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: 'default', files, entry, stdin }),
  });
  return asJson<RunResult>(res);
}

export async function brokerPreview(workspaceId = 'default'): Promise<{ url: string | null; access: string }> {
  if (!brokerUrl) return { url: null, access: 'private-token' };
  const token = await getUserToken();
  if (!token) return { url: null, access: 'private-token' };
  try {
    const res = await fetch(`${brokerUrl}/api/broker/preview?workspaceId=${encodeURIComponent(workspaceId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { url: null, access: 'private-token' };
    const body = (await res.json()) as { url?: string | null; access?: string };
    return { url: body.url ?? null, access: body.access ?? 'private-token' };
  } catch {
    return { url: null, access: 'private-token' };
  }
}

export async function terminalToken(workspaceId = 'default'): Promise<{ token: string; expiresInSec: number }> {
  const res = await authed('/api/broker/terminal-token', {
    method: 'POST',
    body: JSON.stringify({ workspaceId }),
  });
  return asJson<{ token: string; expiresInSec: number }>(res);
}

// ---- cloud agent turn (opencode on the server; diffs applied by caller) ----
export async function cloudAgentTurn(
  files: FileMap,
  prompt: string,
  opts?: { projectId?: string | null; model?: string },
): Promise<AgentTurnResult> {
  if (!cloudUrl) throw new Error('Cloud agent is not configured (VITE_CLOUD_URL).');
  const token = await getUserToken();
  if (!token) throw new Error('Sign in required.');
  const res = await fetch(`${cloudUrl}/agent/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ files, prompt, projectId: opts?.projectId ?? 'default', model: opts?.model }),
  });
  return asJson<AgentTurnResult>(res);
}

// ---- local draft (offline editing; syncs to broker on save) ----
const DRAFT_KEY = 'gpide:draft';

export function loadDraft(): { name: string; files: FileMap } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as { name: string; files: FileMap }) : null;
  } catch {
    return null;
  }
}

export function saveDraft(name: string, files: FileMap): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, files }));
  } catch {
    /* storage unavailable */
  }
}

// ---- snapshots for rollback (local; broker persists runs server-side) ----
export interface Snapshot {
  id: string;
  createdAt: number;
  files: FileMap;
}

const SNAPS_KEY = 'gpide:snapshots';

export function listSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(SNAPS_KEY);
    const arr = raw ? (JSON.parse(raw) as Snapshot[]) : [];
    return Array.isArray(arr) ? arr.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function takeSnapshot(files: FileMap): Snapshot {
  const snap: Snapshot = { id: `cp-${Date.now().toString(36)}`, createdAt: Date.now(), files: { ...files } };
  try {
    localStorage.setItem(SNAPS_KEY, JSON.stringify([snap, ...listSnapshots()].slice(0, 20)));
  } catch {
    /* ignore */
  }
  return snap;
}

// ---- agent usage meter (this device; server enforces) ----
const USAGE_KEY = 'gpide:agent-use';

export function agentUseThisMonth(): number {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return 0;
    const { month, count } = JSON.parse(raw) as { month: string; count: number };
    return month === new Date().toISOString().slice(0, 7) ? count : 0;
  } catch {
    return 0;
  }
}

export function bumpAgentUse(): number {
  const month = new Date().toISOString().slice(0, 7);
  const count = agentUseThisMonth() + 1;
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ month, count }));
  } catch {
    /* ignore */
  }
  return count;
}

export const AGENT_MONTHLY_CAP = 50;

// ---- project rules (prepended to agent prompts; real effect) ----
const RULES_KEY = 'gpide:rules';

export function loadRules(): string {
  try {
    return localStorage.getItem(RULES_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveRules(rules: string): void {
  try {
    localStorage.setItem(RULES_KEY, rules);
  } catch {
    /* ignore */
  }
}

// ---- one-click static deploy (no account; visitor sites via public API) ----
export async function deployStatic(files: FileMap): Promise<{ url: string }> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const res = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: blob,
  });
  if (!res.ok) throw new Error(`Deploy failed (${res.status})`);
  const data = (await res.json()) as { ssl_url?: string; url?: string };
  if (!data.ssl_url && !data.url) throw new Error('Deploy did not return a URL.');
  return { url: data.ssl_url ?? data.url ?? '' };
}
