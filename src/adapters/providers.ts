// Bring-your-own-key chat transports: browser -> provider directly.
// Keys live only in this browser (localStorage). No server, no proxy.
import { K, readKey, writeKey, removeKey } from '../lib/storage-keys';

export type DirectProvider = 'openrouter' | 'anthropic' | 'chatgpt';

export const PROVIDER_MODELS: Record<DirectProvider, string[]> = {
  openrouter: ['google/gemini-2.5-flash', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5-mini'],
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
  chatgpt: ['gpt-4o-mini', 'gpt-4.1-mini'],
};

export const PROVIDER_DEFAULT_MODEL: Record<DirectProvider, string> = {
  openrouter: 'google/gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-5',
  chatgpt: 'gpt-4o-mini',
};

export const PROVIDER_LABEL: Record<DirectProvider, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Claude',
  chatgpt: 'ChatGPT',
};

const PROVIDER_KEY: Record<DirectProvider, string> = {
  openrouter: K.openrouterKey,
  anthropic: K.anthropicKey,
  chatgpt: K.chatgptKey,
};

export function getProviderKey(p: DirectProvider): string | null {
  return readKey(PROVIDER_KEY[p]);
}

export function setProviderKey(p: DirectProvider, key: string): void {
  writeKey(PROVIDER_KEY[p], key);
}

export function clearProviderKey(p: DirectProvider): void {
  removeKey(PROVIDER_KEY[p]);
}

// Deploy key (Vercel personal token, BYOK like the chat keys).
export function getVercelToken(): string | null {
  return readKey(K.vercelKey);
}

export function setVercelToken(key: string): void {
  writeKey(K.vercelKey, key);
}

export function clearVercelToken(): void {
  removeKey(K.vercelKey);
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

type DeltaHandler = (piece: string) => void;

export interface ProviderImage {
  mime: string;
  base64: string;
}

/** Attach images to the last user message, OpenAI-style parts. */
function withOpenAIImages(
  messages: Array<{ role: string; content: string }>,
  images: ProviderImage[],
): Array<{ role: string; content: unknown }> {
  if (images.length === 0) return messages;
  const out = messages.map((m) => ({ role: m.role, content: m.content as unknown }));
  const target = [...out].reverse().find((m) => m.role === 'user') ?? out[out.length - 1];
  if (!target) return out;
  const text = typeof target.content === 'string' ? target.content : '';
  target.content = [
    { type: 'text', text },
    ...images
      .filter((i) => i.base64)
      .map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime || 'image/jpeg'};base64,${i.base64}` } })),
  ];
  return out;
}

/** Attach images to the last user message, Anthropic-style blocks. */
function withAnthropicImages(
  messages: Array<{ role: string; content: string }>,
  images: ProviderImage[],
): Array<{ role: string; content: unknown }> {
  if (images.length === 0) return messages;
  const out = messages.map((m) => ({ role: m.role, content: m.content as unknown }));
  const target = [...out].reverse().find((m) => m.role === 'user') ?? out[out.length - 1];
  if (!target) return out;
  const text = typeof target.content === 'string' ? target.content : '';
  target.content = [
    { type: 'text', text },
    ...images
      .filter((i) => i.base64)
      .map((i) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: i.base64 } })),
  ];
  return out;
}

async function consumeSse(res: Response, onDelta: (text: string) => void): Promise<void> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string }; message?: string };
      if (body?.error?.message) detail = body.error.message;
      else if (typeof body?.error === 'string') detail = body.error;
      else if (body?.message) detail = body.message;
    } catch {
      /* non-json error body */
    }
    throw new Error(detail);
  }
  if (!res.body) throw new Error('Stream unavailable');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          type?: string;
          delta?: { text?: string };
        };
        const piece =
          json.choices?.[0]?.delta?.content ??
          (json.type === 'content_block_delta' ? json.delta?.text : undefined);
        if (piece) onDelta(piece);
      } catch {
        /* partial line — skip */
      }
    }
  }
}

function toHistory(messages: ChatMsg[]): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

export async function streamOpenRouter(
  messages: ChatMsg[],
  system: string,
  onDelta: DeltaHandler,
  model: string,
  images: ProviderImage[] = [],
): Promise<void> {
  const key = getProviderKey('openrouter');
  if (!key) throw new Error('Add an OpenRouter API key first (account settings).');
  await consumeSse(
    await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://zut.dev',
        'X-Title': 'zut IDE',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: withOpenAIImages([{ role: 'system', content: system }, ...toHistory(messages)], images),
        stream: true,
      }),
    }),
    onDelta,
  );
}

export async function streamAnthropic(
  messages: ChatMsg[],
  system: string,
  onDelta: DeltaHandler,
  model: string,
  images: ProviderImage[] = [],
): Promise<void> {
  const key = getProviderKey('anthropic');
  if (!key) throw new Error('Add an Anthropic API key first (account settings).');
  await consumeSse(
    await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: withAnthropicImages(messages.map((m) => ({ role: m.role, content: m.content })), images),
        stream: true,
      }),
    }),
    onDelta,
  );
}

export async function streamChatGPT(messages: ChatMsg[], system: string, onDelta: DeltaHandler, model: string, images: ProviderImage[] = []): Promise<void> {
  const key = getProviderKey('chatgpt');
  if (!key) throw new Error('Add an OpenAI API key first (account settings).');
  await consumeSse(
    await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: withOpenAIImages([{ role: 'system', content: system }, ...toHistory(messages)], images), stream: true }),
    }),
    onDelta,
  );
}

export async function streamProvider(
  provider: DirectProvider,
  messages: ChatMsg[],
  system: string,
  onDelta: DeltaHandler,
  model?: string,
  images: ProviderImage[] = [],
): Promise<void> {
  const m = model ?? PROVIDER_DEFAULT_MODEL[provider];
  if (provider === 'openrouter') return streamOpenRouter(messages, system, onDelta, m, images);
  if (provider === 'anthropic') return streamAnthropic(messages, system, onDelta, m, images);
  return streamChatGPT(messages, system, onDelta, m, images);
}
