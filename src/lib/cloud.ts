// Client for zut-cloud (single VPS backend for builds + agent).
// Browser stays dumb: FileMap is source of truth, server does the heavy work.

import { getSupabase, isSupabaseConfigured } from './supabase'
import type { FileMap } from '../types'

const baseUrl = (import.meta.env.VITE_CLOUD_URL as string | undefined)?.replace(/\/+$/, '')

export function cloudUrl(): string | null {
  return baseUrl || null
}

export function cloudEnabled(): boolean {
  return Boolean(baseUrl)
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) throw new Error('Sign in to use the cloud agent.')
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to use the cloud agent.')
  return { Authorization: `Bearer ${token}` }
}

function llmKeyHeaders(): Record<string, string> {
  try {
    const k = localStorage.getItem('zut:ai:key:openrouter')
    return k ? { 'X-LLM-Key': k } : {}
  } catch {
    return {}
  }
}

export interface CloudAgentResult {
  reply: string
  updated: Record<string, string>
  created: Record<string, string>
  deleted: string[]
}

/** One agent turn on the server: sends files + prompt, gets reply + file diff. */
export async function cloudAgentTurn(
  files: FileMap,
  prompt: string,
  opts?: { projectId?: string | null; model?: string },
): Promise<CloudAgentResult> {
  if (!baseUrl) throw new Error('Cloud is not configured (VITE_CLOUD_URL).')
  const res = await fetch(`${baseUrl}/agent/turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...llmKeyHeaders(),
    },
    body: JSON.stringify({
      files,
      prompt,
      projectId: opts?.projectId ?? 'default',
      model: opts?.model ?? 'openrouter/google/gemini-2.5-flash',
    }),
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
  if (!res.ok) throw new Error(json?.error ?? `Cloud agent failed (${res.status})`)
  return {
    reply: json?.reply ?? '',
    updated: json?.updated ?? {},
    created: json?.created ?? {},
    deleted: json?.deleted ?? [],
  }
}

export async function cloudHealth(): Promise<boolean> {
  if (!baseUrl) return false
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}
