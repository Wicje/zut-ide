// Single source of truth for localStorage keys.
//
// Canonical namespace: `zut:*` (the public product name). The older `gpide:*`
// keys are a legacy namespace from a previous rename; they are migrated to
// `zut:*` on first load and then removed. Readers use `readKey` so the first
// load is safe even before migration has run, and writers only write the
// canonical key.
//
// This module exists so the repo stops mixing `gpide:*` and `zut:*` for the
// same kinds of state (draft, snapshots, sessions, rules, usage, agent mode,
// opencode model, AI completion, step ratings, wallpaper, host config,
// provider/connector keys, mud auth) — the shape of a rewrite living next to
// an older app.
//
// The only `gpide:*` strings in the codebase live here, in the migration map
// (PAIRS). They are not active storage contracts — every reader/writer uses a
// `zut:*` key from `K`. Keep them here so the migration and the revoke path
// both know which legacy keys exist; remove this file's `gpide:*` entries
// once no browser still carries those keys.

/** Canonical `zut:*` keys. Every persisted value is read/written through one of these. */
export const K = {
  // App / workspace
  workspaceSource: 'zut:workspace-source',
  agentMode: 'zut:agent-mode',
  host: 'zut:host:v1',
  opencodeModel: 'zut:opencode-model',
  guestAccess: 'zut:guest-access',
  recentProjects: 'zut:recent-projects',
  recentModels: 'zut:recent-models',
  stepRatings: 'zut:step-ratings',
  aiComplete: 'zut:ai-complete',
  // Wallpaper
  wallpaper: 'zut:wallpaper',
  wallpaperChoice: 'zut:wallpaper-choice',
  wallpaperCustom: 'zut:wallpaper-custom',
  // Crash telemetry (local only)
  lastCrash: 'zut:last-crash',
  // Agent local state (adapters/zut)
  draft: 'zut:draft',
  snapshots: 'zut:snapshots',
  sessions: 'zut:sessions',
  agentUse: 'zut:agent-use',
  rules: 'zut:rules',
  // Provider / connector credentials (BYOK, browser-only)
  geminiKey: 'zut:gemini:key',
  openrouterKey: 'zut:key:openrouter',
  anthropicKey: 'zut:key:anthropic',
  chatgptKey: 'zut:key:chatgpt',
  vercelKey: 'zut:key:vercel',
  connectorGithub: 'zut:connector:github',
  connectorCloudinary: 'zut:connector:cloudinary',
  connectorSupabase: 'zut:connector:supabase',
  connectorPexels: 'zut:connector:pexels',
  // Mudbase auth session (sign-in — revoke must NOT touch these)
  mudToken: 'zut:mud:token',
  mudRefresh: 'zut:mud:refresh',
  mudExp: 'zut:mud:exp',
  mudUser: 'zut:mud:user',
} as const;

// ---- Migration map -------------------------------------------------------
// Each entry maps a legacy `gpide:*` key to its canonical `zut:*` counterpart.
// `canonical: null` marks a stale legacy key that has no current canonical home
// (removed by migration without a copy — e.g. bare `gpide:supabase` that older
// code wrote before the connector layer normalised the key shape).

const PAIRS: Array<{ canonical: string | null; legacy: string }> = [
  { canonical: K.draft, legacy: 'gpide:draft' },
  { canonical: K.snapshots, legacy: 'gpide:snapshots' },
  { canonical: K.sessions, legacy: 'gpide:sessions' },
  { canonical: K.agentUse, legacy: 'gpide:agent-use' },
  { canonical: K.rules, legacy: 'gpide:rules' },
  { canonical: K.geminiKey, legacy: 'gpide:gemini:key' },
  { canonical: K.openrouterKey, legacy: 'gpide:key:openrouter' },
  { canonical: K.anthropicKey, legacy: 'gpide:key:anthropic' },
  { canonical: K.chatgptKey, legacy: 'gpide:key:chatgpt' },
  { canonical: K.vercelKey, legacy: 'gpide:key:vercel' },
  { canonical: K.connectorGithub, legacy: 'gpide:connector:github' },
  { canonical: K.connectorCloudinary, legacy: 'gpide:connector:cloudinary' },
  { canonical: K.connectorSupabase, legacy: 'gpide:connector:supabase' },
  { canonical: K.connectorPexels, legacy: 'gpide:connector:pexels' },
  { canonical: K.mudToken, legacy: 'gpide:mud:token' },
  { canonical: K.mudRefresh, legacy: 'gpide:mud:refresh' },
  { canonical: K.mudExp, legacy: 'gpide:mud:exp' },
  { canonical: K.mudUser, legacy: 'gpide:mud:user' },
  // Stale legacy keys with no canonical home (removed by migration only).
  { canonical: null, legacy: 'gpide:supabase' },
  { canonical: null, legacy: 'gpide:cloudinary' },
  { canonical: null, legacy: 'gpide:connector:vercel' },
];

/** Legacy key → canonical key (or null for stale-only legacy keys). */
const LEGACY_TO_CANONICAL: Record<string, string | null> = Object.fromEntries(
  PAIRS.map((p) => [p.legacy, p.canonical]),
);

/** Canonical key → legacy key, for the keys that actually have a legacy counterpart. */
const CANONICAL_TO_LEGACY: Record<string, string> = Object.fromEntries(
  PAIRS.filter((p) => p.canonical !== null).map((p) => [p.canonical!, p.legacy]),
);

/**
 * Copy any legacy `gpide:*` value into its canonical `zut:*` key (once), then
 * remove the legacy key. Unknown `gpide:*` keys (not in the map) are removed
 * without a copy. Safe to call many times — it only copies when the canonical
 * key is empty, and it is a no-op in private mode.
 */
export function migrateStorage(): void {
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gpide:')) legacyKeys.push(k);
    }
    for (const legacy of legacyKeys) {
      const canonical = LEGACY_TO_CANONICAL[legacy] ?? null;
      const value = localStorage.getItem(legacy);
      if (canonical && value !== null) {
        try {
          localStorage.setItem(canonical, value);
        } catch {
          /* private mode — leave the legacy value in place */
        }
      }
      try {
        localStorage.removeItem(legacy);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* private mode */
  }
}

// ---- Helpers -------------------------------------------------------------

// In-memory fallback for private browsing / environments where localStorage is
// unavailable or throws. Mirrors the old per-module store() fallbacks so the
// same code works in the browser, in private mode, and in Node test runners
// that do not expose localStorage (vitest without --localstorage-file).
const memFallback = new Map<string, string>();

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): boolean {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

/** Read a value, trying the canonical key first and falling back to a legacy key,
 *  then to the in-memory fallback when localStorage is unavailable. */
export function readStorage(canonical: string, legacy?: string): string | null {
  const v = lsGet(canonical);
  if (v != null) return v;
  if (legacy) {
    const lv = lsGet(legacy);
    if (lv != null) return lv;
  }
  const mfCanonical = memFallback.get(canonical);
  if (mfCanonical != null) return mfCanonical;
  if (legacy) {
    const mfLegacy = memFallback.get(legacy);
    if (mfLegacy != null) return mfLegacy;
  }
  return null;
}

/** Write a value to the canonical key (and the in-memory fallback when
 *  localStorage is unavailable). */
export function writeStorage(canonical: string, value: string): void {
  if (!lsSet(canonical, value)) memFallback.set(canonical, value);
}

/** Remove both the canonical key and its legacy counterpart (if any), from
 *  localStorage and the in-memory fallback. */
export function removeStorage(canonical: string, legacy?: string): void {
  try { localStorage.removeItem(canonical); } catch { /* ignore */ }
  memFallback.delete(canonical);
  if (legacy) {
    try { localStorage.removeItem(legacy); } catch { /* ignore */ }
    memFallback.delete(legacy);
  }
}

/** Read via the canonical key, falling back to the known legacy key for it. */
export function readKey(canonical: string): string | null {
  return readStorage(canonical, CANONICAL_TO_LEGACY[canonical]);
}

/** Write to the canonical key only. */
export function writeKey(canonical: string, value: string): void {
  writeStorage(canonical, value);
}

/** Remove the canonical key and its legacy counterpart (if any). */
export function removeKey(canonical: string): void {
  removeStorage(canonical, CANONICAL_TO_LEGACY[canonical]);
}
