// Thin run-broker client (browser side).
// The broker holds the Cells API key + Mudbase project key. The browser NEVER
// sees those keys — it sends only the signed-in user's Mudbase token and a
// workspace id. Every route re-checks ownership server-side.
//
// Routes (broker implements all five):
//   POST /api/broker/open           { workspaceId } -> { state, stage }
//   POST /api/broker/run            { workspaceId, command, files?, stdin? } -> { stdout, stderr, exitCode }
//   POST /api/broker/stop           { workspaceId } -> { ok }
//   POST /api/broker/terminal-token { workspaceId } -> { token, expiresInSec: 60 }
//   GET  /api/broker/preview?workspaceId=... -> { url, access: 'private-token' | 'public' }

import type { ProgramResult } from '../types'

const brokerUrl = (
  (import.meta.env.VITE_RUNTIME_URL as string | undefined) ||
  (import.meta.env.VITE_CLOUD_URL as string | undefined)
)?.replace(/\/+$/, '')

export function brokerEnabled(): boolean {
  return Boolean(brokerUrl)
}

export function brokerBaseUrl(): string | null {
  return brokerUrl || null
}

function userHeaders(userToken: string): Record<string, string> {
  // Never send Cells/Mudbase service keys from the browser.
  // Only the user's own token; broker verifies + checks ownership.
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`,
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { error: text.slice(0, 500) }
  }
}

function toUserError(status: number, body: unknown): Error {
  const msg = (body as { error?: string } | null)?.error ?? `Broker request failed (${status})`
  // Surface quota as plain words, never raw 402 / Small-hours internals.
  if (status === 402 || /quota|allowance|small-hours/i.test(msg)) {
    return new Error('QUOTA_EXHAUSTED:Run time used up for today — try again tomorrow or ask for a higher quota.')
  }
  if (status === 401 || status === 403) return new Error(`FORBIDDEN:${msg}`)
  if (status === 429) return new Error(`RATE_LIMITED:${msg}`)
  return new Error(msg)
}

export async function brokerRun(
  workspaceId: string,
  userToken: string,
  payload: { files: Record<string, string>; entry: string; stdin?: string },
  signal?: AbortSignal,
): Promise<ProgramResult> {
  if (!brokerUrl) throw new Error('REMOTE_UNREACHABLE:Remote runner is not configured.')
  if (!userToken) throw new Error('FORBIDDEN:Sign in to run.')
  let res: Response
  try {
    res = await fetch(`${brokerUrl}/api/broker/run`, {
      method: 'POST',
      headers: userHeaders(userToken),
      body: JSON.stringify({ workspaceId, ...payload }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('CANCELLED:Run cancelled.')
    throw new Error(`REMOTE_UNREACHABLE:${(e as Error).message}`)
  }
  const body = await parseJson(res)
  if (!res.ok) throw toUserError(res.status, body)
  const j = body as Partial<ProgramResult>
  return {
    stdout: j.stdout ?? '',
    stderr: j.stderr ?? '',
    exitCode: j.exitCode ?? null,
    durationMs: j.durationMs ?? 0,
    truncated: j.truncated,
  }
}

export async function brokerTerminalToken(workspaceId: string, userToken: string): Promise<{ token: string; expiresInSec: number }> {
  if (!brokerUrl) throw new Error('REMOTE_UNREACHABLE:Remote runner is not configured.')
  const res = await fetch(`${brokerUrl}/api/broker/terminal-token`, {
    method: 'POST',
    headers: userHeaders(userToken),
    body: JSON.stringify({ workspaceId }),
  })
  const body = await parseJson(res)
  if (!res.ok) throw toUserError(res.status, body)
  return body as { token: string; expiresInSec: number }
}

export async function brokerPreview(workspaceId: string, userToken: string): Promise<{ url: string; access: 'private-token' | 'public' }> {
  if (!brokerUrl) throw new Error('REMOTE_UNREACHABLE:Remote runner is not configured.')
  const res = await fetch(`${brokerUrl}/api/broker/preview?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: userHeaders(userToken),
  })
  const body = await parseJson(res)
  if (!res.ok) throw toUserError(res.status, body)
  return body as { url: string; access: 'private-token' | 'public' }
}
