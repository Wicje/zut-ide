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