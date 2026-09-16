import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import { streamClaude, type ChatMessage } from '../lib/hosting'

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

export default function AiPanel({ signedIn, onSignIn, onClose }: AiPanelProps) {
  const { state } = useWorkspace()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
      await streamClaude(
        nextMessages,
        buildSystemPrompt(state.projectName, state.files, state.activeFile),
        (piece) => {
          acc += piece
          setDraft(acc)
        },
      )
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

      {!signedIn ? (
        <div className="ai-empty">
          <p>Sign in to chat with the AI assistant about your code.</p>
          <button className="btn primary" onClick={onSignIn}>Sign in</button>
        </div>
      ) : (
        <>
          <div className="ai-messages">
            {messages.length === 0 && !draft && (
              <p className="ai-empty">
                Ask anything about your project — “explain this code”, “add a dark mode”,
                “why is my layout broken?”.
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