import type { FileMap } from '../types'
import { supabaseOrNull } from './supabase'
import { brokerBaseUrl, brokerEnabled } from './broker'
import { getUserToken } from './auth'
import {
  listLocalProjects,
  saveLocalProject,
  deleteLocalProject as deleteLocalProjectDurable,
  loadActiveWorkspace,
  saveActiveWorkspace,
  type LocalProjectRow,
} from './persistence'

export interface StoredRow {
  id: string
  name: string
  files: FileMap
  share_token: string | null
  updated_at: string | null
}

/**
 * Swappable backend contract (Supabase today, Mudbase next, local fallback).
 * Broker + BaaS must enforce the same rule: user A can never read/write
 * user B's projects or connections. Every broker route re-checks ownership
 * against BaaS — never trust a workspace id from the browser alone.
 * Service keys (Supabase service_role, Mudbase project key, Cells API key)
 * stay server-side and never enter the browser bundle.
 */
export interface BackendProvider {
  kind: 'supabase' | 'mudbase' | 'local'
  listProjects(): Promise<StoredRow[]>
  getProject(id: string): Promise<StoredRow>
}

/** Pure ownership check shared by browser (fail fast) and broker (enforce).
 *  Returns true only when owner matches and both ids are safe segments. */
export function canAccessWorkspace(ownerId: string | null | undefined, callerId: string | null | undefined): boolean {
  if (!ownerId || !callerId) return false
  if (ownerId !== callerId) return false
  return /^[A-Za-z0-9_-]{1,64}$/.test(callerId)
}

/** File-sync helper: hash files so broker uploads only differences to the Cell.
 *  Never sync node_modules / build output back into BaaS. */
export function hashFile(content: string): string {
  let h = 5381
  for (let i = 0; i < content.length; i++) h = ((h << 5) + h + content.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Split a FileMap into batches of ≤200 for Cells file-write endpoint. */
export function batchFiles(files: FileMap, batchSize = 200): FileMap[] {
  const entries = Object.entries(files)
  const out: FileMap[] = []
  for (let i = 0; i < entries.length; i += batchSize) {
    out.push(Object.fromEntries(entries.slice(i, i + batchSize)))
  }
  return out.length ? out : [{}]
}

async function brokerFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = brokerBaseUrl()
  if (!base) throw new Error('Broker not configured')
  const token = await getUserToken()
  if (!token) throw new Error('Sign in required')
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
}

async function brokerListProjects(): Promise<StoredRow[] | null> {
  if (!brokerEnabled()) return null
  try {
    const res = await brokerFetch('/api/baas/projects')
    if (res.status === 401 || res.status === 403 || res.status === 503) return null
    if (!res.ok) return null
    return (await res.json()) as StoredRow[]
  } catch {
    return null
  }
}

export async function listProjects(): Promise<StoredRow[]> {
  const viaBroker = await brokerListProjects()
  if (viaBroker) return viaBroker
  const supabase = supabaseOrNull()
  if (!supabase) {
    const rows = await listLocalProjects()
    return rows.map((r): StoredRow => ({ id: r.id, name: r.name, files: r.files, share_token: null, updated_at: r.updated_at }))
  }
  const { data, error } = await supabase
    .from('zut_projects')
    .select('id, name, files, share_token, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StoredRow[]
}

export async function getProject(id: string): Promise<StoredRow> {
  if (brokerEnabled()) {
    try {
      const res = await brokerFetch(`/api/baas/projects/${encodeURIComponent(id)}`)
      if (res.ok) return (await res.json()) as StoredRow
    } catch {
      /* fall through to Supabase/local */
    }
  }
  const supabase = supabaseOrNull()
  if (!supabase) throw new Error('Not signed in')
  const { data, error } = await supabase.from('zut_projects').select('id, name, files, share_token, updated_at').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Project not found')
  return data as StoredRow
}

export async function createProject(name: string, files: FileMap): Promise<string> {
  if (brokerEnabled()) {
    try {
      const res = await brokerFetch('/api/baas/projects', { method: 'POST', body: JSON.stringify({ name, files }) })
      if (res.ok) {
        const j = (await res.json()) as { id: string }
        if (j.id) return j.id
      }
    } catch {
      /* fall through */
    }
  }
  const supabase = supabaseOrNull()
  if (!supabase) {
    const row: LocalProjectRow = { id: `local-${Date.now()}`, name, files, updated_at: null }
    await saveLocalProject(row)
    return row.id
  }
  const { data, error } = await supabase
    .from('zut_projects')
    .insert({ name, files })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function updateProject(id: string, name: string, files: FileMap): Promise<void> {
  if (brokerEnabled()) {
    try {
      const res = await brokerFetch(`/api/baas/projects/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ name, files }),
      })
      if (res.ok) return
    } catch {
      /* fall through */
    }
  }
  const supabase = supabaseOrNull()
  if (!supabase) {
    const rows = await listLocalProjects()
    if (rows.some((r) => r.id === id)) {
      await saveLocalProject({ id, name, files, updated_at: new Date().toISOString() })
    }
    return
  }
  const { error } = await supabase.from('zut_projects').update({ name, files, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteProject(id: string): Promise<void> {
  if (brokerEnabled()) {
    try {
      const res = await brokerFetch(`/api/baas/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) return
    } catch {
      /* fall through */
    }
  }
  const supabase = supabaseOrNull()
  if (!supabase) {
    await deleteLocalProjectDurable(id)
    return
  }
  const { error } = await supabase.from('zut_projects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setProjectShared(id: string, shared: boolean): Promise<string | null> {
  if (brokerEnabled()) {
    try {
      const res = await brokerFetch('/api/baas/share', { method: 'POST', body: JSON.stringify({ id, shared }) })
      if (res.ok) {
        const j = (await res.json()) as { token: string | null }
        return j.token ?? null
      }
    } catch {
      /* fall through */
    }
  }
  const supabase = supabaseOrNull()
  if (!supabase) throw new Error('Sign in to share projects')
  if (!shared) {
    const { error } = await supabase.from('zut_projects').update({ share_token: null }).eq('id', id)
    if (error) throw new Error(error.message)
    return null
  }
  const uuid = crypto.randomUUID()
  const { error } = await supabase.rpc('zut_set_share_token', { p_project_id: id, p_token: uuid })
  if (error) throw new Error(error.message)
  return uuid
}

export async function getSharedProject(token: string): Promise<{ name: string; files: FileMap }> {
  if (brokerEnabled()) {
    try {
      const base = brokerBaseUrl()
      const res = await fetch(`${base}/api/baas/shared/${encodeURIComponent(token)}`)
      if (res.ok) return (await res.json()) as { name: string; files: FileMap }
    } catch {
      /* fall through */
    }
  }
  const supabase = supabaseOrNull()
  if (!supabase) throw new Error('Sharing requires Supabase to be configured')
  const { data, error } = await supabase.rpc('zut_get_shared_project', { p_token: token })
  if (error) throw new Error(error.message)
  if (!data || !data.files) throw new Error('Project not found')
  return { name: data.name, files: data.files }
}

export function saveLocalWorkspace(name: string, files: FileMap): void {
  void saveActiveWorkspace(name, files)
}

export function loadLocalWorkspace(): { name: string; files: FileMap } | null {
  return loadActiveWorkspace()
}