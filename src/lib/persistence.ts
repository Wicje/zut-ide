import type { FileMap } from '../types'

const DB_NAME = 'zut-ide'
const DB_VERSION = 1

export const WORKSPACE_TAG_KEY = 'zut.workspace.tag'
export const BACKUP_KEY = 'zut.backup.last'
const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())

export interface SnapshotRecord {
  id: string
  projectKey: string
  projectId: string | null
  name: string
  files: FileMap
  createdAt: number
  kind: 'auto' | 'checkpoint'
}

export interface ActiveWorkspaceRecord {
  key: 'current'
  name: string
  files: FileMap
  updatedAt: number
}

type StoreName = 'localProjects' | 'workspaceSnapshots' | 'activeWorkspace'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('localProjects')) {
        db.createObjectStore('localProjects', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('workspaceSnapshots')) {
        const store = db.createObjectStore('workspaceSnapshots', { keyPath: 'id' })
        store.createIndex('byProject', 'projectKey')
        store.createIndex('byCreated', 'createdAt')
      }
      if (!db.objectStoreNames.contains('activeWorkspace')) {
        db.createObjectStore('activeWorkspace', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function withStore<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const txn = db.transaction(store, mode)
    const s = txn.objectStore(store)
    const req = fn(s)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(store: StoreName, value: unknown): Promise<unknown> {
  return withStore(store, 'readwrite', (s) => s.put(value as never))
}

function idbGet<T>(store: StoreName, key: unknown): Promise<T | undefined> {
  return withStore(store, 'readonly', (s) => s.get(key as never))
}

function idbDelete(store: StoreName, key: unknown): Promise<unknown> {
  return withStore(store, 'readwrite', (s) => s.delete(key as never))
}

function idbAll<T>(store: StoreName): Promise<T[]> {
  return withStore(store, 'readonly', (s) => s.getAll())
}

function isIdbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

// ---------------------------------------------------------------------------
// Active (current) workspace — durable IndexedDB copy + fast localStorage mirror
// ---------------------------------------------------------------------------

const LOCAL_KEY = 'zut.workspace'

export function projectTag(): { tab: string; updatedAt: number } | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_TAG_KEY)
    return raw ? (JSON.parse(raw) as { tab: string; updatedAt: number }) : null
  } catch {
    return null
  }
}

let durableWriteTimer: ReturnType<typeof setTimeout> | null = null
let pendingDurable: { name: string; files: FileMap } | null = null

export async function saveActiveWorkspace(name: string, files: FileMap): Promise<void> {
  const updatedAt = Date.now()
  const tag = JSON.stringify({ tab: TAB_ID, updatedAt })
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ name, files }))
    localStorage.setItem(WORKSPACE_TAG_KEY, tag)
  } catch {
    /* storage full — IndexedDB remains the durable copy */
  }
  if (!isIdbAvailable()) return
  pendingDurable = { name, files }
  if (durableWriteTimer) return
  durableWriteTimer = setTimeout(() => {
    durableWriteTimer = null
    const rec = pendingDurable
    pendingDurable = null
    if (!rec) return
    idbPut('activeWorkspace', { key: 'current', ...rec, updatedAt })
      .catch(() => {})
  }, 1500)
}

/** Fast, synchronous read — mirrors localStorage. */
export function loadActiveWorkspace(): { name: string; files: FileMap } | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Durable recovery — used when the localStorage mirror is missing (cache cleared,
 *  private mode, OS-killed mobile app). Prefers the mirror when present. */
export async function recoverActiveWorkspace(): Promise<{ name: string; files: FileMap } | null> {
  const mirror = loadActiveWorkspace()
  if (mirror) return mirror
  if (!isIdbAvailable()) return null
  try {
    const durable = await idbGet<ActiveWorkspaceRecord>('activeWorkspace', 'current')
    return durable ? { name: durable.name, files: durable.files } : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Version snapshots — IndexedDB write-ahead history for the active workspace
// ---------------------------------------------------------------------------

function projectKeyOf(projectId: string | null, name: string): string {
  return projectId ? `id:${projectId}` : `name:${name}`
}

export async function saveWorkspaceSnapshot(
  projectId: string | null,
  name: string,
  files: FileMap,
  kind: SnapshotRecord['kind'] = 'auto',
): Promise<void> {
  if (!isIdbAvailable()) return
  const record: SnapshotRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectKey: projectKeyOf(projectId, name),
    projectId,
    name,
    files,
    createdAt: Date.now(),
    kind,
  }
  try {
    await idbPut('workspaceSnapshots', record)
    await pruneSnapshots(projectKeyOf(projectId, name), 20)
  } catch {
    /* snapshotting is best-effort */
  }
}

export function saveWorkspaceCheckpoint(projectId: string | null, name: string, files: FileMap): Promise<void> {
  return saveWorkspaceSnapshot(projectId, name, files, 'checkpoint')
}

export async function listWorkspaceSnapshots(projectId: string | null, name: string): Promise<SnapshotRecord[]> {
  if (!isIdbAvailable()) return []
  try {
    const all = await idbAll<SnapshotRecord>('workspaceSnapshots')
    const key = projectKeyOf(projectId, name)
    return all.filter((s) => s.projectKey === key).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20)
  } catch {
    return []
  }
}

async function pruneSnapshots(projectKey: string, keep: number): Promise<void> {
  try {
    const all = await idbAll<SnapshotRecord>('workspaceSnapshots')
    const stale = all
      .filter((s) => s.projectKey === projectKey)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(keep)
    for (const s of stale) await idbDelete('workspaceSnapshots', s.id)
  } catch {
    /* ignore */
  }
}

export async function restoreWorkspaceSnapshot(id: string): Promise<{ name: string; files: FileMap } | null> {
  if (!isIdbAvailable()) return null
  try {
    const rec = await idbGet<SnapshotRecord>('workspaceSnapshots', id)
    return rec ? { name: rec.name, files: rec.files } : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Local project list (multi-project) — durable IndexedDB + localStorage mirror
// ---------------------------------------------------------------------------

export interface LocalProjectRow {
  id: string
  name: string
  files: FileMap
  updated_at: string | null
}

const LOCAL_PROJECTS_KEY = 'zut.projects'

export async function listLocalProjects(): Promise<LocalProjectRow[]> {
  const mirror = readLocalProjectsMirror()
  if (!isIdbAvailable()) return mirror
  try {
    const all = await idbAll<LocalProjectRow>('localProjects')
    if (all.length >= mirror.length) return all
    return mirror
  } catch {
    return mirror
  }
}

export async function saveLocalProject(row: LocalProjectRow): Promise<void> {
  const rows = readLocalProjectsMirror()
  const next = [row, ...rows.filter((r) => r.id !== row.id)].slice(0, 50)
  try {
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  if (isIdbAvailable()) {
    try {
      await idbPut('localProjects', row)
      await pruneLocalProjects(50)
    } catch {
      /* ignore */
    }
  }
}

export async function deleteLocalProject(id: string): Promise<void> {
  try {
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(readLocalProjectsMirror().filter((r) => r.id !== id)))
  } catch {
    /* ignore */
  }
  if (isIdbAvailable()) {
    try {
      await idbDelete('localProjects', id)
    } catch {
      /* ignore */
    }
  }
}

async function pruneLocalProjects(keep: number): Promise<void> {
  try {
    const all = await idbAll<LocalProjectRow>('localProjects')
    const stale = all.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(keep)
    for (const r of stale) await idbDelete('localProjects', r.id)
  } catch {
    /* ignore */
  }
}

function readLocalProjectsMirror(): LocalProjectRow[] {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY)
    return raw ? (JSON.parse(raw) as LocalProjectRow[]) : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Auto backup heartbeat — download a zip at most once per day when the project changed
// ---------------------------------------------------------------------------

export function maybeHeartbeatBackup(name: string): boolean {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const raw = localStorage.getItem(BACKUP_KEY)
    const last: { date: string; name: string } | null = raw ? JSON.parse(raw) : null
    if (!last || last.date !== today || last.name !== name) {
      return true // caller triggers downloadZip + records { date: today, name }
    }
  } catch {
    /* ignore */
  }
  return false
}

export function recordHeartbeatBackup(name: string): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ date: new Date().toISOString().slice(0, 10), name }))
  } catch {
    /* ignore */
  }
}

export function currentTabId(): string {
  return TAB_ID
}

// ---------------------------------------------------------------------------
// Cross-tab conflict detection
// ---------------------------------------------------------------------------

export function listenForExternalWorkspaceChange(cb: (updatedAt: number, tab: string) => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key !== WORKSPACE_TAG_KEY) return
    const tag = e.newValue ? (JSON.parse(e.newValue) as { tab: string; updatedAt: number }) : null
    if (tag && tag.tab !== TAB_ID) cb(tag.updatedAt, tag.tab)
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}