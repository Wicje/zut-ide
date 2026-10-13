// P0 secrets hygiene: keys live in this browser only (BYOK), so the UI must
// never echo them into logs/previews, and the user needs one "remove all"
// escape hatch. Storage keys use the `gpide:` prefix (see providers,
// gemini, connectors); legacy `zut:` prefixes are swept too.

import { clearProviderKey, clearVercelToken } from '../adapters/providers';
import { clearConnectorKey, type ConnectorId } from './connectors';

const SWEPT_PREFIXES = [
  'gpide:key:',
  'gpide:gemini:',
  'gpide:connector:',
  'gpide:supabase',
  'gpide:cloudinary',
  'zut:ai:key:',
];

const REDACTIONS: Array<[RegExp, string]> = [
  // OpenAI / OpenRouter / Anthropic-style secret keys.
  [/\bsk-[A-Za-z0-9-_]{8,}\b/g, 'sk-…redacted'],
  // GitHub tokens.
  [/\b(ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9-_]{8,})\b/g, 'ghp-…redacted'],
  // Generic bearer tokens in pasted output.
  [/\bBearer\s+[A-Za-z0-9-_.~+/=]{12,}\b/g, 'Bearer …redacted'],
  // JWTs (Supabase anon keys included).
  [/\beyJ[A-Za-z0-9-_]{8,}\.[A-Za-z0-9-_]{8,}\.[A-Za-z0-9-_]{8,}/g, 'eyJ…redacted'],
];

/** Strip key-like values from log/console/event text before render. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}

const CONNECTORS: ConnectorId[] = ['vercel', 'github', 'cloudinary', 'supabase', 'pexels'];

/**
 * Remove every browser-stored credential. Returns the removed storage keys.
 * Also refreshes the typed clear-fns so in-memory fallbacks are dropped.
 */
export function revokeAllLocalKeys(): string[] {
  const removed: string[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (SWEPT_PREFIXES.some((p) => k === p || k.startsWith(p))) {
        localStorage.removeItem(k);
        removed.push(k);
      }
    }
  } catch {
    /* private mode — typed clears below still run */
  }
  for (const p of ['openrouter', 'anthropic', 'chatgpt'] as const) {
    try {
      clearProviderKey(p);
    } catch {
      /* ignore */
    }
  }
  try {
    clearVercelToken();
  } catch {
    /* ignore */
  }
  for (const c of CONNECTORS) {
    try {
      clearConnectorKey(c);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem('gpide:gemini:key');
    removed.push('gpide:gemini:key');
  } catch {
    /* ignore */
  }
  return [...new Set(removed)];
}
