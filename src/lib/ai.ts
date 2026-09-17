import type { ChatMessage } from './hosting'

export type DirectProvider = 'chatgpt' | 'gemini'

export const CHATGPT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] as const
export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] as const

export const DEFAULT_MODEL: Record<DirectProvider, string> = {
  chatgpt: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
}

function keyStorage(provider: DirectProvider): string {
  return `zut:ai:key:${provider}`
}

export function getApiKey(provider: DirectProvider): string | null {
  try {
    return localStorage.getItem(keyStorage(provider))
  } catch {
    return null
  }
}

export function setApiKey(provider: DirectProvider, key: string): void {
  try {
    localStorage.setItem(keyStorage(provider), key)
  } catch {
    /* storage unavailable — key won't persist */
  }
}

export function clearApiKey(provider: DirectProvider): void {
  try {
    localStorage.removeItem(keyStorage(provider))
  } catch {
    /* ignore */
  }
}

type DeltaHandler = (piece: string) => void

interface SseMessage {
  error?: { message?: string; type?: string }
}

/** Consume an SSE stream from a raw fetch response, invoking `onLine` for each
 *  parsed `data:` JSON payload. Resilient across partial chunk boundaries. */
async function consumeSse(
  res: Response,
  onLine: (json: SseMessage) => void,
): Promise<void> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = body.error.message
    } catch {
      /* non-json error body */
    }
    throw new Error(detail)
  }
  if (!res.body) throw new Error('Stream unavailable')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        onLine(JSON.parse(payload) as SseMessage)
      } catch {
        /* partial/fragmented line — skip */
      }
    }
  }
}

function toOpenAiHistory(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  // OpenAI doesn't accept consecutive same-role messages; merge adjacent turns.
  const out: Array<{ role: string; content: string }> = []
  for (const m of messages) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content += '\n' + m.content
    else out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })
  }
  return out
}

export async function streamChatGPT(
  messages: ChatMessage[],
  system: string,
  onDelta: DeltaHandler,
  opts: { model: string },
): Promise<void> {
  const key = getApiKey('chatgpt')
  if (!key) throw new Error('Add an OpenAI API key to chat with ChatGPT.')

  await consumeSse(
    await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: 'system', content: system }, ...toOpenAiHistory(messages)],
        stream: true,
      }),
    }),
    (json) => {
      const piece = (json as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content
      if (piece) onDelta(piece)
    },
  )
}

export async function streamGemini(
  messages: ChatMessage[],
  system: string,
  onDelta: DeltaHandler,
  opts: { model: string },
): Promise<void> {
  const key = getApiKey('gemini')
  if (!key) throw new Error('Add a Gemini API key to chat with Gemini.')

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`
  await consumeSse(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
      }),
    }),
    (json) => {
      const candidates = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
      const piece = candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
      if (piece) onDelta(piece)
    },
  )
}