import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import { streamClaude, type ChatMessage } from '../lib/hosting'
import {
  isOpencodeAvailable,
  createSession,
  streamOpencode,
  getProviders,
  syncProjectToDisk,
  readProjectFromDisk,
  computeProjectChanges,
  type OpencodeProvider,
} from '../lib/opencode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { Loader2, Send, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Backend = 'claude' | 'opencode'

interface AiPanelProps {
  signedIn: boolean
  onSignIn: () => void
  onClose: () => void
}

const MAX_FILE_CHARS = 4000

function buildSystemPrompt(
  projectName: string,
  files: Record<string, string>,
  activeFile: string,
): string {
  const names = Object.keys(files).sort()
  const parts = [
    `You are zut, a friendly coding assistant embedded in a browser-based student web IDE.`,
    `Help the student understand and improve their code. Prefer simple, copy-pasteable answers.`,
    ``,
    `Project name: ${projectName}`,
    `Files (${names.length}):`,
    ...names.map((n) => `- ${n}`),
  ]

  const file = files[activeFile]
  if (file !== undefined) {
    const body = file.length > MAX_FILE_CHARS ? `${file.slice(0, MAX_FILE_CHARS)}\n…(truncated)` : file
    parts.push(``, `Active file: ${activeFile}`, `<${activeFile}>`, body, `</${activeFile}>`)
  }

  return parts.join('\n')
}

function buildOpencodePrompt(
  projectName: string,
  files: Record<string, string>,
  activeFile: string,
): string {
  const names = Object.keys(files).sort()
  const parts = [
    `You are zut, a coding assistant in a browser-based web IDE.`,
    `The user is working on project "${projectName}" with ${names.length} files: ${names.join(', ')}.`,
    `The active file is "${activeFile}".`,
    ``,
    `IMPORTANT: This project's files are synced to a directory on disk that you can access.`,
    `Use your file read/write tools to inspect, create, edit, move, or delete files directly.`,
    `When the user asks for a change, MAKE the edit yourself rather than pasting code into chat.`,
    `After modifying files, briefly summarize what you changed in your reply.`,
    ``,
  ]

  const file = files[activeFile]
  if (file !== undefined) {
    const body = file.length > MAX_FILE_CHARS ? `${file.slice(0, MAX_FILE_CHARS)}\n…(truncated)` : file
    parts.push(`Current content of ${activeFile}:\n\`\`\`\n${body}\n\`\`\``)
  }

  return parts.join('\n')
}

export default function AiPanel({ signedIn, onSignIn, onClose }: AiPanelProps) {
  const { state, dispatch } = useWorkspace()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Backend selection
  const [backend, setBackend] = useState<Backend>('claude')
  const [opencodeConnected, setOpencodeConnected] = useState<boolean | null>(null)
  const [opencodeSessionId, setOpencodeSessionId] = useState<string | null>(null)
  const [providers, setProviders] = useState<OpencodeProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')

  // Check opencode availability on mount
  useEffect(() => {
    isOpencodeAvailable().then((ok) => {
      setOpencodeConnected(ok)
      if (ok) {
        getProviders()
          .then((p) => {
            setProviders(p)
            if (p.length > 0 && !selectedProvider) {
              setSelectedProvider(p[0].id)
              if (p[0].models.length > 0) {
                setSelectedModel(p[0].models[0].id)
              }
            }
          })
          .catch(() => {})
      }
    })
  }, [])

  // Create opencode session when switching to opencode backend
  useEffect(() => {
    if (backend === 'opencode' && opencodeConnected && !opencodeSessionId) {
      createSession()
        .then(setOpencodeSessionId)
        .catch(() => {})
    }
  }, [backend, opencodeConnected, opencodeSessionId])

  const activeProvider = providers.find((p) => p.id === selectedProvider)
  const availableModels = activeProvider?.models ?? []

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, draft])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setError(null)
    setBusy(true)
    setDraft('')

    let acc = ''
    try {
      if (backend === 'claude') {
        await streamClaude(
          nextMessages,
          buildSystemPrompt(state.projectName, state.files, state.activeFile),
          (piece) => {
            acc += piece
            setDraft(acc)
          },
        )
      } else {
        let sessionId = opencodeSessionId
        if (!sessionId) {
          sessionId = await createSession()
          setOpencodeSessionId(sessionId)
        }
        const opts = {
          ...(selectedProvider ? { provider: selectedProvider } : {}),
          ...(selectedModel ? { model: selectedModel } : {}),
        }

        // Give opencode the current project on disk first, so its agent tools
        // can read/edit the real files.
        let syncOk = false
        try {
          await syncProjectToDisk(state.files)
          syncOk = true
        } catch {
          // bridge down — chat still works, just no file edits
        }

        await streamOpencode(
          sessionId,
          nextMessages,
          buildOpencodePrompt(state.projectName, state.files, state.activeFile),
          'You are zut, a coding assistant in a browser-based web IDE. Help the student understand and improve their code.',
          (piece) => {
            acc += piece
            setDraft(acc)
          },
          opts,
        )

        // Pull any files opencode created/edited and apply them to the IDE.
        if (syncOk) {
          try {
            const tree = await readProjectFromDisk()
            const changes = computeProjectChanges(state.files, tree)
            if (changes.deleted.length || Object.keys(changes.updated).length || Object.keys(changes.created).length) {
              for (const [p, c] of Object.entries(changes.updated)) dispatch({ type: 'SET_FILE', path: p, content: c })
              for (const [p, c] of Object.entries(changes.created)) dispatch({ type: 'ADD_FILE', path: p, content: c })
              for (const p of changes.deleted) dispatch({ type: 'DELETE_FILE', path: p })
              const n = changes.deleted.length + Object.keys(changes.updated).length + Object.keys(changes.created).length
              acc += `\n\n_(applied ${n} file change${n === 1 ? '' : 's'} to your project)_`
              setDraft(acc)
            }
          } catch {
            // ignore — non-fatal
          }
        }
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: acc }])
    } catch (e) {
      setError((e as { message?: string }).message ?? 'AI request failed')
    } finally {
      setDraft('')
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function reset() {
    setMessages([])
    setDraft('')
    setError(null)
    if (backend === 'opencode') {
      setOpencodeSessionId(null)
    }
  }

  function switchBackend(b: Backend) {
    if (b === backend) return
    setBackend(b)
    setMessages([])
    setDraft('')
    setError(null)
  }

  const [open, setOpen] = useState(true)

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose() }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md" showCloseButton={false}>
        <SheetTitle className="sr-only">zut AI</SheetTitle>

        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-violet-400" /> zut AI
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Clear chat"
              onClick={reset}
            >
              <Trash2 className="size-4" />
            </button>
            <button
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Close"
              onClick={() => { setOpen(false); onClose() }}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Backend selector */}
        <div className="flex shrink-0 items-center gap-1 px-3 py-2.5">
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {(['claude', 'opencode'] as const).map((b) => (
              <button
                key={b}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                  backend === b ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => switchBackend(b)}
              >
                {b === 'claude' ? 'Claude' : 'opencode'}
                {b === 'opencode' && (
                  <span
                    className={cn(
                      'ml-1.5 inline-block size-1.5 rounded-full align-middle',
                      opencodeConnected === true
                        ? 'bg-emerald-400'
                        : opencodeConnected === false
                          ? 'bg-red-400'
                          : 'bg-muted-foreground',
                    )}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* opencode provider/model config */}
        {backend === 'opencode' && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2.5">
            {opencodeConnected === false ? (
              <p className="text-xs text-muted-foreground">
                opencode server not detected. Run <code className="rounded bg-muted px-1 font-mono">npm run dev:opencode</code>
              </p>
            ) : (
              <>
                <select
                  className="h-8 w-auto rounded-md border border-input bg-background px-2 text-xs"
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value)
                    setSelectedModel('')
                    const p = providers.find((pr) => pr.id === e.target.value)
                    if (p?.models.length) setSelectedModel(p.models[0].id)
                  }}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {availableModels.length > 0 && (
                  <select
                    className="h-8 w-auto rounded-md border border-input bg-background px-2 text-xs"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
        )}

        <Separator />

        {!signedIn && backend === 'claude' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">Sign in to chat with Claude about your code.</p>
            <Button onClick={onSignIn}>Sign in</Button>
          </div>
        ) : (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-2 px-3 py-3">
                {messages.length === 0 && !draft && (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    {backend === 'claude'
                      ? 'Ask anything about your project — "explain this code", "add a dark mode", "why is my layout broken?".'
                      : 'Ask the AI to read, edit, or analyze your code. opencode has full file and shell access.'}
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      'max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-relaxed break-words',
                      m.role === 'user'
                        ? 'self-end bg-primary text-primary-foreground'
                        : 'self-start border border-border/60 bg-muted/40',
                    )}
                  >
                    {m.content}
                  </div>
                ))}
                {draft && (
                  <div className="self-start max-w-[90%] whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-[13px] leading-relaxed break-words">
                    {draft}
                    <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-emerald-400 align-text-bottom" />
                  </div>
                )}
                {error && <p className="px-1 text-xs text-destructive">{error}</p>}
                <div ref={endRef} />
              </div>
            </ScrollArea>

            <div className="flex shrink-0 items-center gap-2 border-t p-3">
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  send(input)
                }}
              >
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={busy ? 'Thinking…' : 'Message the AI…'}
                  disabled={busy}
                  className="h-9"
                />
                <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={busy || !input.trim()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </form>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
