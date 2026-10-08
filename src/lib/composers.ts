// Composer sessions: multiple named agent conversations per workspace.
// Messages persist per session in localStorage so switching agents never
// loses history. Ephemeral things (drafts, proposals, opencode session ids)
// stay in the panel, not here.

import { useCallback, useState } from 'react'
import type { ChatMessage } from './hosting'

export interface ComposerSession {
  id: string
  title: string
  backend?: string
  createdAt: number
  updatedAt: number
}

const SESSIONS_KEY = 'zut:composers'
const ACTIVE_KEY = 'zut:composers:active'
const MSG_KEY = (id: string) => `zut:composer:${id}`
const MAX_MESSAGES = 100

function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  }
}

const mem = new Map<string, string>()

function backend(): {
  get(k: string): string | null
  set(k: string, v: string): void
  del(k: string): void
  clearAll(): void
} {
  try {
    if (typeof localStorage !== 'undefined') {
      return {
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v),
        del: (k) => localStorage.removeItem(k),
        clearAll: () => {
          for (const k of Object.keys(localStorage)) {
            if (k === SESSIONS_KEY || k === ACTIVE_KEY || k.startsWith('zut:composer:')) localStorage.removeItem(k)
          }
        },
      }
    }
  } catch {
    /* fall through to memory */
  }
  return {
    get: (k) => mem.get(k) ?? null,
    set: (k, v) => {
      mem.set(k, v)
    },
    del: (k) => {
      mem.delete(k)
    },
    clearAll: () => {
      for (const k of [...mem.keys()]) {
        if (k === SESSIONS_KEY || k === ACTIVE_KEY || k.startsWith('zut:composer:')) mem.delete(k)
      }
    },
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = backend().get(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    backend().set(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

/** Test-only: wipe composer state. */
export function clearComposersForTests(): void {
  try {
    backend().clearAll()
  } catch {
    /* ignore */
  }
}

export function loadSessions(): ComposerSession[] {
  const rows = read<ComposerSession[]>(SESSIONS_KEY, [])
  return Array.isArray(rows) ? rows.sort((a, b) => b.updatedAt - a.updatedAt) : []
}

export function loadMessages(id: string): ChatMessage[] {
  const rows = read<ChatMessage[]>(MSG_KEY(id), [])
  return Array.isArray(rows) ? rows.slice(-MAX_MESSAGES) : []
}

export function saveMessages(id: string, messages: ChatMessage[]): void {
  write(MSG_KEY(id), messages.slice(-MAX_MESSAGES))
}

export function clearMessages(id: string): void {
  try {
    backend().del(MSG_KEY(id))
  } catch {
    /* ignore */
  }
}

function setActiveIdStored(id: string): void {
  try {
    backend().set(ACTIVE_KEY, id)
  } catch {
    /* ignore */
  }
}

function loadActiveIdStored(): string | null {
  try {
    return backend().get(ACTIVE_KEY)
  } catch {
    return null
  }
}

function persistSessions(sessions: ComposerSession[]): void {
  write(SESSIONS_KEY, sessions)
}

export function useComposers() {
  const [sessions, setSessions] = useState<ComposerSession[]>(() => {
    const existing = loadSessions()
    if (existing.length) return existing
    const first: ComposerSession = {
      id: uid(),
      title: 'Composer ghost',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    persistSessions([first])
    setActiveIdStored(first.id)
    return [first]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadActiveIdStored()
    if (saved && sessions.some((s) => s.id === saved)) return saved
    return sessions[0].id
  })
  const [messagesById, setMessagesById] = useState<Record<string, ChatMessage[]>>({})

  const select = useCallback(
    (id: string) => {
      if (!sessions.some((s) => s.id === id)) return
      setActiveId(id)
      setActiveIdStored(id)
    },
    [sessions],
  )

  const create = useCallback(() => {
    const n = sessions.length + 1
    const s: ComposerSession = {
      id: uid(),
      title: n === 1 ? 'Composer ghost' : `Composer ${n}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSessions((prev) => {
      const next = [s, ...prev]
      persistSessions(next)
      return next
    })
    setActiveId(s.id)
    setActiveIdStored(s.id)
    return s.id
  }, [sessions.length])

  const remove = useCallback(
    (id: string) => {
      if (sessions.length <= 1) {
        // Never strand the user: last session is cleared, not deleted.
        clearMessages(id)
        setMessagesById((prev) => ({ ...prev, [id]: [] }))
        return
      }
      clearMessages(id)
      setMessagesById((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        persistSessions(next)
        return next
      })
      if (activeId === id) {
        const fallback = sessions.find((s) => s.id !== id)?.id
        if (fallback) {
          setActiveId(fallback)
          setActiveIdStored(fallback)
        }
      }
    },
    [sessions, activeId],
  )

  const retitle = useCallback((id: string, title: string) => {
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, title, updatedAt: Date.now() } : s))
      persistSessions(next)
      return next
    })
  }, [])

  const setBackend = useCallback((id: string, backend: string) => {
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, backend, updatedAt: Date.now() } : s))
      persistSessions(next)
      return next
    })
  }, [])

  const syncMessages = useCallback((id: string, messages: ChatMessage[]) => {
    setMessagesById((prev) => (prev[id] === messages ? prev : { ...prev, [id]: messages }))
    saveMessages(id, messages)
  }, [])

  const messagesFor = useCallback(
    (id: string): ChatMessage[] => messagesById[id] ?? loadMessages(id),
    [messagesById],
  )

  return { sessions, activeId, select, create, remove, retitle, setBackend, syncMessages, messagesFor }
}

export type ComposersApi = ReturnType<typeof useComposers>
