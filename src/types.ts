export type FileMap = Record<string, string>

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface ConsoleEntry {
  id: number
  level: ConsoleLevel
  message: string
  timestamp: number
  file?: string
  line?: number
  column?: number
}

export interface Project {
  id: string
  name: string
  files: FileMap
  share_token: string | null
  updated_at: string | null
}

export type RunStatus = 'idle' | 'running' | 'done' | 'error'

/** User-facing run stage. Never expose infra words (Cells, Small-hours,
 *  externalId, session id) — only these stage labels reach the UI. */
export type RunStage = 'waking' | 'installing' | 'starting' | 'running' | 'ready'

export interface RunProgress {
  stage: RunStage | null
  cancellable: boolean
  startedAt: number | null
}

/** Pilot cost trail. One row per run; broker persists the same shape to BaaS. */
export interface UsageRecord {
  workspaceId: string
  command: string
  status: 'success' | 'failed' | 'cancelled' | 'quota'
  exitCode: number | null
  durationMs: number
  /** Estimated Small-hours (server bills exact; client estimates for display). */
  smallHours: number
  at: number
}

export interface StoredProjectRow {
  id: string
  name: string
  files: FileMap
  share_token: string | null
  updated_at: string | null
}

export interface RunnerError {
  message: string
  location?: { line?: number; column?: number; file?: string }
}

export interface EditorSelection {
  file: string
  text: string
  startLine: number
  endLine: number
}

export interface ProgramResult {
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  truncated?: boolean
}