// broker/cells.mjs — the ONLY file that speaks Cells.
// Every Cells API assumption lives here behind env, so going live (or
// correcting a path after the first real call) never touches the server.
//
// Env:
//   CELLS_API_KEY          required for live; absent = local demo runs
//   CELLS_BASE_URL         default https://api.mudbase.dev
//   CELLS_DEFAULT_SIZE     micro | small | standard (default micro)
//   CELLS_AUTOSUSPEND_MIN  idle minutes before suspend (default 5)
//   CELLS_TIMEOUT_MS       exec cap (default 8000)
//   CELLS_MAX_OUTPUT       stdout+stderr cap bytes (default 262144)
//   CELLS_ENDPOINT_*       override any single path template below.
//                          Templates accept {base}, {sessionId}, {port}.
//
// VERIFY (first live run): default path templates are derived from the
// blueprint vocabulary (sessions / files / exec / services / expose /
// tokens / usage), not from a published spec — docs.mudbase.dev is a stub.
// If a call 404s, set the matching CELLS_ENDPOINT_* override. No code change.

import { batchEntries, cleanRelPath, diffFiles, hashFile } from './lib.mjs'

export const CELLS_DEFAULTS = {
  baseUrl: 'https://api.mudbase.dev',
  size: 'micro',
  autosuspendMin: 5,
  timeoutMs: 8000,
  maxOutput: 256 * 1024,
  syncBatch: 200,
}

export function cellsConfigured(env = process.env) {
  return Boolean(env.CELLS_API_KEY)
}

export function cellsConfig(env = process.env) {
  const base = (env.CELLS_BASE_URL ?? CELLS_DEFAULTS.baseUrl).replace(/\/+$/, '')
  const fill = (t) => t.replace('{base}', base)
  return {
    key: env.CELLS_API_KEY ?? '',
    baseUrl: base,
    size: env.CELLS_DEFAULT_SIZE ?? CELLS_DEFAULTS.size,
    autosuspendMin: Number(env.CELLS_AUTOSUSPEND_MIN ?? CELLS_DEFAULTS.autosuspendMin),
    timeoutMs: Number(env.CELLS_TIMEOUT_MS ?? CELLS_DEFAULTS.timeoutMs),
    maxOutput: Number(env.CELLS_MAX_OUTPUT ?? CELLS_DEFAULTS.maxOutput),
    syncBatch: CELLS_DEFAULTS.syncBatch,
    // VERIFY per template on first live run.
    epSessions: fill(env.CELLS_ENDPOINT_SESSIONS ?? '{base}/api/cells/sessions'),
    epSession: fill(env.CELLS_ENDPOINT_SESSION ?? '{base}/api/cells/sessions/{sessionId}'),
    epFiles: fill(env.CELLS_ENDPOINT_FILES ?? '{base}/api/cells/sessions/{sessionId}/files'),
    epExec: fill(env.CELLS_ENDPOINT_EXEC ?? '{base}/api/cells/sessions/{sessionId}/exec'),
    epStop: fill(env.CELLS_ENDPOINT_STOP ?? '{base}/api/cells/sessions/{sessionId}/stop'),
    epTokens: fill(env.CELLS_ENDPOINT_TOKENS ?? '{base}/api/cells/sessions/{sessionId}/tokens'),
    epServices: fill(env.CELLS_ENDPOINT_SERVICES ?? '{base}/api/cells/sessions/{sessionId}/services'),
    epExpose: fill(env.CELLS_ENDPOINT_EXPOSE ?? '{base}/api/cells/sessions/{sessionId}/expose?port={port}'),
    epUsage: fill(env.CELLS_ENDPOINT_USAGE ?? '{base}/api/cells/usage?sessionId={sessionId}'),
  }
}

async function cellsFetch(cfg, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}`, ...(init.headers ?? {}) },
    signal: init.signal,
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { error: text.slice(0, 500) } }
  if (!res.ok) {
    const err = new Error(json?.error ?? json?.message ?? `Cells request failed (${res.status} ${url})`)
    err.status = res.status
    err.url = url
    throw err
  }
  return json
}

/** Hash-diff the FileMap against last-synced hashes; batch ≤200 per write. */
export function planSync(files, hashes, batchSize = CELLS_DEFAULTS.syncBatch) {
  const wanted = diffFiles(files, hashes ?? {}).filter((p) => cleanRelPath(p))
  return batchEntries(wanted, batchSize)
}

export function createCellsDriver(cfg) {
  const mem = { sessions: new Map() } // externalId -> sessionId (process cache)
  return {
    kind: 'cells',

    async ensureSession({ externalId, size }) {
      if (mem.sessions.has(externalId)) return { sessionId: mem.sessions.get(externalId), reused: true }
      // externalId = workspace id: a double-click cannot create two.
      const body = await cellsFetch(cfg, cfg.epSessions, {
        method: 'POST',
        body: JSON.stringify({
          externalId,
          size: size ?? cfg.size,
          autoSuspendMinutes: cfg.autosuspendMin,
        }),
      })
      const id = body?.id ?? body?.sessionId ?? body?.session?.id
      if (!id) throw new Error(`Cells did not return a session id (POST ${cfg.epSessions}). Set CELLS_ENDPOINT_SESSIONS if the path differs.`)
      mem.sessions.set(externalId, id)
      return { sessionId: id, reused: false }
    },

    /** Upload only changed files; returns counts + new hashes to persist. */
    async syncFiles({ sessionId, files, hashes, hashStore }) {
      const known = hashes ?? (await hashStore?.load(sessionId)) ?? {}
      const batches = planSync(files ?? {}, known, cfg.syncBatch)
      let uploaded = 0
      const next = { ...known }
      for (const batch of batches) {
        if (!batch.length) continue
        await cellsFetch(cfg, cfg.epFiles.replace('{sessionId}', encodeURIComponent(sessionId)), {
          method: 'POST',
          body: JSON.stringify({ files: batch.map((p) => ({ path: p, content: String(files[p] ?? '') })) }),
        })
        for (const p of batch) { next[p] = hashFile(files[p]); uploaded++ }
      }
      await hashStore?.save(sessionId, next)
      return { uploaded, batches: batches.filter((b) => b.length).length }
    },

    async exec({ sessionId, command, stdin, timeoutMs, signal }) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), (timeoutMs ?? cfg.timeoutMs) + 2000)
      const onAbort = () => ctrl.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const started = Date.now()
        const body = await cellsFetch(cfg, cfg.epExec.replace('{sessionId}', encodeURIComponent(sessionId)), {
          method: 'POST',
          body: JSON.stringify({ command, stdin: String(stdin ?? '').slice(0, 64 * 1024), timeoutMs: timeoutMs ?? cfg.timeoutMs }),
          signal: ctrl.signal,
        })
        return {
          stdout: String(body?.stdout ?? '').slice(0, cfg.maxOutput),
          stderr: String(body?.stderr ?? '').slice(0, cfg.maxOutput),
          exitCode: body?.exitCode ?? null,
          durationMs: body?.durationMs ?? Date.now() - started,
        }
      } finally {
        clearTimeout(t)
        signal?.removeEventListener?.('abort', onAbort)
      }
    },

    /** 60s terminal token — browser opens the gateway WebSocket direct. */
    async terminalToken({ sessionId }) {
      const body = await cellsFetch(cfg, cfg.epTokens.replace('{sessionId}', encodeURIComponent(sessionId)), {
        method: 'POST',
        body: JSON.stringify({ scope: 'terminal', ttlSec: 60 }),
      })
      if (!body?.token) throw new Error(`Cells did not return a terminal token (POST ${cfg.epTokens}).`)
      return { token: body.token, expiresInSec: body.expiresInSec ?? 60, gatewayUrl: body.gatewayUrl ?? null }
    },

    /** Start dev server via services, wait for port, expose -> iframe URL. */
    async preview({ sessionId, port, command }) {
      if (command) {
        await cellsFetch(cfg, cfg.epServices.replace('{sessionId}', encodeURIComponent(sessionId)), {
          method: 'POST',
          body: JSON.stringify({ command, port }),
        })
      }
      const body = await cellsFetch(cfg, cfg.epExpose.replace('{sessionId}', encodeURIComponent(sessionId)).replace('{port}', encodeURIComponent(String(port ?? 3000))), { method: 'GET' })
      if (!body?.url) throw new Error(`Cells did not return a preview URL (GET ${cfg.epExpose}).`)
      return { url: body.url, access: body.access === 'public' ? 'public' : 'private-token' }
    },

    async stop({ sessionId }) {
      try {
        await cellsFetch(cfg, cfg.epStop.replace('{sessionId}', encodeURIComponent(sessionId)), { method: 'POST', body: '{}' })
      } catch { /* suspend-on-idle covers failures */ }
      return { ok: true }
    },
  }
}
