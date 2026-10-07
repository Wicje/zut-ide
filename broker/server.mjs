// zut-broker — thin run broker in front of Mudbase BaaS + Cells.
// Browser sends only the user's token + workspace id. Service keys
// (Cells API key, Mudbase project key, Supabase service_role) stay here.
//
// Routes:
//   GET  /health
//   POST /api/broker/open            { workspaceId }
//   POST /api/broker/run             { workspaceId, files, entry, stdin }
//   POST /api/broker/stop            { workspaceId }
//   POST /api/broker/terminal-token { workspaceId } -> { token, expiresInSec: 60 }
//   GET  /api/broker/preview?workspaceId=.. -> { url, access }
//   GET  /api/baas/projects  POST /api/baas/projects
//   GET  /api/baas/projects/:id  PUT  DELETE
//   POST /api/baas/share  GET /api/baas/shared/:token (public)
//
// Demo today: runs Python/Go locally (same contract as runtime/server.mjs).
// With CELLS_API_KEY set, /api/broker/run should exec inside the named Cell
// (externalId = workspaceId); the browser contract does not change.

import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { cellsConfig, cellsConfigured, createCellsDriver } from './cells.mjs'

const PORT = Number(process.env.PORT ?? process.env.ZUT_BROKER_PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'
const DATA_ROOT = path.resolve(process.env.DATA_ROOT ?? './broker-data')
const MAX_BODY = Number(process.env.ZUT_MAX_BODY ?? 8 * 1024 * 1024)
const RUN_TIMEOUT_MS = Number(process.env.ZUT_RUN_TIMEOUT_MS ?? 8000)
const RUN_MAX_OUTPUT = Number(process.env.ZUT_RUN_MAX_OUTPUT ?? 256 * 1024)
const DAILY_RUN_CAP = Number(process.env.ZUT_DAILY_RUN_CAP ?? 50)
const RATE_RUN_MIN = Number(process.env.ZUT_RATE_RUN_MIN ?? 20)
const DEV_ALLOW_ANON = (process.env.ZUT_BROKER_DEV_ALLOW_ANON ?? '') === '1'
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const CELLS_CONFIGURED = Boolean(process.env.CELLS_API_KEY)
const VERSION = '0.1.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload), ...CORS })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('Request body too large (8MB limit).')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readJson(req) {
  const raw = await readBody(req)
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { const e = new Error('Request body must be valid JSON.'); e.status = 400; throw e }
}

// ---- auth: 60s cache, Supabase-hosted verify when configured ----
const authCache = new Map()
async function verifyUser(req) {
  const h = req.headers.authorization ?? ''
  const m = h.match(/^Bearer (.+)$/)
  if (!m) { const e = new Error('Sign in required.'); e.status = 401; throw e }
  const token = m[1]
  const cached = authCache.get(token)
  if (cached && cached.exp > Date.now()) return cached.uid
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } })
    if (!r.ok) { const e = new Error('Invalid or expired session. Sign in again.'); e.status = 401; throw e }
    const j = await r.json()
    if (!j?.id) { const e = new Error('Invalid session.'); e.status = 401; throw e }
    authCache.set(token, { uid: j.id, exp: Date.now() + 60_000 })
    return j.id
  }
  if (DEV_ALLOW_ANON) {
    const uid = 'dev-user'
    authCache.set(token, { uid, exp: Date.now() + 60_000 })
    return uid
  }
  const e = new Error('Broker auth not configured (set SUPABASE_URL/ANON_KEY or ZUT_BROKER_DEV_ALLOW_ANON=1 for local demo).')
  e.status = 503
  throw e
}

// ---- rate + daily caps (in-memory; BaaS runs table is source of truth long-term) ----
const hits = new Map()
function rateOk(key, perMin) {
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  if (arr.length >= perMin) { hits.set(key, arr); return false }
  arr.push(now); hits.set(key, arr); return true
}
const daily = new Map() // uid:date -> count
function dailyCount(uid) {
  const k = `${uid}:${new Date().toISOString().slice(0, 10)}`
  return daily.get(k) ?? 0
}
function bumpDaily(uid) {
  const k = `${uid}:${new Date().toISOString().slice(0, 10)}`
  daily.set(k, dailyCount(uid) + 1)
}

// ---- demo BaaS store (file-backed; Mudbase collections replace this later) ----
function safeSeg(s, fallback = 'default') {
  const v = String(s ?? fallback)
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null
}
function projDir(uid) { return path.join(DATA_ROOT, 'projects', uid) }
function projFile(uid, id) { return path.join(projDir(uid), `${id}.json`) }
async function readProject(uid, id) {
  try { return JSON.parse(await fs.readFile(projFile(uid, id), 'utf8')) } catch { return null }
}
async function writeProject(uid, row) {
  await fs.mkdir(projDir(uid), { recursive: true })
  await fs.writeFile(projFile(uid, row.id), JSON.stringify(row), 'utf8')
}
async function listProjects(uid) {
  try {
    const names = await fs.readdir(projDir(uid))
    const out = []
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      try { out.push(JSON.parse(await fs.readFile(path.join(projDir(uid), n), 'utf8'))) } catch {}
    }
    return out.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  } catch { return [] }
}
async function findShared(token) {
  // Demo scan (small pilot). BaaS query replaces this.
  try {
    const uids = await fs.readdir(path.join(DATA_ROOT, 'projects'))
    for (const uid of uids) {
      for (const row of await listProjects(uid)) {
        if (row.share_token === token) return row
      }
    }
  } catch {}
  return null
}

// ---- program execution (demo local; Cells exec replaces internals later) ----
function cleanRelPath(p) {
  const clean = path.normalize(String(p)).replace(/\\/g, '/')
  if (clean.startsWith('/') || clean.split('/').includes('..') || clean === '' || clean === '.') return null
  if (clean.includes('\0')) return null
  return clean.replace(/^\.\//, '')
}
async function runProgram(files, entry, stdin = '') {
  const rel = cleanRelPath(entry)
  if (!rel) return { error: `Unsafe entry path: ${entry}`, status: 400 }
  const kind = rel.endsWith('.py') ? 'python' : rel.endsWith('.go') ? 'go' : null
  if (!kind) return { error: 'Only .py and .go entries are supported (main.py / main.go).', status: 400 }
  if (!(rel in files)) return { error: `Entry file "${rel}" not found.`, status: 400 }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zut-broker-'))
  try {
    for (const [name, content] of Object.entries(files)) {
      if (name === 'index.html') continue
      const c = cleanRelPath(name)
      if (!c) continue
      const full = path.join(dir, c)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, String(content ?? ''), 'utf8')
    }
    const cmd = kind === 'python' ? 'python3' : 'go'
    const args = kind === 'python' ? [rel] : ['run', rel]
    const started = Date.now()
    return await new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd: dir, timeout: RUN_TIMEOUT_MS })
      let stdout = ''
      let stderr = ''
      let truncated = false
      const push = (buf, isErr) => {
        let s = buf.toString('utf8')
        const room = RUN_MAX_OUTPUT - (stdout.length + stderr.length)
        if (room <= 0) { truncated = true; return }
        if (s.length > room) { s = s.slice(0, room); truncated = true }
        if (isErr) stderr += s; else stdout += s
      }
      child.stdout?.on('data', (d) => push(d, false))
      child.stderr?.on('data', (d) => push(d, true))
      child.on('error', (e) => resolve({ stdout, stderr: stderr + `\n[${cmd} not available: ${e.message}]`, exitCode: 127, truncated, durationMs: Date.now() - started }))
      const kill = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, RUN_TIMEOUT_MS + 1000)
      if (stdin) { try { child.stdin?.write(String(stdin).slice(0, 64 * 1024)); child.stdin?.end() } catch {} }
      else { try { child.stdin?.end() } catch {} }
      child.on('close', (code, signal) => {
        clearTimeout(kill)
        if (signal === 'SIGTERM' || signal === 'SIGKILL') resolve({ stdout, stderr: stderr + `\n[timeout after ${RUN_TIMEOUT_MS}ms]`, exitCode: 124, truncated: true, durationMs: Date.now() - started })
        else resolve({ stdout, stderr, exitCode: code ?? 1, truncated, durationMs: Date.now() - started })
      })
    })
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

const termTokens = new Map() // token -> { uid, workspaceId, exp }

// Live Cells driver (null unless CELLS_API_KEY is set; all API shapes in cells.mjs).
const CELLS = cellsConfig()
let cellsDriver = null
function driver() {
  if (!cellsDriver) cellsDriver = createCellsDriver(CELLS)
  return cellsDriver
}
/** Persisted hash state so resyncs upload only diffs (survives restarts). */
function hashStoreFor(uid, workspaceId) {
  const file = path.join(DATA_ROOT, 'sync', String(uid), String(workspaceId), 'hashes.json')
  return {
    load: async () => {
      try { return (JSON.parse(await fs.readFile(file, 'utf8'))).hashes ?? {} } catch { return {} }
    },
    save: async (_sid, hashes) => {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify({ hashes }))
    },
  }
}
function commandForEntry(entry) {
  if (entry.endsWith('.py')) return `python3 ${entry}`
  if (entry.endsWith('.go')) return `go run ${entry}`
  return null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return }

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { ok: true, service: 'zut-broker', version: VERSION, cells: CELLS_CONFIGURED, runners: ['python', 'go'], auth: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) || DEV_ALLOW_ANON })
    return
  }

  // Public shared fetch — returns one read-only project, nothing else.
  if (req.method === 'GET' && url.pathname.startsWith('/api/baas/shared/')) {
    const token = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    const row = await findShared(token)
    if (!row) { send(res, 404, { error: 'Project not found' }); return }
    send(res, 200, { name: row.name, files: row.files })
    return
  }

  // Everything below (except health/shared) needs auth.
  const needsAuth = url.pathname.startsWith('/api/broker/') || url.pathname.startsWith('/api/baas/')
  let uid = null
  if (needsAuth) {
    try { uid = await verifyUser(req) } catch (e) { send(res, e.status ?? 401, { error: e.message }); return }
  }

  try {
    // ---- BaaS: projects ----
    if (req.method === 'GET' && url.pathname === '/api/baas/projects') {
      send(res, 200, await listProjects(uid)); return
    }
    if (req.method === 'POST' && url.pathname === '/api/baas/projects') {
      const body = await readJson(req)
      const id = crypto.randomUUID()
      const row = { id, name: String(body.name ?? 'untitled'), files: body.files ?? {}, share_token: null, updated_at: new Date().toISOString(), owner_id: uid }
      await writeProject(uid, row)
      send(res, 200, { id }); return
    }
    const pm = url.pathname.match(/^\/api\/baas\/projects\/([^/]+)$/)
    if (pm) {
      const id = decodeURIComponent(pm[1])
      if (!safeSeg(id, null) && !/^[0-9a-f-]{36}$/.test(id)) { send(res, 400, { error: 'Invalid project id.' }); return }
      if (req.method === 'GET') {
        const row = await readProject(uid, id)
        if (!row) { send(res, 404, { error: 'Project not found' }); return }
        send(res, 200, row); return
      }
      if (req.method === 'PUT') {
        const body = await readJson(req)
        const prev = (await readProject(uid, id)) ?? { id, owner_id: uid, share_token: null }
        const row = { ...prev, name: String(body.name ?? prev.name ?? 'untitled'), files: body.files ?? prev.files ?? {}, updated_at: new Date().toISOString(), owner_id: uid }
        await writeProject(uid, row)
        send(res, 200, { ok: true }); return
      }
      if (req.method === 'DELETE') {
        try { await fs.rm(projFile(uid, id), { force: true }) } catch {}
        send(res, 200, { ok: true }); return
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/baas/share') {
      const body = await readJson(req)
      const row = await readProject(uid, body.id)
      if (!row) { send(res, 404, { error: 'Project not found' }); return }
      if (!body.shared) {
        await writeProject(uid, { ...row, share_token: null })
        send(res, 200, { token: null }); return
      }
      const token = crypto.randomUUID()
      await writeProject(uid, { ...row, share_token: token })
      send(res, 200, { token }); return
    }

    // ---- broker ----
    if (req.method === 'POST' && url.pathname === '/api/broker/open') {
      send(res, 200, { state: 'ready', stage: 'ready', cells: CELLS_CONFIGURED }); return
    }
    if (req.method === 'POST' && url.pathname === '/api/broker/stop') {
      send(res, 200, { ok: true }); return
    }
    if (req.method === 'POST' && url.pathname === '/api/broker/terminal-token') {
      const body = await readJson(req)
      const workspaceId = safeSeg(body.workspaceId ?? 'default') ?? 'default'
      if (cellsConfigured()) {
        try {
          const d = driver()
          const { sessionId } = await d.ensureSession({ externalId: `${uid}:${workspaceId}` })
          const t = await d.terminalToken({ sessionId })
          send(res, 200, { token: t.token, expiresInSec: t.expiresInSec, gatewayUrl: t.gatewayUrl ?? undefined }); return
        } catch (e) {
          send(res, e.status ?? 502, { error: e.message }); return
        }
      }
      const token = crypto.randomBytes(24).toString('hex')
      termTokens.set(token, { uid, workspaceId, exp: Date.now() + 60_000 })
      send(res, 200, { token, expiresInSec: 60 }); return
    }
    if (req.method === 'GET' && url.pathname === '/api/broker/preview') {
      const workspaceId = safeSeg(url.searchParams.get('workspaceId') ?? 'default') ?? 'default'
      const port = Number(url.searchParams.get('port') ?? 3000)
      if (cellsConfigured()) {
        try {
          const d = driver()
          const { sessionId } = await d.ensureSession({ externalId: `${uid}:${workspaceId}` })
          const p = await d.preview({ sessionId, port })
          send(res, 200, p); return
        } catch {
          // No dev server yet — browser falls back to srcDoc preview.
          send(res, 200, { url: null, access: 'private-token' }); return
        }
      }
      send(res, 200, { url: null, access: 'private-token' }); return
    }
    if (req.method === 'POST' && url.pathname === '/api/broker/run') {
      if (!rateOk(`run:${uid}`, RATE_RUN_MIN)) { send(res, 429, { error: 'Too many runs. Slow down.' }); return }
      if (dailyCount(uid) >= DAILY_RUN_CAP) { send(res, 402, { error: 'Run time used up for today — try again tomorrow or ask for a higher quota.' }); return }
      const body = await readJson(req)
      const workspaceId = safeSeg(body.workspaceId ?? 'default') ?? 'default'
      void workspaceId
      if (body.files && typeof body.files === 'object') {
        for (const p of Object.keys(body.files)) {
          if (!cleanRelPath(p) && p !== 'index.html') { send(res, 400, { error: `Unsafe path: ${p}` }); return }
        }
      }
      if (cellsConfigured()) {
        // Live Cell: resume named session (externalId = uid:workspace, so a
        // double-click cannot create two), hash-diff sync, exec, record usage.
        const entry = String(body.entry ?? '')
        const command = commandForEntry(entry)
        if (!command) { send(res, 400, { error: 'Only .py and .go entries are supported (main.py / main.go).' }); return }
        try {
          const d = driver()
          const { sessionId, reused } = await d.ensureSession({ externalId: `${uid}:${workspaceId}` })
          const sync = await d.syncFiles({ sessionId, files: body.files ?? {}, hashStore: hashStoreFor(uid, workspaceId) })
          const result = await d.exec({ sessionId, command, stdin: body.stdin ?? '' })
          bumpDaily(uid)
          console.log(`[zut-broker] run ok uid=${String(uid).slice(0, 8)} cell=${String(sessionId).slice(0, 8)} reused=${reused} sync=+${sync.uploaded} entry=${entry} exit=${result.exitCode} ${result.durationMs}ms`)
          send(res, 200, result); return
        } catch (e) {
          const status = typeof e?.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 502
          send(res, status, { error: e?.message ?? 'Cell run failed' }); return
        }
      }
      const result = await runProgram(body.files ?? {}, body.entry, body.stdin ?? '')
      if (result.error) { send(res, result.status ?? 400, { error: result.error }); return }
      bumpDaily(uid)
      console.log(`[zut-broker] run ok uid=${String(uid).slice(0, 8)} entry=${body.entry} exit=${result.exitCode} ${result.durationMs}ms`)
      send(res, 200, result); return
    }

    send(res, 404, { error: 'Not found' })
  } catch (e) {
    send(res, e.status ?? 500, { error: e?.message ?? 'Broker failed' })
  }
})

await fs.mkdir(DATA_ROOT, { recursive: true })
server.listen(PORT, HOST, () => {
  console.log(`zut-broker v${VERSION} on http://${HOST}:${PORT} (data ${DATA_ROOT}, cells ${CELLS_CONFIGURED ? 'on' : 'demo-local'}, dev-anon ${DEV_ALLOW_ANON ? 'on' : 'off'})`)
  if (!SUPABASE_URL && !DEV_ALLOW_ANON) console.warn('[zut-broker] WARNING: no SUPABASE_URL — protected routes will 503 until auth is configured.')
})
