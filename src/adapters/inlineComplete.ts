// Inline completion: the ghost text you accept with Tab.
//
// It talks straight to the provider you already have a key for (the same
// browser-stored keys the chat uses), so nothing is proxied through us and
// no code leaves the browser except the snippet we send for context.

import { getProviderKey, PROVIDER_DEFAULT_MODEL, type DirectProvider } from './providers';

export interface InlineContext {
  path: string;
  language: string;
  /** Code before the cursor. */
  prefix: string;
  /** Code after the cursor. */
  suffix: string;
  signal?: AbortSignal;
}

const MODELS: Record<DirectProvider, string> = {
  openrouter: 'deepseek/deepseek-chat',
  anthropic: 'claude-haiku-4-5',
  chatgpt: 'gpt-4o-mini',
};

/** A provider we have a key for, best first. */
export function completionProvider(): DirectProvider | null {
  for (const p of ['openrouter', 'anthropic', 'chatgpt'] as DirectProvider[]) {
    if (getProviderKey(p)) return p;
  }
  return null;
}

function systemPrompt(): string {
  return [
    'You are a code completion engine inside a code editor.',
    'Reply with the code that continues at the cursor, and nothing else.',
    'No explanation, no markdown fences, no repetition of the code before the cursor.',
    'If the code should stop at the end of the current line or block, stop there.',
  ].join(' ');
}

function userPrompt(ctx: InlineContext): string {
  return [
    `File: ${ctx.path}`,
    `Language: ${ctx.language}`,
    '',
    'Code before the cursor:',
    '```' + ctx.language,
    ctx.prefix,
    '```',
    '',
    'Code after the cursor:',
    '```' + ctx.language,
    ctx.suffix,
    '```',
    '',
    'Continue the code at the cursor:',
  ].join('\n');
}

/** Trims a model reply down to the code it wants to insert. */
export function cleanCompletion(text: string): string {
  let out = text.trim();
  // Models like to wrap the answer in a fence.
  const fence = /```[a-zA-Z0-9]*\n?([\s\S]*?)```/.exec(out);
  if (fence) out = fence[1].trim();
  // ...or to repeat the prefix.
  return out;
}

/** One completion for the cursor position. Empty string when there is none. */
export async function completeInline(ctx: InlineContext): Promise<string> {
  const provider = completionProvider();
  if (!provider) return '';
  const key = getProviderKey(provider);
  if (!key) return '';
  const model = MODELS[provider] ?? PROVIDER_DEFAULT_MODEL[provider];
  const body = userPrompt(ctx);

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: ctx.signal,
      body: JSON.stringify({
        model,
        max_tokens: 256,
        system: systemPrompt(),
        messages: [{ role: 'user', content: body }],
      }),
    });
    if (!res.ok) return '';
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return cleanCompletion((json.content ?? []).map((c) => c.text ?? '').join(''));
  }

  const endpoint =
    provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(provider === 'openrouter'
        ? {
            'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://zut.dev',
            'X-Title': 'zut IDE',
          }
        : {}),
    },
    signal: ctx.signal,
    body: JSON.stringify({
      model,
      max_tokens: 256,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: body },
      ],
    }),
  });
  if (!res.ok) return '';
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return cleanCompletion(json.choices?.[0]?.message?.content ?? '');
}
