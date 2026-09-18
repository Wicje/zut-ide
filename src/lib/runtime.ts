// Client for the optional remote zut-runtime service (runtime/server.mjs).
//
// When VITE_RUNTIME_URL is set, heavy work is offloaded to a server so
// low-end devices (phones, <2GB Chromebooks) never compile or execute locally:
//   POST /build -> web bundle (esbuild)
//   POST /run   -> program output (python3 / go run), capped + sandboxed
// Vue single-file components still need the in-browser compiler, and any
// network failure falls back to the local runner (see App.tsx).
// AI is never required: plain code + Run works with no key.

import type { FileMap, ProgramResult } from '../types'

const baseUrl = (
  (import.meta.env.VITE_RUNTIME_URL as string | undefined) ||
  (import.meta.env.VITE_CLOUD_URL as string | undefined)
)?.replace(/\/+$/, '')
const token = import.meta.env.VITE_RUNTIME_TOKEN as string | undefined

export interface RemoteBundle {
  js: string
  css: string
  referenced: string[]
}

export function runtimeUrl(): string | null {
  return baseUrl || null
}

export function runtimeEnabled(): boolean {
  return Boolean(baseUrl)
}

/** Vue SFCs need the browser-side compiler, so keep those on the local runner. */
export function canUseRemote(files: FileMap): boolean {
  if (!baseUrl) return false
  return !Object.keys(files).some((f) => f.endsWith('.vue'))
}

/**
 * Bundle a project on the remote runtime.
 * - On a compile error it throws `BUILD_FAILED:<json>` (same contract as the
 *   local runner, so `formatBuildErrors` handles both).
 * - On a network/config failure it throws `REMOTE_UNREACHABLE:<message>` so the
 *   caller can fall back to the in-browser runner.
 */
export async function bundleProjectRemote(files: FileMap): Promise<RemoteBundle> {
  if (!baseUrl) throw new Error('REMOTE_UNREACHABLE:Remote runtime is not configured.')

  let res: Response
  try {
    res = await fetch(`${baseUrl}/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ files }),
    })
  } catch (e) {
    throw new Error(`REMOTE_UNREACHABLE:${(e as Error).message}`)
  }

  const text = await res.text()
  let json: {
    js?: string
    css?: string
    referenced?: string[]
    errors?: unknown[]
    error?: string
  } | null = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-json response */
  }

  if (!res.ok) {
    throw new Error(`REMOTE_UNREACHABLE:${json?.error ?? `Runtime request failed (${res.status})`}`)
  }

  if (Array.isArray(json?.errors) && json.errors.length) {
    throw new Error('BUILD_FAILED:' + JSON.stringify({ errors: json.errors }))
  }

  return { js: json?.js ?? '', css: json?.css ?? '', referenced: json?.referenced ?? [] }
}

/**
 * Execute a non-web program (Python / Go) on the remote runtime.
 * - Throws `REMOTE_UNREACHABLE:<message>` when no runtime is configured or
 *   the network fails, so the caller can show the "needs runtime" hint.
 * - Throws `RUN_FAILED:<message>` when the server ran the code and it failed
 *   (missing entry, timeout, non-zero exit is returned normally, not thrown).
 */
export async function runProgramRemote(
  files: FileMap,
  entry: string,
  stdin = '',
): Promise<ProgramResult> {
  if (!baseUrl) throw new Error('REMOTE_UNREACHABLE:Remote runtime is not configured (VITE_RUNTIME_URL).')
  let res: Response
  try {
    res = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ files, entry, stdin }),
    })
  } catch (e) {
    throw new Error(`REMOTE_UNREACHABLE:${(e as Error).message}`)
  }
  const text = await res.text()
  let json: {
    stdout?: string
    stderr?: string
    exitCode?: number | null
    durationMs?: number
    truncated?: boolean
    error?: string
  } | null = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = json?.error ?? `Runtime request failed (${res.status})`
    const prefix = res.status === 400 || res.status === 422 ? 'RUN_FAILED:' : 'REMOTE_UNREACHABLE:'
    throw new Error(`${prefix}${msg}`)
  }
  return {
    stdout: json?.stdout ?? '',
    stderr: json?.stderr ?? '',
    exitCode: json?.exitCode ?? null,
    durationMs: json?.durationMs ?? 0,
    truncated: json?.truncated,
  }
}
