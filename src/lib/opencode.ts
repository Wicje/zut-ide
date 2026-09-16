// Client for the opencode AI server (local HTTP API).
// Provides multi-provider AI chat with tool access (file read/edit, shell, search).

import type { ChatMessage } from './hosting'
import type { FileMap } from '../types'

export interface OpencodeProvider {
  id: string
  name: string
  type: string
  models: OpencodeModel[]
  connected: boolean
  defaultModel?: string
}

export interface OpencodeModel {
  id: string
  name: string
}

export interface OpencodeConfig {
  provider?: string
  model?: string
}

export interface ProjectChange {
  updated: Record<string, string>
  created: Record<string, string>
  deleted: string[]
}

const DEFAULT_URL = 'http://127.0.0.1:4096'
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:4331'

function getBaseUrl(): string {
  return (import.meta.env.VITE_OPENCODE_URL as string) || DEFAULT_URL
}

function getBridgeUrl(): string {
  return (import.meta.env.VITE_OPENCODE_BRIDGE_URL as string) || DEFAULT_BRIDGE_URL
}

/** Whether the file bridge (disk sync) is reachable. */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getBridgeUrl()}/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

/** Write the IDE's virtual project files to the disk workspace opencode edits. */
export async function syncProjectToDisk(files: FileMap): Promise<void> {
  const res = await fetch(`${getBridgeUrl()}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`opencode file sync failed (${res.status}): ${body}`)
  }
}

/** Read the disk workspace back (files opencode may have created/edited/deleted). */
export async function readProjectFromDisk(): Promise<FileMap> {
  const res = await fetch(`${getBridgeUrl()}/read-tree`)
  if (!res.ok) throw new Error(`opencode file read failed (${res.status})`)
  const json = (await res.json()) as { files?: FileMap }
  return json.files ?? {}
}

/** Diff a pulled tree against the IDE's current files. */
export function computeProjectChanges(prev: FileMap, next: FileMap): ProjectChange {
  const updated: Record<string, string> = {}
  const created: Record<string, string> = {}
  const deleted: string[] = []
  for (const [p, c] of Object.entries(next)) {
    const before = prev[p]
    if (before === undefined) created[p] = c
    else if (before !== c) updated[p] = c
  }
  for (const p of Object.keys(prev)) {
    if (!(p in next)) deleted.push(p)
  }
  return { updated, created, deleted }
}

export async function isOpencodeAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/global/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function getConfig(): Promise<OpencodeConfig> {
  const res = await fetch(`${getBaseUrl()}/config`)
  if (!res.ok) throw new Error('Failed to fetch opencode config')
  const json = await res.json()
  return json.data ?? json
}

export async function getProviders(): Promise<OpencodeProvider[]> {
  const res = await fetch(`${getBaseUrl()}/provider`)
  if (!res.ok) throw new Error('Failed to fetch providers')
  const json = (await res.json()) as {
    all?: Array<Record<string, unknown>>
    default?: Record<string, string>
    connected?: string[]
  }
  const raw = json.all ?? []
  const defaults = json.default ?? {}
  const connected = new Set(json.connected ?? [])

  return raw.map((p: Record<string, unknown>) => {
    const id = (p.id ?? p.name ?? '') as string
    const modelsRaw = p.models
    let models: OpencodeModel[] = []
    if (Array.isArray(modelsRaw)) {
      models = modelsRaw.map((m: Record<string, unknown>) => ({
        id: (m.id ?? '') as string,
        name: (m.name ?? m.id ?? '') as string,
      }))
    } else if (modelsRaw && typeof modelsRaw === 'object') {
      models = Object.entries(modelsRaw as Record<string, Record<string, unknown>>).map(
        ([mid, m]) => ({
          id: mid,
          name: (m.name ?? m.id ?? mid) as string,
        }),
      )
    }
    return {
      id,
      name: (p.name ?? id) as string,
      type: (p.type ?? '') as string,
      models,
      connected: connected.has(id),
      defaultModel: defaults[id],
    }
  })
}

export async function createSession(): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error('Failed to create opencode session')
  const json = await res.json()
  const id = json.data?.id ?? json.id
  if (!id) throw new Error('No session ID returned')
  return id
}

export async function sendPrompt(
  sessionId: string,
  text: string,
  opts?: { provider?: string; model?: string; system?: string },
): Promise<void> {
  const body: Record<string, unknown> = { parts: [{ type: 'text', text }] }
  if (opts?.provider && opts?.model) body.model = { providerID: opts.provider, modelID: opts.model }
  else if (opts?.provider || opts?.model) {
    // Partial selection — fall back to the provider default model only if
    // the caller supplied both; otherwise omit and let opencode decide.
  }
  if (opts?.system) body.system = opts.system

  const res = await fetch(`${getBaseUrl()}/session/${sessionId}/prompt_async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const bodyText = await res.text()
    throw new Error(`opencode prompt failed (${res.status}): ${bodyText}`)
  }
}

/**
 * Send a message to an opencode session and stream the response text back.
 * opencode sessions maintain their own message history, so only the latest
 * user message is sent. The optional projectContext is prepended on the first
 * turn to describe the virtual files the agent cannot see on disk.
 */
export async function streamOpencode(
  sessionId: string,
  messages: ChatMessage[],
  projectContext: string,
  systemPrompt: string,
  onDelta: (text: string) => void,
  opts?: { provider?: string; model?: string },
): Promise<void> {
  const last = messages[messages.length - 1]
  const promptText = last && last.role === 'user' ? last.content : 'Continue.'

  // On the first user message, include project context so the agent
  // understands the virtual files it cannot see on disk.
  const userTurns = messages.filter((m) => m.role === 'user').length
  const text = userTurns === 1 && projectContext ? `${projectContext}\n\n${promptText}` : promptText

  // Set up EventSource BEFORE sending prompt to avoid missing the user
  // message.updated event (which identifies the echo to filter out).
  const baseUrl = getBaseUrl()
  const eventSource = new EventSource(`${baseUrl}/event`)

  const assistantIds = new Set<string>()
  const userIds = new Set<string>()
  const partTexts = new Map<string, string>()

  let resolved = false
  let closed = false
  let finalResolve: () => void
  let finalReject: (err: Error) => void
  const done = new Promise<void>((resolve, reject) => {
    finalResolve = resolve
    finalReject = reject
  })

  const timeout = setTimeout(() => {
    if (!resolved) {
      closed = true
      eventSource.close()
      finalReject(new Error('opencode response timed out'))
    }
  }, 120_000)

  eventSource.onmessage = (ev) => {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(ev.data)
    } catch {
      return
    }
    const type = event.type as string | undefined
    const props = (event.properties ?? event) as Record<string, unknown>
    if ((props.sessionID ?? props.session_id) && props.sessionID !== sessionId && props.session_id !== sessionId) return

    switch (type) {
      case 'message.updated': {
        const info = props.info as Record<string, unknown> | undefined
        if (!info) return
        const role = info.role as string | undefined
        const id = info.id as string | undefined
        if (!id) return
        if (role === 'user') userIds.add(id)
        else if (role === 'assistant') assistantIds.add(id)
        break
      }
      case 'message.part.updated': {
        const part = props.part as Record<string, unknown> | undefined
        if (!part || part.type !== 'text' || typeof part.text !== 'string') return
        const mid = part.messageID as string | undefined
        // Skip the user's own echoed prompt
        if (mid && userIds.has(mid)) return
        if (mid && !assistantIds.has(mid)) return
        const pid = (part.id ?? mid) as string
        const prev = partTexts.get(pid) ?? ''
        const text = part.text
        let delta = ''
        if (text.startsWith(prev)) delta = text.slice(prev.length)
        else delta = text // some providers resend full text
        partTexts.set(pid, text)
        if (delta) onDelta(delta)
        break
      }
      case 'session.error': {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          closed = true
          eventSource.close()
          const err = props.error as Record<string, unknown> | undefined
          const msg = (err?.data as Record<string, unknown> | undefined)?.message
          finalReject(new Error(typeof msg === 'string' ? msg : 'opencode request failed'))
        }
        break
      }
      case 'session.idle': {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          closed = true
          eventSource.close()
          finalResolve()
        }
        break
      }
    }
  }

  eventSource.onerror = () => {
    // EventSource auto-reconnects; only give up if the connection was closed
    // intentionally or the global error races our own closure.
    if (closed) return
  }

  // Now send the prompt — handlers above are ready to capture the response
  await sendPrompt(sessionId, text, {
    ...opts,
    system: systemPrompt || undefined,
  })

  await done
}