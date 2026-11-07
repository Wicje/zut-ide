// P0 secrets hygiene: keys live in this browser only (BYOK), so the UI must
// never echo them into logs/previews, and the user needs one "remove all"
// escape hatch. All persisted credentials now live under the `zut:` namespace;
// revoke sweeps those canonical credential prefixes and the per-key clear funcs
// also drop their legacy `gpide:*` counterparts (migrated on first load).

import { clearProviderKey, clearVercelToken } from '../adapters/providers';
import { clearGeminiKey } from '../adapters/gemini';
import { clearConnectorKey, type ConnectorId } from './connectors';

// Canonical credential prefixes (the active `zut:` namespace). The per-key
// clear funcs (clearProviderKey / clearVercelToken / clearGeminiKey /
// clearConnectorKey) also drop their legacy `gpide:*` counterparts, so a stray
// legacy key left by an older build or another tab is still revoked.
const SWEPT_PREFIXES = [
  'zut:key:',
  'zut:gemini:key',
  'zut:connector:',
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
    clearGeminiKey();
  } catch {
    /* ignore */
  }
  return [...new Set(removed)];
}
