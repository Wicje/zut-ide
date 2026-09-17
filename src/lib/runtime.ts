// Client for the optional remote zut-runtime service (runtime/server.mjs).
//
// When VITE_RUNTIME_URL is set, project bundling is offloaded to a server so
// low-end devices never run the WASM compiler in the browser. Vue single-file
// components still need the in-browser compiler, and any network failure falls
// back to the local runner (see App.tsx).

import type { FileMap } from '../types'

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
