import type { FileMap } from '../adapters/filemap'
import type { SessionData } from '../types'

export const STARTER: FileMap = {}

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
]

export const CLOUD_LABEL = 'Cloud agent'
export const OPENCODE_LABEL = 'opencode (self-host)'
export const PROVIDER_LABELS = [
  { id: 'openrouter' as const, label: 'OpenRouter' },
  { id: 'anthropic' as const, label: 'Claude' },
  { id: 'chatgpt' as const, label: 'ChatGPT' },
]

export interface RunRecord {
  id: string
  label: string
  exitCode: number | null
  durationMs: number
  at: number
  output: string
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export function labelToGeminiId(label: string): string {
  return GEMINI_MODELS.find((m) => m.label === label)?.id ?? GEMINI_MODELS[0].id
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function stamp(): string {
  return new Date().toLocaleTimeString([], { hour12: false })
}

export function blankSession(id: string, title: string, model: string): SessionData {
  return {
    id,
    title,
    prompt: '',
    steps: [],
    response: '',
    summary: '',
    diffStats: { additions: 0, deletions: 0, filesCount: 0 },
    files: [],
    model,
  }
}
