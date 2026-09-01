import type { FileMap } from '../types'
import { supabaseOrNull } from './supabase'

const LOCAL_KEY = 'zut.workspace'
const LOCAL_PROJECTS_KEY = 'zut.projects'

export interface StoredRow {
  id: string
  name: string
  files: FileMap
  share_token: string | null
  updated_at: string | null
}

export async function listProjects(): Promise<StoredRow[]> {
  const supabase = supabaseOrNull()
  if (!supabase) {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY)
    return raw ? (JSON.parse(raw) as StoredRow[]) : []
  }
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, files, share_token, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StoredRow[]
}

export async function getProject(id: string): Promise<StoredRow> {
  const supabase = supabaseOrNull()
  if (!supabase) throw new Error('Not signed in')
  const { data, error } = await supabase.from('projects').select('id, name, files, share_token, updated_at').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Project not found')
  return data as StoredRow
}

export async function createProject(name: string, files: FileMap): Promise<string> {
  const supabase = supabaseOrNull()
  if (!supabase) {
    const rows = await readLocalProjects()
    const row: StoredRow = { id: `local-${Date.now()}`, name, files, share_token: null, updated_at: null }
    rows.unshift(row)
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(rows.slice(0, 50)))
    return row.id
  }
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, files })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function updateProject(id: string, name: string, files: FileMap): Promise<void> {
  const supabase = supabaseOrNull()
  if (!supabase) return
  const { error } = await supabase.from('projects').update({ name, files, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  const rows = await readLocalProjects()
  const row = rows.find((r) => r.id === id)
  if (row) {
    row.name = name
    row.files = files
    row.updated_at = new Date().toISOString()
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(rows))
  }
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = supabaseOrNull()
  if (!supabase) {
    const rows = await readLocalProjects()
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(rows.filter((r) => r.id !== id)))
    return
  }
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setProjectShared(id: string, shared: boolean): Promise<string | null> {
  const supabase = supabaseOrNull()
  if (!supabase) throw new Error('Sign in to share projects')
  if (!shared) {
    const { error } = await supabase.from('projects').update({ share_token: null }).eq('id', id)
    if (error) throw new Error(error.message)
    return null
  }
  const uuid = crypto.randomUUID()
  const { error } = await supabase.rpc('set_share_token', { p_project_id: id, p_token: uuid })
  if (error) throw new Error(error.message)
  return uuid
}

export async function getSharedProject(token: string): Promise<{ name: string; files: FileMap }> {
  const supabase = supabaseOrNull()
  if (!supabase) throw new Error('Sharing requires Supabase to be configured')
  const { data, error } = await supabase.rpc('get_shared_project', { p_token: token })
  if (error) throw new Error(error.message)
  if (!data || !data.files) throw new Error('Project not found')
  return { name: data.name, files: data.files }
}

async function readLocalProjects(): Promise<StoredRow[]> {
  const raw = localStorage.getItem(LOCAL_PROJECTS_KEY)
  return raw ? (JSON.parse(raw) as StoredRow[]) : []
}

export function saveLocalWorkspace(name: string, files: FileMap): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ name, files }))
  } catch {
    /* storage full */
  }
}

export function loadLocalWorkspace(): { name: string; files: FileMap } | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}