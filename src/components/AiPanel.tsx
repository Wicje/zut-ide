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

  return (
    <aside className="ai-panel">
      <div className="ai-head">
        <strong>zut AI</strong>
        <div className="ai-head-actions">
          <button className="icon-btn" title="Clear chat" onClick={reset}>🗑</button>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Backend selector */}
      <div className="ai-backend-row">
        <button
          className={`ai-backend-btn ${backend === 'claude' ? 'active' : ''}`}
          onClick={() => switchBackend('claude')}
        >
          Claude
        </button>
        <button
          className={`ai-backend-btn ${backend === 'opencode' ? 'active' : ''}`}
          onClick={() => switchBackend('opencode')}
        >
          opencode
          {opencodeConnected === true && <span className="ai-status-dot connected" />}
          {opencodeConnected === false && <span className="ai-status-dot disconnected" />}
        </button>
      </div>

      {/* opencode provider/model selectors */}
      {backend === 'opencode' && (
        <div className="ai-opencode-config">
          {opencodeConnected === false ? (
            <div className="ai-empty">
              <p>opencode server not detected.</p>
              <code>npm run dev:opencode</code>
            </div>
          ) : (
            <>
              <select
                className="ai-select"
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
                  className="ai-select"
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

      {!signedIn && backend === 'claude' ? (
        <div className="ai-empty">
          <p>Sign in to chat with Claude about your code.</p>
          <button className="btn primary" onClick={onSignIn}>Sign in</button>
        </div>
      ) : (
        <>
          <div className="ai-messages">
            {messages.length === 0 && !draft && (
              <p className="ai-empty">
                {backend === 'claude'
                  ? 'Ask anything about your project — "explain this code", "add a dark mode", "why is my layout broken?".'
                  : 'Ask the AI to read, edit, or analyze your code. opencode has full file and shell access.'}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {draft && <div className="ai-msg assistant">{draft}<span className="ai-cursor">▍</span></div>}
            {error && <p className="form-error">{error}</p>}
            <div ref={endRef} />
          </div>
          <form
            className="ai-input"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? 'Thinking…' : 'Message the AI…'}
              disabled={busy}
            />
            <button type="submit" className="btn primary" disabled={busy || !input.trim()}>
              ➤
            </button>
          </form>
        </>
      )}
    </aside>
  )
}
