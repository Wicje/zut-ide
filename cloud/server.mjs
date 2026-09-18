// zut-cloud — single shippable backend for "Cursor on the cloud".
//
// One Node process (zero npm deps beyond esbuild) that gives weak devices
// (phones, Chromebooks) a full agent + fast builds:
//
//   GET  /health                    -> { ok, service, version, agent }
//   POST /build  { files }          -> { js, css, referenced } | { errors }
//   POST /agent/turn  (auth)        -> { reply, updated, created, deleted }
//
// Auth: Supabase JWT in `Authorization: Bearer <jwt>`.
// Verified server-side via SUPABASE_URL + SUPABASE_ANON_KEY
// (GET /auth/v1/user), cached 60s. No crypto needed, works with
// both legacy HS256 and new asymmetric Supabase keys.
//
// Workspace isolation: /data/<supabase_uid>/<projectId>/.
// The browser FileMap is source of truth; we write it, run
// `opencode run --format json` headless inside it, then diff back.
//
// LLM keys are BYOK: browser sends `X-LLM-Key` + model `provider/model`.
// The key lives only in that request's env, never on disk.
//
// Env:
//   PORT / HOST                  (default 8787 / 127.0.0.1)
//   DATA_ROOT                    (default ./cloud-data)
//   SUPABASE_URL / SUPABASE_ANON_KEY   (required for /agent/*)
//   SUPABASE_SERVICE_ROLE_KEY    (optional: writes usage_meter rows server-side)
//   OPENCODE_BIN                 (default "opencode" in PATH)
//   ZUT_AGENT_MODEL              (default "openrouter/google/gemini-2.5-flash")
//   ZUT_AGENT_AUTO               ("1" passes --auto so files edit w/o prompt)
//   ZUT_AGENT_TIMEOUT_MS         (default 120000)
//   ZUT_AGENT_CONCURRENCY        (default 2 concurrent agent turns; rest queue)
//   ZUT_WORKSPACE_MAX_MB         (default 50MB per user project on disk)
//   ZUT_MAX_BODY                 (default 8MB)
//   ZUT_RATE_BUILD_MIN           (default 30 req/min/IP)
//   ZUT_RATE_AGENT_MIN           (default 10 req/min/user)
//   ZUT_MONTHLY_AGENT_CAP        (default 50 turns/user/month, 0 = unlimited)
//   CORS_ORIGIN                  (default "*", set to your Pages domain)

import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const VERSION = '0.2.0'
const PORT = Number(process.env.PORT ?? process.env.ZUT_CLOUD_PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'
const DATA_ROOT = path.resolve(process.env.DATA_ROOT ?? './cloud-data')
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const OPENCODE_BIN = process.env.OPENCODE_BIN ?? 'opencode'
const DEFAULT_MODEL = process.env.ZUT_AGENT_MODEL ?? 'openrouter/google/gemini-2.5-flash'
const AGENT_AUTO = (process.env.ZUT_AGENT_AUTO ?? '1') === '1'
const AGENT_TIMEOUT = Number(process.env.ZUT_AGENT_TIMEOUT_MS ?? 120_000)
const AGENT_CONCURRENCY = Math.max(1, Number(process.env.ZUT_AGENT_CONCURRENCY ?? 2))
const WORKSPACE_MAX_BYTES = Math.max(1, Number(process.env.ZUT_WORKSPACE_MAX_MB ?? 50)) * 1024 * 1024
const MAX_BODY = Number(process.env.ZUT_MAX_BODY ?? 8 * 1024 * 1024)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'
const MONTHLY_CAP = Number(process.env.ZUT_MONTHLY_AGENT_CAP ?? 50)

// ---- tiny http helpers ----
function cors(res, extra = {}) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-LLM-Key, X-Project-Id, X-Model')
  res.setHeader('Access-Control-Max-Age', '86400')
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v)
}
function send(res, status, body) {
  const payload = JSON.stringify(body)
  cors(res, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.writeHead(status)
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

// ---- rate limiting (in-memory, per-process; fine for 1 VM) ----
const hits = new Map() // key -> number[]
function rateOk(key, perMin) {
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  if (arr.length >= perMin) { hits.set(key, arr); return false }
  arr.push(now); hits.set(key, arr)
  return true
}

// ---- auth: local JWKS verify first (no network, survives Supabase blips),
// then the hosted /auth/v1/user check as fallback (covers legacy HS256
// projects with no JWKS endpoint). Either way the uid is cached 60s. ----
let jwksSet = null
function getJwks() {
  if (!SUPABASE_URL) return null
  if (!jwksSet) {
    try {
      jwksSet = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
    } catch {
      return null
    }
  }
  return jwksSet
}

const authCache = new Map() // token -> { uid, exp }
async function verifyUser(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw Object.assign(new Error('Server missing SUPABASE_URL / SUPABASE_ANON_KEY.'), { status: 503 })
  const h = req.headers.authorization ?? ''
  const m = h.match(/^Bearer (.+)$/)
  if (!m) throw Object.assign(new Error('Sign in required.'), { status: 401 })
  const token = m[1]
  const cached = authCache.get(token)
  if (cached && cached.exp > Date.now()) return cached.uid
  // 1. Local signature check — only Supabase holds the private key.
  try {
    const set = getJwks()
    if (set) {
      const { payload } = await jwtVerify(token, set)
      if (typeof payload?.sub === 'string' && payload.sub && payload.exp * 1000 > Date.now()) {
        authCache.set(token, { uid: payload.sub, exp: Date.now() + 60_000 })
        return payload.sub
      }
    }
  } catch {
    /* fall through to the hosted check */
  }
  // 2. Hosted check.
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw Object.assign(new Error('Invalid or expired session. Sign in again.'), { status: 401 })
  const j = await r.json()
  const uid = j?.id
  if (!uid) throw Object.assign(new Error('Invalid session.'), { status: 401 })
  authCache.set(token, { uid, exp: Date.now() + 60_000 })
  return uid
}

// ---- monthly cap (best-effort file counter; Supabase table is source of truth long-term) ----
const usageDir = () => path.join(DATA_ROOT, '.usage')
async function agentCountThisMonth(uid) {
  try {
    const f = path.join(usageDir(), `${uid}-${new Date().toISOString().slice(0, 7)}.count`)
    return Number(await fs.readFile(f, 'utf8')) || 0
  } catch { return 0 }
}
async function bumpAgentCount(uid) {
  try {
    await fs.mkdir(usageDir(), { recursive: true })
    const f = path.join(usageDir(), `${uid}-${new Date().toISOString().slice(0, 7)}.count`)
    const n = await agentCountThisMonth(uid)
    await fs.writeFile(f, String(n + 1))
  } catch { /* non-fatal */ }
}

/** Durable server-side usage row (service role bypasses RLS; users read their
 *  own rows). Best-effort — the local counter above remains the live gate. */
async function recordUsage(uid, model, ms, inputBytes) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/usage_meter`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ owner_id: uid, model, ms, input_bytes: inputBytes }),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* metering must never fail the turn */ }
}

// ---- agent concurrency gate: N run at once, rest queue (bounded) ----
let activeAgents = 0
const agentQueue = [] // FIFO of () => void
const MAX_QUEUE = 10
async function acquireAgentSlot() {
  if (activeAgents < AGENT_CONCURRENCY) { activeAgents++; return 0 }
  if (agentQueue.length >= MAX_QUEUE) {
    throw Object.assign(new Error('Agent is busy — try again in a minute.'), { status: 429 })
  }
  const queuedAt = Date.now()
  await new Promise((resolve, reject) => {
    const entry = { fire: null, timer: null }
    entry.timer = setTimeout(() => {
      const i = agentQueue.indexOf(entry)
      if (i >= 0) agentQueue.splice(i, 1)
      reject(Object.assign(new Error('Agent queue timed out — try again.'), { status: 429 }))
    }, 90_000)
    entry.fire = () => { clearTimeout(entry.timer); resolve() }
    agentQueue.push(entry)
  })
  activeAgents++
  return Date.now() - queuedAt
}
function releaseAgentSlot() {
  activeAgents = Math.max(0, activeAgents - 1)
  const next = agentQueue.shift()
  if (next) next.fire()
}

/** Byte size of a workspace, following no symlinks (they are never read). */
async function dirSizeBytes(dir) {
  let total = 0
  async function walk(d) {
    let entries = []
    try { entries = await fs.readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile()) {
        try { total += (await fs.stat(full)).size } catch { /* ignore */ }
      }
    }
  }
  await walk(dir)
  return total
}

// ---- workspace isolation ----
function safeSeg(s, fallback = 'default') {
  const v = String(s ?? fallback)
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null
}
function safePath(p) {
  const clean = path.normalize(String(p)).replace(/\\/g, '/')
  if (clean.startsWith('/') || clean.split('/').includes('..') || clean === '' || clean === '.') return null
  if (clean.includes('\0') || clean.startsWith('.usage')) return null
  return clean
}
async function readTree(dir) {
  const out = {}
  async function walk(d) {
    let entries = []
    try { entries = await fs.readdir(d, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === '.opencode') continue
    if (e.isSymbolicLink()) continue // never follow agent-created symlinks
    const full = path.join(d, e.name)
      const rel = path.relative(dir, full).replace(/\\/g, '/')
      if (e.isDirectory()) await walk(full)
      else if (e.isFile()) {
        try {
          const st = await fs.stat(full)
          if (st.size > 512 * 1024) continue
          out[rel] = await fs.readFile(full, 'utf8')
        } catch { /* skip binary */ }
      }
    }
  }
  await walk(dir)
  return out
}

// ---- esbuild bundler (mirrors src/lib/runner.ts + runtime/server.mjs) ----
function resolvePath(from, ref) {
  const base = from.startsWith('/') ? from : '/' + from
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '/'
  const target = ref.startsWith('/') ? ref : dir + ref
  const parts = []
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}
function collectReferences(html) {
  const seen = new Set(); const out = []
  for (const m of html.matchAll(/<link\b[^>]*?rel\s*=\s*["']?stylesheet["']?[^>]*?>/gi)) {
    const h = m[0].match(/\shref\s*=\s*["']?([^"'\s>]+)["']?/i)
    if (h && !/^https?:/.test(h[1])) { const f = resolvePath('/index.html', h[1]).slice(1); if (!seen.has(f)) { seen.add(f); out.push(f) } }
  }
  for (const m of html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*\/>/gi)) {
    const s = m[0].match(/\ssrc\s*=\s*["']?([^"'\s>]+)["']?/i)
    if (s && !/^https?:/.test(s[1])) { const f = resolvePath('/index.html', s[1]).slice(1); if (!seen.has(f)) { seen.add(f); out.push(f) } }
  }
  return out
}
function vfsPlugin(files) {
  return {
    name: 'zut-cloud-vfs',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (/^(https?:)?\/\//.test(args.path) || /^[a-z]+:/.test(args.path)) return { path: args.path, external: true }
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) return { path: `https://esm.sh/${args.path}`, external: true }
        const q = args.path.indexOf('?')
        const clean = q >= 0 ? args.path.slice(0, q) : args.path
        const query = q >= 0 ? args.path.slice(q) : ''
        const base = args.resolveDir ? args.resolveDir.replace(/\/?$/, '/') : '/index.html'
        const resolved = resolvePath(base, clean)
        if (!(resolved.slice(1) in files)) return { errors: [{ text: `Could not resolve "${args.path}" (not in this project)` }] }
        return { path: resolved + query, namespace: 'zut-vfs' }
      })
      b.onLoad({ filter: /.*/, namespace: 'zut-vfs' }, (args) => {
        const key = args.path.slice(1)
        if (key.endsWith('.vue')) return { errors: [{ text: `Vue SFCs build in the browser — the app falls back automatically.` }] }
        const source = files[key] ?? ''
        let loader = 'js'
        if (key.endsWith('.tsx')) loader = 'tsx'
        else if (key.endsWith('.ts') || key.endsWith('.mts')) loader = 'ts'
        else if (key.endsWith('.jsx')) loader = 'jsx'
        else if (key.endsWith('.css')) loader = 'css'
        else if (key.endsWith('.json')) loader = 'json'
        return { contents: source, loader, resolveDir: '/' }
      })
    },
  }
}
async function bundleProject(files) {
  if (!files || typeof files !== 'object') return { errors: [{ text: 'Request must include a `files` object.' }] }
  if (files['index.html'] === undefined) return { errors: [{ text: 'No index.html found.' }] }
  const refs = collectReferences(files['index.html'])
  try {
    const result = await build({
      stdin: { contents: refs.map((r) => `import './${r}';`).join('\n'), resolveDir: '/', sourcefile: '<stdin>', loader: 'js' },
      bundle: true, format: 'esm', platform: 'browser', target: ['es2020'],
      outfile: 'out.js', write: false, logLevel: 'silent', plugins: [vfsPlugin(files)],
    })
    let js = '', css = ''
    for (const o of result.outputFiles) {
      const t = Buffer.from(o.contents).toString('utf8')
      if (o.path.endsWith('.css')) css += t; else js += t
    }
    return { js, css, referenced: refs }
  } catch (e) {
    const list = Array.isArray(e?.errors) && e.errors.length ? e.errors : [e]
    return { errors: list.map((x) => x?.location ? { text: x.text ?? String(x), location: { file: x.location.file, line: x.location.line, column: x.location.column } } : { text: x?.text ?? x?.message ?? String(x) }) }
  }
}

// ---- agent turn: write files, run opencode headless, diff back ----
function envForModel(model, llmKey) {
  const env = { ...process.env }
  if (!llmKey) return env
  const provider = String(model ?? '').split('/')[0]
  if (provider === 'openrouter') env.OPENROUTER_API_KEY = llmKey
  else if (provider === 'anthropic') env.ANTHROPIC_API_KEY = llmKey
  else if (provider === 'openai') env.OPENAI_API_KEY = llmKey
  else if (provider === 'gemini' || provider === 'google') { env.GOOGLE_GENERATIVE_AI_API_KEY = llmKey; env.GEMINI_API_KEY = llmKey }
  else env.OPENROUTER_API_KEY = llmKey
  return env
}
function runOpencode(dir, prompt, model, llmKey) {
  return new Promise((resolve) => {
    const args = ['run', '--format', 'json', '--dir', dir, '-m', model]
    if (AGENT_AUTO) args.push('--auto')
    args.push(prompt.slice(0, 8000))
    const child = spawn(OPENCODE_BIN, args, { cwd: dir, env: envForModel(model, llmKey), timeout: AGENT_TIMEOUT })
    let out = '', err = ''
    const kill = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, AGENT_TIMEOUT + 5000)
    child.stdout?.on('data', (d) => { out += d.toString(); if (out.length > 512 * 1024) out = out.slice(-512 * 1024) })
    child.stderr?.on('data', (d) => { err += d.toString(); if (err.length > 128 * 1024) err = err.slice(-128 * 1024) })
    child.on('error', (e) => { clearTimeout(kill); resolve({ ok: false, error: `Agent binary failed: ${e.message}. Is opencode installed?` }) })
    child.on('close', (code) => {
      clearTimeout(kill)
      // Parse last assistant text from json event stream (best-effort)
      let reply = ''
      for (const line of out.split('\n')) {
        const t = line.trim(); if (!t.startsWith('{')) continue
        try {
          const j = JSON.parse(t)
          const txt = j?.part?.text ?? j?.text ?? j?.message?.text ?? ''
          if (typeof txt === 'string' && txt) reply = txt
        } catch { /* not json line */ }
      }
      if (!reply) reply = out.slice(-4000) || err.slice(-2000) || `(agent exited ${code})`
      if (code !== 0 && !reply) resolve({ ok: false, error: err.slice(-2000) || `Agent exited ${code}` })
      else resolve({ ok: true, reply: reply.slice(0, 20000) })
    })
  })
}

// ---- router ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const ip = (req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').toString().split(',')[0].trim()

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return }

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { ok: true, service: 'zut-cloud', version: VERSION, agent: true, auth: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) })
    return
  }

  if (req.method === 'POST' && url.pathname === '/build') {
    if (!rateOk(`build:${ip}`, Number(process.env.ZUT_RATE_BUILD_MIN ?? 30))) { send(res, 429, { error: 'Too many builds. Slow down.' }); return }
    try {
      const body = JSON.parse((await readBody(req)) || '{}')
      send(res, 200, await bundleProject(body.files))
    } catch (e) { send(res, 400, { error: e?.message ?? 'Build failed' }) }
    return
  }

  if (req.method === 'POST' && url.pathname === '/agent/turn') {
    let uid
    try { uid = await verifyUser(req) } catch (e) { send(res, e.status ?? 401, { error: e.message }); return }
    if (!rateOk(`agent:${uid}`, Number(process.env.ZUT_RATE_AGENT_MIN ?? 10))) { send(res, 429, { error: 'Too many agent turns. Wait a minute.' }); return }
    if (MONTHLY_CAP > 0 && (await agentCountThisMonth(uid)) >= MONTHLY_CAP) {
      send(res, 402, { error: `Free plan limit reached (${MONTHLY_CAP} agent turns/month). Add your own OpenRouter key for unlimited direct chat, or upgrade.` })
      return
    }
    let body
    try { body = JSON.parse((await readBody(req)) || '{}') } catch { send(res, 400, { error: 'Invalid JSON body.' }); return }
    const { files, prompt, projectId, model } = body ?? {}
    if (!files || typeof files !== 'object') { send(res, 400, { error: 'Expected { files, prompt }.' }); return }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) { send(res, 400, { error: 'Empty prompt.' }); return }
    const pid = safeSeg(projectId ?? 'default')
    if (!pid) { send(res, 400, { error: 'Invalid project id.' }); return }
    for (const p of Object.keys(files)) if (!safePath(p)) { send(res, 400, { error: `Unsafe path: ${p}` }); return }

    const dir = path.join(DATA_ROOT, uid, pid)
    const turnStarted = Date.now()
    try {
      await fs.mkdir(dir, { recursive: true })
      const before = await readTree(dir)
      // Write incoming FileMap (only write/overwrite to avoid data loss).
      let inputBytes = 0
      for (const [p, content] of Object.entries(files)) {
        const t = safePath(p); if (!t) continue
        const full = path.join(dir, t)
        await fs.mkdir(path.dirname(full), { recursive: true })
        await fs.writeFile(full, String(content), 'utf8')
        inputBytes += Buffer.byteLength(String(content))
      }
      if ((await dirSizeBytes(dir)) > WORKSPACE_MAX_BYTES) {
        send(res, 413, { error: `Workspace exceeds the ${Math.round(WORKSPACE_MAX_BYTES / 1024 / 1024)}MB limit — delete files and retry.` })
        return
      }
      // Concurrency gate: bounded parallel agents, bounded queue.
      let queuedMs = 0
      try {
        queuedMs = await acquireAgentSlot()
      } catch (e) { send(res, e.status ?? 429, { error: e.message }); return }
      let r
      try {
        const chosen = typeof model === 'string' && model.includes('/') ? model : DEFAULT_MODEL
        const llmKey = req.headers['x-llm-key']?.toString() ?? ''
        const system = `You are zut, a coding assistant in a browser IDE. The project files are on disk in front of you. Use file tools to MAKE the requested change directly, then briefly summarize. Keep replies short for phone screens.`
        r = await runOpencode(dir, `${system}\n\nUser request: ${prompt}`, chosen, llmKey)
        var chosenModel = chosen
      } finally {
        releaseAgentSlot()
      }
      if (!r.ok) { send(res, 502, { error: r.error }); return }
      const after = await readTree(dir)
      const updated = {}, created = {}
      const deleted = []
      for (const [p, c] of Object.entries(after)) {
        if (p.startsWith('.usage')) continue
        if (!(p in files)) { if (!(p in before) || before[p] !== c) created[p] = c }
        else if (files[p] !== c) updated[p] = c
      }
      for (const p of Object.keys(files)) if (!(p in after)) deleted.push(p)
      await bumpAgentCount(uid)
      void recordUsage(uid, chosenModel, Date.now() - turnStarted, inputBytes)
      console.log(`[zut-cloud] agent ok uid=${uid.slice(0, 8)} pid=${pid} +${Object.keys(created).length} ~${Object.keys(updated).length} -${deleted.length} queued=${queuedMs}ms took=${Date.now() - turnStarted}ms`)
      send(res, 200, { reply: r.reply, updated, created, deleted })
    } catch (e) { send(res, e.status ?? 500, { error: e?.message ?? 'Agent turn failed' }) }
    return
  }

  send(res, 404, { error: 'Not found' })
})

await fs.mkdir(DATA_ROOT, { recursive: true })
server.listen(PORT, HOST, () => {
  console.log(`zut-cloud v${VERSION} on http://${HOST}:${PORT} (data ${DATA_ROOT}, agent ${OPENCODE_BIN}, cap ${MONTHLY_CAP}/mo)`)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.warn('[zut-cloud] WARNING: SUPABASE_URL/ANON_KEY missing — /agent/* will 503.')
  if (['0.0.0.0', '::'].includes(HOST)) console.warn('[zut-cloud] bound to all interfaces — run behind Caddy with TLS.')
})
