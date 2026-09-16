// Client for the zut hosting backend (Supabase Edge Functions).
// Handles OAuth connect flow, GitHub push, Vercel deploy and Claude chat.

import { getSupabase, isSupabaseConfigured } from './supabase'
import type { FileMap } from '../types'

export interface ConnectionInfo {
  provider: string
  connected: boolean
  login?: string | null
  name?: string | null
}

export interface GithubPushResult {
  url: string
  cloneUrl: string
  defaultBranch: string
  created: boolean
}

export interface VercelDeployResult {
  url: string
  deploymentId?: string
  projectName: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function hostingEnabled(): boolean {
  return isSupabaseConfigured()
}

function functionsBase(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) throw new Error('The cloud backend is not configured.')
  return url.replace('supabase.co', 'functions.supabase.co')
}

interface ApiError {
  error?: string
  message?: string
}

async function callFn<T>(name: string, body?: unknown): Promise<T> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to use the cloud services below.')

  const res = await fetch(`${functionsBase()}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-json response */
  }

  if (!res.ok) {
    const err = json as ApiError | null
    throw new Error(err?.error ?? err?.message ?? `Request failed (${res.status})`)
  }
  return json as T
}

export async function getConnections(): Promise<ConnectionInfo[]> {
  const data = await callFn<{ connections: ConnectionInfo[] }>('connections')
  return data.connections
}

export async function disconnectConnection(provider: string): Promise<void> {
  await callFn('connections', { action: 'disconnect', provider })
}

function connectionUrl(provider: string): string {
  return `${window.location.origin}${window.location.pathname}#oauth=${provider}`
}

/** Open the OAuth authorize URL in a popup and resolve when the popup lands back on the app. */
export function openOAuthPopup(url: string, provider: string): Promise<void> {
  return new Promise((resolve) => {
    const popup = window.open(url, 'zut-oauth', 'popup,width=560,height=680')
    if (!popup) {
      resolve()
      return
    }
    const marker = connectionUrl(provider)
    const timer = window.setInterval(() => {
      let done = false
      if (popup.closed) {
        done = true
      } else {
        try {
          done = popup.location.href.startsWith(marker)
        } catch {
          /* still cross-origin — keep polling */
        }
      }
      if (done) {
        window.clearInterval(timer)
        if (!popup.closed) popup.close()
        resolve()
      }
    }, 300)
  })
}

export async function connectProvider(provider: 'github' | 'vercel'): Promise<void> {
  const { url } = await callFn<{ url: string }>(`oauth-${provider}-start`, {
    redirectTo: `${window.location.origin}${window.location.pathname}`,
  })
  await openOAuthPopup(url, provider)
}

export async function pushToGithub(
  name: string,
  isPrivate: boolean,
  files: FileMap,
  token?: string,
): Promise<GithubPushResult> {
  return callFn<GithubPushResult>('github-push', { name, private: isPrivate, files, ...(token ? { token } : {}) })
}

export async function deployToVercel(name: string, files: FileMap, token?: string): Promise<VercelDeployResult> {
  return callFn<VercelDeployResult>('vercel-deploy', { name, files, ...(token ? { token } : {}) })
}

export async function streamClaude(
  messages: ChatMessage[],
  system: string,
  onDelta: (text: string) => void,
): Promise<void> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to use the AI assistant.')

  const res = await fetch(`${functionsBase()}/claude`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, system }),
  })

  if (!res.ok) {
    const text = await res.text()
    let message = `AI request failed (${res.status})`
    try {
      const parsed = JSON.parse(text) as ApiError
      message = parsed.error ?? message
    } catch {
      /* not json */
    }
    throw new Error(message)
  }

  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newline: number
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line.startsWith('data:')) continue
      const event = JSON.parse(line.slice(5).trim()) as {
        text?: string
        done?: boolean
        error?: string
      }
      if (event.error) throw new Error(event.error)
      if (event.text) onDelta(event.text)
      if (event.done) return
    }
  }
}