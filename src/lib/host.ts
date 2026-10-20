// Connection to a `zut host` process: workspace sync, git, and the real
// terminal. The token is a shared host secret (not a user identity): keep it
// in localStorage on self-hosted instances, or inject it at build time.
const KEY = 'zut:host:v1';

export interface HostConfig {
  url: string;
  token: string;
}

export interface HostHealth {
  ok: boolean;
  service: string;
  version: string;
  mode: 'selfhost' | 'hosted';
  /** Present only when the request was authenticated. */
  workspace?: string;
  terminal: boolean;
  git: boolean;
  repo: boolean;
  jail: boolean;
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^wss?:\/\//i.test(trimmed)) return trimmed.replace(/^ws/i, 'http');
  return `http://${trimmed}`;
}

export function getHostConfig(): HostConfig | null {
  const envUrl = (import.meta.env.VITE_ZUT_HOST_URL as string | undefined) ?? '';
  const envToken = (import.meta.env.VITE_ZUT_HOST_TOKEN as string | undefined) ?? '';
  if (envUrl.trim()) return { url: normalizeUrl(envUrl), token: envToken.trim() };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HostConfig>;
    if (!parsed.url) return null;
    return { url: normalizeUrl(String(parsed.url)), token: String(parsed.token ?? '') };
  } catch {
    return null;
  }
}

export function setHostConfig(config: HostConfig | null): void {
  try {
    if (!config || !config.url.trim()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ url: normalizeUrl(config.url), token: config.token.trim() }));
  } catch {
    /* private mode */
  }
}

export function isEnvHost(): boolean {
  return Boolean((import.meta.env.VITE_ZUT_HOST_URL as string | undefined)?.trim());
}

export function wsUrl(config: HostConfig): string {
  const base = normalizeUrl(config.url).replace(/^http/i, 'ws');
  const token = config.token ? `?token=${encodeURIComponent(config.token)}` : '';
  return `${base}/terminal${token}`;
}

export class HostError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function hostFetch<T>(config: HostConfig, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (config.token) headers.set('Authorization', `Bearer ${config.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, { ...init, headers });
  } catch {
    throw new HostError(`Can't reach ${config.url}. Is \`npm run host\` running?`, 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Host request failed (${res.status}).`;
    throw new HostError(message, res.status);
  }
  return body as T;
}

export async function hostHealth(config: HostConfig): Promise<HostHealth> {
  return hostFetch<HostHealth>(config, '/health');
}

export interface HostWorkspace {
  files: Record<string, string>;
  skipped: string[];
  bytes: number;
  stamp: string;
}

export async function pullHostWorkspace(config: HostConfig): Promise<HostWorkspace> {
  return hostFetch<HostWorkspace>(config, '/api/workspace');
}

export async function hostWorkspaceStamp(config: HostConfig): Promise<string> {
  const body = await hostFetch<{ stamp?: string }>(config, '/api/workspace/stamp');
  return body.stamp ?? '';
}

export async function pushHostWorkspace(
  config: HostConfig,
  files: Record<string, string>,
  deletes: string[] = [],
): Promise<{ written: number; removed: number; stamp: string }> {
  return hostFetch(config, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ files, deletes }),
  });
}

// ---- git ----
export interface HostGitFile {
  path: string;
  index: string;
  worktree: string;
  untracked: boolean;
}

export interface HostGitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: HostGitFile[];
}

export interface HostGitCommit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  message: string;
}

interface GitReply<T> {
  ok: boolean;
  error?: string;
  status?: T;
  diff?: string;
  commits?: HostGitCommit[];
  branches?: Array<{ name: string; current: boolean }>;
  sha?: string | null;
  summary?: string;
  branch?: string;
}

async function gitCall(config: HostConfig, path: string, init?: RequestInit): Promise<GitReply<unknown>> {
  const reply = await hostFetch<GitReply<unknown>>(config, `/api/git/${path}`, init);
  if (!reply.ok) throw new HostError(reply.error ?? 'git failed.', 200);
  return reply;
}

export async function hostGitStatus(config: HostConfig): Promise<HostGitStatus> {
  const r = await gitCall(config, 'status');
  return (
    (r.status as HostGitStatus | undefined) ?? {
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
    }
  );
}

export async function hostGitDiff(config: HostConfig, path?: string, staged = false): Promise<string> {
  const q = new URLSearchParams();
  if (path) q.set('path', path);
  if (staged) q.set('staged', '1');
  const r = await gitCall(config, `diff${q.toString() ? `?${q}` : ''}`);
  return r.diff ?? '';
}

export async function hostGitLog(config: HostConfig, limit = 20): Promise<HostGitCommit[]> {
  const r = await gitCall(config, `log?limit=${limit}`);
  return r.commits ?? [];
}

export async function hostGitBranches(
  config: HostConfig,
): Promise<Array<{ name: string; current: boolean }>> {
  const r = await gitCall(config, 'branches');
  return r.branches ?? [];
}

export async function hostGitInit(config: HostConfig): Promise<void> {
  await gitCall(config, 'init', { method: 'POST', body: '{}' });
}

export async function hostGitCommit(
  config: HostConfig,
  message: string,
): Promise<{ sha: string | null; summary: string }> {
  const r = await gitCall(config, 'commit', { method: 'POST', body: JSON.stringify({ message }) });
  return { sha: r.sha ?? null, summary: r.summary ?? '' };
}

export async function hostGitCheckout(
  config: HostConfig,
  name: string,
  create = false,
): Promise<void> {
  await gitCall(config, 'checkout', { method: 'POST', body: JSON.stringify({ name, create }) });
}
