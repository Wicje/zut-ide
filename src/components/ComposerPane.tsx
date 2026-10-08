import { useMemo, useRef, useState } from 'react'
import AiPanel, { BACKENDS, type AiPanelHandle, type Backend } from './AiPanel'
import RecordCard from './RecordCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { stripEditBlocks } from '../lib/aiEdits'
import type { ComposersApi } from '../lib/composers'
import type { ChatMessage } from '../lib/hosting'
import type { EditorSelection } from '../types'
import { ChevronDown, FileCode2, Mic, Play, Plus, TerminalSquare, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RunSummary {
  label: string
  exitCode: number | null
  durationMs: number
}

interface ComposerPaneProps {
  composers: ComposersApi
  signedIn: boolean
  onSignIn: () => void
  onClose: () => void
  selection: EditorSelection | null
  reviewAdded: number
  reviewRemoved: number
  changedFiles: string[]
  lastRun: RunSummary | null
  onOpenFile: (path: string) => void
  onCommitPush: () => void
  onLog: (level: 'info' | 'error', message: string) => void
}

interface SpeechRecognizer {
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function recognizerCtor(): (new () => SpeechRecognizer) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognizer
    webkitSpeechRecognition?: new () => SpeechRecognizer
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function firstUserMessage(messages: ChatMessage[]): ChatMessage | null {
  return messages.find((m) => m.role === 'user') ?? null
}

function lastAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i]
  }
  return null
}

// Center column: agent activity feed (request, files, recording, summary)
// above the chat, with the follow-up bar at the bottom. Everything shown
// here is derived from real session data — no placeholders.
export default function ComposerPane({
  composers,
  signedIn,
  onSignIn,
  onClose,
  selection,
  reviewAdded,
  reviewRemoved,
  changedFiles,
  lastRun,
  onOpenFile,
  onCommitPush,
  onLog,
}: ComposerPaneProps) {
  const { sessions, activeId, select, create, remove, retitle, setBackend, syncMessages, messagesFor } = composers
  const active = sessions.find((s) => s.id === activeId) ?? sessions[0]
  const messages = messagesFor(active.id)
  const panelRef = useRef<AiPanelHandle | null>(null)
  const [input, setInput] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const recogRef = useRef<SpeechRecognizer | null>(null)
  const micSupported = recognizerCtor() !== null

  const request = useMemo(() => firstUserMessage(messages), [messages])
  const summary = useMemo(() => {
    const m = lastAssistantMessage(messages)
    if (!m) return null
    const text = stripEditBlocks(m.content).trim() || m.content.trim()
    return text || null
  }, [messages])

  const backendLabel = useMemo(
    () => BACKENDS.find((b) => b.id === (active.backend as Backend | undefined))?.label ?? 'Cloud agent',
    [active.backend],
  )

  function sendFollowUp() {
    if (!input.trim()) return
    panelRef.current?.send(input)
    setInput('')
  }

  function toggleMic() {
    const Ctor = recognizerCtor()
    if (!Ctor) return
    if (listening) {
      recogRef.current?.stop()
      setListening(false)
      return
    }
    try {
      const r = new Ctor()
      recogRef.current = r
      r.continuous = false
      r.interimResults = false
      r.onresult = (e) => {
        const t = e.results[0]?.[0]?.transcript ?? ''
        if (t) setInput((v) => (v ? `${v} ${t}` : t))
      }
      r.onend = () => setListening(false)
      r.onerror = () => setListening(false)
      r.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card text-card-foreground">
      {/* Session header */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border/70 px-3">
        <div className="relative min-w-0 flex-1">
          <select
            value={active.id}
            onChange={(e) => select(e.target.value)}
            className="w-full appearance-none truncate rounded-md bg-transparent py-1 pl-0 pr-6 text-sm font-semibold outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Active agent"
            title="Switch agent"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <button
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="New agent"
          aria-label="New agent"
          onClick={create}
        >
          <Plus className="size-4" />
        </button>
        {sessions.length > 1 && (
          <button
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={`Delete ${active.title}`}
            aria-label={`Delete ${active.title}`}
            onClick={() => remove(active.id)}
          >
            <X className="size-4" />
          </button>
        )}
        <button
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Close composer"
          aria-label="Close composer"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Activity feed */}
      <ScrollArea className="min-h-0 shrink-0" style={{ maxHeight: '46%' }}>
        <div className="flex flex-col gap-2.5 px-3 py-3">
          {request ? (
            <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5">
              <div className="pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Request</div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{request.content}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
              Describe what to build — the agent reads your project and edits files directly.
            </div>
          )}

          {(changedFiles.length > 0 || lastRun) && (
            <div className="flex flex-wrap gap-1.5">
              {changedFiles.slice(0, 6).map((f) => (
                <button
                  key={f}
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-foreground/80 transition-colors hover:border-violet-400/50 hover:text-foreground"
                  onClick={() => onOpenFile(f)}
                  title={`Open ${f}`}
                >
                  <FileCode2 className="size-3 shrink-0 text-violet-500" />
                  <span className="truncate">{f}</span>
                </button>
              ))}
              {changedFiles.length > 6 && (
                <span className="rounded-full border border-border/70 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                  +{changedFiles.length - 6} more
                </span>
              )}
              {lastRun && (
                <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-foreground/80" title="Last run">
                  <TerminalSquare className="size-3 shrink-0 text-emerald-600" />
                  {lastRun.label} · exit {lastRun.exitCode ?? '?'} · {lastRun.durationMs}ms
                </span>
              )}
            </div>
          )}

          <RecordCard onLog={onLog} />

          {summary && (
            <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm">
              <div className="pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Summary</div>
              <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed" title={summary}>
                {summary}
              </p>
              <p className="pt-1.5 font-mono text-[11px] text-muted-foreground">
                {changedFiles.length} file{changedFiles.length === 1 ? '' : 's'} changed
                {lastRun ? ` · last run ${lastRun.durationMs}ms` : ''}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Chat (backend tabs live here) */}
      <div className="min-h-0 flex-1 border-t border-border/70">
        <AiPanel
          ref={panelRef}
          key={active.id}
          inline
          hideHeader
          hideInput
          sessionKey={active.id}
          initialMessages={messages}
          initialBackend={active.backend as Backend | undefined}
          onMessagesChange={(_id, msgs) => syncMessages(active.id, msgs)}
          onSessionTitle={(t) => retitle(active.id, t)}
          onBackendChange={(b) => setBackend(active.id, b)}
          signedIn={signedIn}
          onSignIn={onSignIn}
          onClose={onClose}
          selection={selection}
        />
      </div>

      {/* Follow-up bar */}
      <div className="shrink-0 border-t border-border/70 px-3 pb-3 pt-2.5">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            sendFollowUp()
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up…"
            className="h-9 rounded-full bg-muted/60"
            aria-label="Ask a follow-up"
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={!input.trim()}>
            <Play className="size-4 fill-current" />
          </Button>
        </form>
        <div className="flex items-center gap-1.5 pt-2">
          <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-[11px]" title="Uncommitted changes vs last snapshot">
            <span className="text-emerald-600">+{reviewAdded}</span>{' '}
            <span className="text-red-600">-{reviewRemoved}</span>
          </span>
          <Button size="sm" className="h-7 rounded-full text-xs" onClick={onCommitPush}>
            Commit &amp; Push
          </Button>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative">
              <button
                className="flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setModelOpen((o) => !o)}
                title="Agent backend"
                aria-label="Agent backend"
                aria-expanded={modelOpen}
              >
                {backendLabel} <ChevronDown className="size-3" />
              </button>
              {modelOpen && (
                <>
                  <span className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} aria-hidden />
                  <span className="absolute bottom-8 right-0 z-20 w-44 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                    {BACKENDS.map((b) => (
                      <button
                        key={b.id}
                        className={cn(
                          'flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                          backendLabel === b.label ? 'font-semibold text-foreground' : 'text-muted-foreground',
                        )}
                        onClick={() => {
                          panelRef.current?.setBackend(b.id)
                          setModelOpen(false)
                        }}
                      >
                        {b.label}
                      </button>
                    ))}
                  </span>
                </>
              )}
            </span>
            {micSupported && (
              <button
                className={cn(
                  'grid size-7 shrink-0 place-content-center rounded-full border transition-colors',
                  listening ? 'border-red-500 bg-red-500/10 text-red-600' : 'border-border/70 text-muted-foreground hover:text-foreground',
                )}
                onClick={toggleMic}
                title={listening ? 'Stop listening' : 'Voice input'}
                aria-label={listening ? 'Stop listening' : 'Voice input'}
              >
                <Mic className="size-3.5" />
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
