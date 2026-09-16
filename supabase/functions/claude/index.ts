import {
  json,
  requireEnv,
  requireUser,
  serve,
} from '../_shared/hosting.ts'

interface ClaudeBody {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  system?: string
  maxTokens?: number
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, apikey, x-client-info, x-application-name, content-type',
}

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    await requireUser(request)

    const body = (await request.json().catch(() => ({}))) as ClaudeBody
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m.content) : []
    if (messages.length === 0) return json(400, { error: 'messages are required' })

    const apiKey = requireEnv('ANTHROPIC_API_KEY')
    const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5'

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(Math.max(Math.floor(body.maxTokens ?? 2048), 256), 8192),
        messages,
        system: body.system?.slice(0, 60_000) ?? 'You are zut, a helpful coding assistant.',
        stream: true,
      }),
    })

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      let message = `Claude API error (${upstream.status})`
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } }
        if (parsed.error?.message) message = parsed.error.message
      } catch {
        /* not json */
      }
      return json(upstream.status >= 500 ? 502 : 400, { error: message })
    }

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    const reader = upstream.body.getReader()

    const bodyStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        }
        try {
          let buffer = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            let newline: number
            while ((newline = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, newline)
              buffer = buffer.slice(newline + 1)
              if (!line.startsWith('data:')) continue
              try {
                const event = JSON.parse(line.slice(5).trim()) as {
                  type?: string
                  delta?: { type?: string; text?: string }
                }
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
                  emit({ text: event.delta.text })
                }
              } catch {
                /* skip malformed event */
              }
            }
          }
          emit({ done: true })
        } catch (err) {
          emit({ error: (err as { message?: string }).message ?? 'Stream interrupted' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(bodyStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...CORS,
      },
    })
  })
}