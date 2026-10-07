// Pilot cost trail (browser mirror). Broker is source of truth in BaaS;
// this keeps a local copy so the pilot dashboard works offline and the
// cost-per-run is visible without a backend.

import type { UsageRecord } from '../types'
import { estimateSmallHours, LIMITS } from './limits'

const KEY = 'zut:usage:runs'

const mem = new Map<string, string>()

function store(): { get(k: string): string | null; set(k: string, v: string): void; clear(k: string): void } {
  try {
    if (typeof localStorage !== 'undefined') {
      return {
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v),
        clear: (k) => localStorage.removeItem(k),
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
    clear: (k) => {
      mem.delete(k)
    },
  }
}

function load(): UsageRecord[] {
  try {
    const raw = store().get(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as UsageRecord[]
    return Array.isArray(arr) ? arr.slice(-500) : []
  } catch {
    return []
  }
}

function save(rows: UsageRecord[]): void {
  try {
    store().set(KEY, JSON.stringify(rows.slice(-500)))
  } catch {
    /* storage unavailable */
  }
}

/** Test-only: clear the local trail. */
export function clearUsage(): void {
  try {
    store().clear(KEY)
  } catch {
    /* ignore */
  }
}

export function recordRun(r: Omit<UsageRecord, 'at' | 'smallHours'> & { smallHours?: number }): UsageRecord {
  const row: UsageRecord = {
    ...r,
    smallHours: r.smallHours ?? estimateSmallHours(r.durationMs, 'small'),
    at: Date.now(),
  }
  const rows = [...load(), row].slice(-500)
  save(rows)
  return row
}

export function runsToday(workspaceId?: string): UsageRecord[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return load().filter((r) => r.at >= start.getTime() && (!workspaceId || r.workspaceId === workspaceId))
}

export function isDailyQuotaHit(): boolean {
  return runsToday().length >= LIMITS.dailyRunCap
}

/** Recent runs for the pilot dashboard (newest last, capped). */
export function listRecentRuns(limit = 20): UsageRecord[] {
  return load().slice(-limit).reverse()
}

/** Pilot dashboard numbers: total runs, total Small-hours, avg ms/run. */
export function pilotStats(): { runs: number; smallHours: number; avgMs: number; today: number } {
  const rows = load()
  const smallHours = rows.reduce((n, r) => n + (r.smallHours || 0), 0)
  const avgMs = rows.length ? Math.round(rows.reduce((n, r) => n + r.durationMs, 0) / rows.length) : 0
  return { runs: rows.length, smallHours, avgMs, today: runsToday().length }
}
