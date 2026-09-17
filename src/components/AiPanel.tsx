import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import { streamClaude, type ChatMessage } from '../lib/hosting'
import {
  DEFAULT_MODEL,
  PROVIDER_MODELS,
  clearApiKey,
  getApiKey,
  setApiKey,
  streamDirect,
  type DirectProvider,
} from '../lib/ai'
import {
  diffLines,
  diffStat,
  parseEdits,
  stripEditBlocks,
  type ProposedEdit,
} from '../lib/aiEdits'
import type { EditorSelection } from '../types'
import {
  isOpencodeAvailable,
  isBridgeAvailable,
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
import { FileCode2, Loader2, Send, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Backend = DirectProvider | 'claude' | 'opencode'

const DIRECT_PROVIDERS: DirectProvider[] = ['openrouter', 'anthropic', 'chatgpt', 'gemini']

function isDirect(backend: Backend): backend is DirectProvider {
  return (DIRECT_PROVIDERS as string[]).includes(backend)
}

const BACKENDS: { id: Backend; label: string }[] = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'anthropic', label: 'Claude' },
  { id: 'claude', label: 'zut Cloud' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'opencode', label: 'opencode' },
]

const DIRECT_INFO: Record<
  DirectProvider,
  { endpoint: string; hint: string; placeholder: string }
> = {
  openrouter: {
    endpoint: 'OpenRouter — one key for Claude, GPT, Gemini, Llama and more. Your key, stored only in this browser.',
    hint: 'Ask anything about your project. One OpenRouter key unlocks many models.',
    placeholder: 'sk-or-… (OpenRouter API key)',
  },
  anthropic: {
    endpoint: 'Anthropic — your key, stored only in this browser.',
    hint: 'Ask anything about your project. Uses your own Anthropic key — requests go straight from your browser to Anthropic.',
    placeholder: 'sk-ant-… (Anthropic API key)',
  },
  chatgpt: {
    endpoint: 'OpenAI — your key, stored only in this browser.',
    hint: 'Ask anything about your project. Uses your own OpenAI key — requests go straight from your browser to OpenAI.',
    placeholder: 'sk-… (OpenAI API key)',
  },
  gemini: {
    endpoint: 'Google AI — your key, stored only in this browser.',
    hint: 'Ask anything about your project. Uses your own Google AI key — requests go straight from your browser to Google.',
    placeholder: 'AIza… (Google AI API key)',
  },
}

const CLOUD_INFO: Record<'claude' | 'opencode', { endpoint: string; hint: string }> = {
  claude: {
    endpoint: 'Anthropic, via the zut cloud proxy.',
    hint: 'Ask anything about your project — "explain this code", "add a dark mode", "why is my layout broken?".',
  },
  opencode: {
    endpoint: 'your AI agent server (opencode).',
    hint: 'Ask the AI to read, edit, or analyze your code. The agent runs on your server, not in the browser.',
  },
}

function endpointFor(backend: Backend): string {
  return isDirect(backend) ? DIRECT_INFO[backend].endpoint : CLOUD_INFO[backend].endpoint
}

function hintFor(backend: Backend): string {
  return isDirect(backend) ? DIRECT_INFO[backend].hint : CLOUD_INFO[backend].hint
}

interface AiPanelProps {
  signedIn: boolean
  onSignIn: () => void
  onClose: () => void
  selection?: EditorSelection | null
}

const MAX_FILE_CHARS = 4000
const MAX_SELECTION_CHARS = 4000

const EDIT_PROTOCOL = [
  'When you propose a code change, output the complete new file so the user can review it as a diff.',
  'For each file you create or modify, include a fenced block in exactly this form:',
  '',
  '```edit:path/to/file',
  '<the full new contents of the file>',
  '```',
  '',
  'Put your explanation in normal prose outside the blocks. Only emit an edit block when you intend to change that file.',
].join('\n')

function languageForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.mts')) return 'ts'
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) return 'js'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  return ''
}

function buildSystemPrompt(
  projectName: string,
  files: Record<string, string>,
  activeFile: string,
  selection?: EditorSelection | null,
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

  if (selection && selection.text) {
    const body =
      selection.text.length > MAX_SELECTION_CHARS
        ? `${selection.text.slice(0, MAX_SELECTION_CHARS)}\n…(truncated)`
        : selection.text
    parts.push(
      ``,
      `The user has selected lines ${selection.startLine}-${selection.endLine} of ${selection.file}:`,
      '```' + languageForPath(selection.file),
      body,
      '```',
      `Focus your answer on this selection unless told otherwise.`,
    )
  }

  parts.push(``, EDIT_PROTOCOL)
  return parts.join('\n')
}

function buildOpencodePrompt(
  projectName: string,
  files: Record<string, string>,
  activeFile: string,
  selection?: EditorSelection | null,
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

  if (selection && selection.text) {
    const body =
      selection.text.length > MAX_SELECTION_CHARS
        ? `${selection.text.slice(0, MAX_SELECTION_CHARS)}\n…(truncated)`
        : selection.text
    parts.push(`The user selected lines ${selection.startLine}-${selection.endLine} of ${selection.file}:\n\`\`\`\n${body}\n\`\`\``)
  }

  return parts.join('\n')
}

function ProposalCard({
  path,
  before,
  content,
  exists,
  onAccept,
  onReject,
}: {
  path: string
  before: string
  content: string
  exists: boolean
  onAccept: () => void
  onReject: () => void
}) {
  const lines = useMemo(() => diffLines(before, content), [before, content])
  const { added, removed } = diffStat(lines)
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-2.5">
      <div className="flex items-center gap-2">
        <FileCode2 className="size-3.5 shrink-0 text-violet-300" />
        <span className="truncate font-mono text-[12px] text-foreground">{path}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {exists ? 'update' : 'new file'}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-emerald-400">+{added}</span>
        <span className="shrink-0 font-mono text-[10px] text-red-400">−{removed}</span>
      </div>
      <div className="max-h-56 overflow-auto rounded-md border border-border/50 bg-background/60 font-mono text-[11px] leading-[1.5]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-pre px-2',
              line.type === 'add' && 'bg-emerald-500/10 text-emerald-300',
              line.type === 'remove' && 'bg-red-500/10 text-red-300',
              line.type === 'same' && 'text-muted-foreground',
            )}
          >
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            {line.text || ' '}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReject}>
          Reject
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={onAccept}>
          Accept
        </Button>
      </div>
    </div>
  )
}

export default function AiPanel({ signedIn, onSignIn, onClose, selection }: AiPanelProps) {
  const { state, dispatch } = useWorkspace()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<(ProposedEdit & { id: number })[]>([])
  const proposalSeq = useRef(0)
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Backend selection
  const [backend, setBackend] = useState<Backend>('openrouter')
  const [opencodeConnected, setOpencodeConnected] = useState<boolean | null>(null)
  const [bridgeConnected, setBridgeConnected] = useState<boolean | null>(null)
  const [opencodeSessionId, setOpencodeSessionId] = useState<string | null>(null)
  const [providers, setProviders] = useState<OpencodeProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [models, setModels] = useState<Record<DirectProvider, string>>({ ...DEFAULT_MODEL })
  const [keyInput, setKeyInput] = useState('')
  const [keyTick, setKeyTick] = useState(0)

  // Check opencode availability on mount
  useEffect(() => {
    isBridgeAvailable().then(setBridgeConnected)
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

  const directProvider: DirectProvider | null = isDirect(backend) ? backend : null
  const directKey = useMemo(
    () => (directProvider ? getApiKey(directProvider) : null),
    [directProvider, keyTick],
  )

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
      if (directProvider) {
        await streamDirect(
          directProvider,
          nextMessages,
          buildSystemPrompt(state.projectName, state.files, state.activeFile, selectionRef.current),
          (piece) => {
            acc += piece
            setDraft(acc)
          },
          { model: models[directProvider] },
        )
      } else if (backend === 'claude') {
        await streamClaude(
          nextMessages,
          buildSystemPrompt(state.projectName, state.files, state.activeFile, selectionRef.current),
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
          buildOpencodePrompt(state.projectName, state.files, state.activeFile, selectionRef.current),
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
      if (backend !== 'opencode') {
        const edits = parseEdits(acc, state.files)
        if (edits.length) {
          setProposals((prev) => [
            ...prev,
            ...edits.map((e) => ({ ...e, id: ++proposalSeq.current })),
          ])
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

  function applyProposal(p: ProposedEdit) {
    dispatch(p.exists ? { type: 'SET_FILE', path: p.path, content: p.content } : { type: 'ADD_FILE', path: p.path, content: p.content })
    dispatch({ type: 'SET_ACTIVE', path: p.path })
  }

  function acceptProposal(id: number) {
    const p = proposals.find((x) => x.id === id)
    if (!p) return
    applyProposal(p)
    setProposals((prev) => prev.filter((x) => x.id !== id))
  }

  function rejectProposal(id: number) {
    setProposals((prev) => prev.filter((x) => x.id !== id))
  }

  function acceptAllProposals() {
    for (const p of proposals) applyProposal(p)
    setProposals([])
  }

  function reset() {
    setMessages([])
    setDraft('')
    setError(null)
    setProposals([])
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
    setProposals([])
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
          <div className="flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
            {BACKENDS.map((b) => {
              const missingKey = isDirect(b.id) && !getApiKey(b.id)
              return (
                <button
                  key={b.id}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    backend === b.id ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => switchBackend(b.id)}
                >
                  {b.label}
                  {b.id === 'opencode' && (
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
                  {missingKey && (
                    <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-400 align-middle" title="API key needed" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Per-backend config */}
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-2.5">
          <p className="text-[11px] leading-4 text-muted-foreground">{endpointFor(backend)}</p>

          {backend === 'opencode' &&
            (opencodeConnected === false ? (
              <p className="text-xs text-muted-foreground">
                opencode server not detected. Run <code className="rounded bg-muted px-1 font-mono">npm run dev:opencode</code>
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
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
              </div>
            ))}

          {backend === 'opencode' && opencodeConnected && bridgeConnected === false && (
            <p className="text-[11px] text-amber-400">
              File sync unavailable — the agent can chat but can't edit files. Run{' '}
              <code className="rounded bg-muted px-1 font-mono">npm run dev:bridge</code>.
            </p>
          )}

          {directProvider && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-muted-foreground">Model</label>
                <select
                  className="h-8 w-auto max-w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={models[directProvider]}
                  onChange={(e) => setModels((prev) => ({ ...prev, [directProvider]: e.target.value }))}
                >
                  {PROVIDER_MODELS[directProvider].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              {directKey ? (
                <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5">
                  <span className="text-[11px] text-emerald-400">API key saved in this browser</span>
                  <button
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => {
                      clearApiKey(directProvider)
                      setKeyTick((t) => t + 1)
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={DIRECT_INFO[directProvider].placeholder}
                    className="h-8 flex-1 font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!keyInput.trim()}
                    onClick={() => {
                      setApiKey(directProvider, keyInput.trim())
                      setKeyInput('')
                      setKeyTick((t) => t + 1)
                    }}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

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
                    {hintFor(backend)}
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
                    {m.role === 'user' ? m.content : stripEditBlocks(m.content) || m.content}
                  </div>
                ))}
                {draft && (
                  <div className="self-start max-w-[90%] whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-[13px] leading-relaxed break-words">
                    {backend === 'opencode' ? draft : stripEditBlocks(draft) || draft}
                    <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-emerald-400 align-text-bottom" />
                  </div>
                )}
                {error && <p className="px-1 text-xs text-destructive">{error}</p>}
                {proposals.length > 0 && (
                  <div className="mt-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Proposed changes ({proposals.length})
                      </span>
                      {proposals.length > 1 && (
                        <button
                          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          onClick={acceptAllProposals}
                        >
                          Accept all
                        </button>
                      )}
                    </div>
                    {proposals.map((p) => (
                      <ProposalCard
                        key={p.id}
                        path={p.path}
                        exists={p.exists}
                        before={state.files[p.path] ?? ''}
                        content={p.content}
                        onAccept={() => acceptProposal(p.id)}
                        onReject={() => rejectProposal(p.id)}
                      />
                    ))}
                  </div>
                )}
                {proposals.length === 0 &&
                  directProvider &&
                  !busy &&
                  !error &&
                  messages.length > 0 &&
                  messages[messages.length - 1].role === 'assistant' && (
                    <div className="flex justify-start px-1">
                      <button
                        className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-violet-400/50 hover:text-foreground"
                        onClick={() =>
                          send('Please output each file you want to change as a complete ```edit:path/to/file fenced block so I can review and accept it.')
                        }
                        title="Some models need a nudge to emit reviewable file changes"
                      >
                        No file changes detected — ask for edit format
                      </button>
                    </div>
                  )}
                <div ref={endRef} />
              </div>
            </ScrollArea>

            {selection && selection.text && (
              <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {selection.file}:{selection.startLine}
                  {selection.endLine !== selection.startLine ? `-${selection.endLine}` : ''}
                </span>
                <span className="truncate">selection included in your next message</span>
              </div>
            )}

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
