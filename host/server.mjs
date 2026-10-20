// zut-host — one process for self-hosted and hosted workspaces.
//
//   npm run host                 (selfhost, loopback, anon allowed)
//   ZUT_HOST_MODE=hosted ...     (jail terminal, token required when exposed)
//
//   GET  /health
//   GET  /api/workspace          -> { files, skipped, bytes }
//   PUT  /api/workspace          <- { files, deletes } (text only)
//   GET  /api/git/status|diff|log|branches
//   POST /api/git/init|commit|checkout
//   WS   /terminal?token=…       <- JSON {type:'input'|'resize', …}
//
// Auth: ZUT_HOST_TOKEN (Bearer, x-zut-token, or ?token= for the socket).
// With no token, only a loopback bind is allowed.
//
// Env:
//   PORT / ZUT_HOST_PORT          (default 8790)
//   HOST                          (default 127.0.0.1)
//   ZUT_HOST_MODE                 selfhost | hosted (default selfhost)
//   ZUT_WORKSPACE                 workspace root
//   ZUT_HOST_TOKEN                shared token
//   ZUT_TERMINAL_JAIL             1 = sandboxed env + cwd pinned (default: hosted)
//   ZUT_TERMINAL_MAX_SESSIONS     (default 4)
//   ZUT_TERMINAL_IDLE_MS          (default 30 min)
//   ZUT_HOST_STATIC               path to built dist (default ./dist)
//   CORS_ORIGIN                   extra allowed origins (comma separated)

import http from 'node:http'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { WebSocketServer } from 'ws'
import {
  assertSafeExposure,
  clientKey,
  corsHeadersFor,
  isLoopbackHost,
  parseOrigins,
  safeTokenEqual,
  sandboxEnv,
} from '../server/security.mjs'
import { clampInt, isIgnoredPath } from './lib.mjs'
import { ensureWorkspace, readWorkspace, workspaceStamp, writeWorkspace } from './files.mjs'
import * as git from './git.mjs'
import { DebugSession } from './debug.mjs'

const VERSION = '0.1.0'
const MODE = process.env.ZUT_HOST_MODE === 'hosted' ? 'hosted' : 'selfhost'
const PORT = Number(process.env.PORT ?? process.env.ZUT_HOST_PORT ?? 8790)
const HOST = process.env.HOST ?? '127.0.0.1'
const TOKEN = process.env.ZUT_HOST_TOKEN ?? ''
const WORKSPACE = path.resolve(process.env.ZUT_WORKSPACE ?? path.join(os.homedir(), '.zut-projects', 'default'))
const JAIL = process.env.ZUT_TERMINAL_JAIL
  ? process.env.ZUT_TERMINAL_JAIL === '1'
  : MODE === 'hosted' || !isLoopbackHost(HOST)
const MAX_SESSIONS = clampInt(process.env.ZUT_TERMINAL_MAX_SESSIONS, 4, 1, 32)
const IDLE_MS = clampInt(process.env.ZUT_TERMINAL_IDLE_MS, 30 * 60_000, 60_000, 8 * 60 * 60_000)
const MAX_BODY = 32 * 1024 * 1024
const MAX_WS_MESSAGE = 1024 * 1024
const STATIC_ROOT = path.resolve(process.env.ZUT_HOST_STATIC ?? 'dist')
const ORIGINS = parseOrigins(process.env.CORS_ORIGIN)

assertSafeExposure({
  service: 'zut-host',
  host: HOST,
  token: TOKEN,
  devAllowAnon: MODE === 'selfhost' && !TOKEN,
})

let pty = null
try {
  pty = await import('node-pty')
} catch (e) {
  console.warn(`zut-host: terminal disabled (node-pty failed to load: ${e.message})`)
}

let gitAvailable = false
try {
  const { execFile } = await import('node:child_process')
  await new Promise((resolve) => execFile('git', ['--version'], (err) => resolve(!err)))
  gitAvailable = true
} catch {
  gitAvailable = false
}

await ensureWorkspace(WORKSPACE)

function send(res, status, body, extra = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...extra,
  })
  res.end(payload)
}

function isLoopbackOrigin(origin) {
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

function cors(req, res) {
  const headers = corsHeadersFor(req, ORIGINS)
  // Local dev: the IDE runs on :5173/:4173 and the host on :8790, so allow
  // any loopback origin unless CORS_ORIGIN was set explicitly.
  const origin = req.headers.origin
  if (origin && !headers['Access-Control-Allow-Origin'] && !process.env.CORS_ORIGIN && isLoopbackOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
}

function originAllowed(req) {
  const origin = req.headers.origin
  if (!origin) return true
  const host = req.headers.host
  try {
    const u = new URL(origin)
    if (host && u.host === host) return true
  } catch {
    return false
  }
  return ORIGINS.allowAny || ORIGINS.allowed.includes(origin) || (!process.env.CORS_ORIGIN && isLoopbackOrigin(origin))
}

function authorized(req, url) {
  if (!TOKEN) return true
  const header = req.headers.authorization ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const alt = typeof req.headers['x-zut-token'] === 'string' ? req.headers['x-zut-token'] : ''
  const query = url?.searchParams.get('token') ?? ''
  return safeTokenEqual(bearer || alt || query, TOKEN)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readJson(req) {
  const raw = await readBody(req)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.')
    return value
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 })
  }
}

const sessions = new Set()
const sessionsByKey = new Map()
let debugSession = null

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  if (rel.split('/').includes('..')) return send(res, 403, { error: 'Forbidden.' })
  const target = path.resolve(STATIC_ROOT, `.${rel}`)
  if (target !== STATIC_ROOT && !target.startsWith(STATIC_ROOT + path.sep)) {
    return send(res, 403, { error: 'Forbidden.' })
  }
  let stat = null
  try {
    stat = await fs.stat(target)
  } catch {
    /* fall through to SPA */
  }
  if (stat?.isDirectory()) {
    const index = path.join(target, 'index.html')
    return serveFile(res, index)
  }
  if (stat?.isFile()) return serveFile(res, target)
  if (req.headers.accept?.includes('text/html')) return serveFile(res, path.join(STATIC_ROOT, 'index.html'))
  return send(res, 404, { error: 'Not found.' })
}

async function serveFile(res, file) {
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) return send(res, 404, { error: 'Not found.' })
    const ext = path.extname(file).toLowerCase()
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.map': 'application/json; charset=utf-8',
    }
    res.writeHead(200, {
      'Content-Type': types[ext] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(file).pipe(res)
  } catch {
    send(res, 404, { error: 'Not found.' })
  }
}

async function route(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const pathname = url.pathname

  if (req.method === 'OPTIONS') {
    cors(req, res)
    res.writeHead(204)
    res.end()
    return
  }

  const needsAuth = pathname === '/health' ? false : true
  if (needsAuth) {
    if (!originAllowed(req)) {
      const origin = req.headers.origin ?? '(none)'
      return send(res, 403, {
        error: `Origin not allowed (${origin}). Set CORS_ORIGIN on the host to include this site.`,
      })
    }
    if (!authorized(req, url)) return send(res, 401, { error: 'Missing or bad ZUT_HOST_TOKEN.' })
  }

  if (pathname === '/health') {
    const repo = gitAvailable ? await git.isGitRepo(WORKSPACE) : false
    // /health stays reachable for "Test" in the connect dialog, but the
    // absolute workspace path is only revealed to an authenticated caller.
    return send(res, 200, {
      ok: true,
      service: 'zut-host',
      version: VERSION,
      mode: MODE,
      ...(authorized(req, url) ? { workspace: WORKSPACE } : {}),
      terminal: Boolean(pty),
      git: gitAvailable,
      debug: true,
      repo,
      jail: JAIL,
    })
  }

  if (pathname === '/api/workspace') {
    if (req.method === 'GET') {
      return send(res, 200, await readWorkspace(WORKSPACE))
    }
    if (req.method === 'PUT') {
      const body = await readJson(req)
      const files = body.files
      if (!files || typeof files !== 'object' || Array.isArray(files)) {
        return send(res, 400, { error: '`files` must be an object of path → text.' })
      }
      const deletes = Array.isArray(body.deletes) ? body.deletes.filter((p) => typeof p === 'string') : []
      const result = await writeWorkspace(WORKSPACE, files, deletes)
      return send(res, 200, { ok: true, ...result })
    }
    return send(res, 405, { error: 'Method not allowed.' })
  }

  // Cheap fingerprint for external-change detection. Never sends file bodies.
  if (pathname === '/api/workspace/stamp') {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' })
    return send(res, 200, { stamp: await workspaceStamp(WORKSPACE) })
  }

  if (pathname.startsWith('/api/git/')) {
    if (!gitAvailable) return send(res, 503, { error: 'git is not installed on this host.' })
    const action = pathname.slice('/api/git/'.length)
    if (req.method === 'GET') {
      if (action === 'status') return send(res, 200, await git.status(WORKSPACE))
      if (action === 'diff') {
        const relPath = url.searchParams.get('path') ?? undefined
        if (relPath && isIgnoredPath(relPath)) return send(res, 400, { ok: false, error: 'Ignored path.' })
        return send(res, 200, await git.diff(WORKSPACE, { path: relPath, staged: url.searchParams.get('staged') === '1' }))
      }
      if (action === 'log') return send(res, 200, await git.log(WORKSPACE, url.searchParams.get('limit') ?? 20))
      if (action === 'branches') return send(res, 200, await git.branches(WORKSPACE))
    }
    if (req.method === 'POST') {
      const body = await readJson(req)
      if (action === 'init') return send(res, 200, await git.init(WORKSPACE))
      if (action === 'commit') return send(res, 200, await git.commit(WORKSPACE, body.message))
      if (action === 'checkout') {
        return send(res, 200, await git.checkout(WORKSPACE, body.name, Boolean(body.create)))
      }
    }
    return send(res, 404, { error: 'Unknown git route.' })
  }

  if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found.' })

  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname)
  return send(res, 405, { error: 'Method not allowed.' })
}

const server = http.createServer((req, res) => {
  cors(req, res)
  route(req, res).catch((e) => {
    const status = Number(e?.status) || 500
    const message = status >= 500 ? 'Host error.' : e.message
    if (status >= 500) console.error('zut-host:', e)
    if (!res.headersSent) send(res, status, { error: message })
    else res.end()
  })
})

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_MESSAGE })
const wssDebug = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_MESSAGE })

function startDebug(ws) {
  // The session this socket started. Closing an unrelated debug socket must
  // never stop a session owned by another connection.
  let owned = null
  const reply = (id, body) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'result', id, ...body }))
  }
  ws.on('message', (raw) => {
    void (async () => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      const id = msg?.id
      try {
        if (msg.type === 'start') {
          if (debugSession) throw new Error('A debug session is already running.')
          const session = new DebugSession({
            workspace: WORKSPACE,
            jail: JAIL,
            onEvent: (event) => {
              if (ws.readyState === 1) ws.send(JSON.stringify(event))
              if (event.type === 'closed') {
                if (debugSession === session) debugSession = null
                if (owned === session) owned = null
              }
            },
          })
          debugSession = session
          owned = session
          let result
          try {
            result = await session.start(String(msg.entry ?? ''), msg.stopOnEntry !== false)
          } catch (e) {
            // A failed start must release the slot, otherwise retrying always
            // answers "already running" until the socket disconnects.
            if (debugSession === session) debugSession = null
            if (owned === session) owned = null
            try {
              await session.stop()
            } catch {
              /* already gone */
            }
            throw e
          }
          reply(id, { ok: true, ...result })
          return
        }
        if (!debugSession) throw new Error('No debug session is running.')
        if (msg.type === 'breakpoints') {
          const breakpoints = await debugSession.setBreakpoints(msg.breakpoints)
          reply(id, { ok: true, breakpoints })
          return
        }
        if (msg.type === 'command') {
          const result = await debugSession.command(String(msg.command ?? ''), msg.args ?? {})
          reply(id, { ok: true, result })
          return
        }
        if (msg.type === 'stop') {
          await debugSession.stop()
          reply(id, { ok: true })
          return
        }
        throw new Error(`Unknown debug message: ${msg.type}`)
      } catch (e) {
        reply(id, { ok: false, error: e.message })
      }
    })()
  })
  ws.on('close', () => {
    const current = owned
    owned = null
    if (!current) return
    if (debugSession === current) debugSession = null
    void current.stop()
  })
  ws.on('error', () => ws.close())
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (url.pathname !== '/terminal' && url.pathname !== '/debug') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }
  if (!originAllowed(req) || !authorized(req, url)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  if (url.pathname === '/debug') {
    wssDebug.handleUpgrade(req, socket, head, (ws) => startDebug(ws))
    return
  }
  if (!pty) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
    socket.destroy()
    return
  }
  const key = clientKey(req, process.env.ZUT_TRUST_PROXY === '1')
  if (sessions.size >= MAX_SESSIONS) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
    socket.destroy()
    return
  }
  const used = sessionsByKey.get(key) ?? 0
  if (used >= MAX_SESSIONS) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    sessionsByKey.set(key, used + 1)
    startTerminal(ws, key)
  })
})

function startTerminal(ws, key) {
  const isWin = process.platform === 'win32'
  const shell = process.env.SHELL || (isWin ? 'powershell.exe' : '/bin/bash')
  const args = isWin ? [] : ['-l']
  const env = JAIL
    ? sandboxEnv(WORKSPACE)
    : {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ZUT_HOST: '1',
      }
  if (!JAIL) {
    for (const key of ['ZUT_HOST_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY']) {
      delete env[key]
    }
  }
  const term = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: WORKSPACE,
    env,
  })
  sessions.add(term)

  let closed = false
  let buffer = ''
  let flushTimer = null
  let idle = null

  const flush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (buffer && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'output', data: buffer }))
      buffer = ''
    }
  }
  const resetIdle = () => {
    if (idle) clearTimeout(idle)
    idle = setTimeout(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', reason: 'idle' }))
      ws.close()
    }, IDLE_MS)
  }

  term.onData((data) => {
    buffer += data
    if (buffer.length > 64 * 1024) flush()
    else if (!flushTimer) flushTimer = setTimeout(flush, 8)
  })
  term.onExit(({ exitCode, signal }) => {
    flush()
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', code: exitCode, signal }))
    ws.close()
  })

  ws.send(JSON.stringify({ type: 'ready', shell, cwd: WORKSPACE, pid: term.pid, jail: JAIL }))
  resetIdle()

  ws.on('message', (raw) => {
    resetIdle()
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (msg?.type === 'input' && typeof msg.data === 'string' && msg.data.length <= 64 * 1024) {
      term.write(msg.data)
      return
    }
    if (msg?.type === 'resize') {
      const cols = clampInt(msg.cols, 100, 2, 500)
      const rows = clampInt(msg.rows, 30, 2, 500)
      try {
        term.resize(cols, rows)
      } catch {
        /* pty already exited */
      }
      return
    }
    if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
  })

  const cleanup = () => {
    if (closed) return
    closed = true
    if (flushTimer) clearTimeout(flushTimer)
    if (idle) clearTimeout(idle)
    sessions.delete(term)
    const n = (sessionsByKey.get(key) ?? 1) - 1
    if (n <= 0) sessionsByKey.delete(key)
    else sessionsByKey.set(key, n)
    try {
      term.kill()
    } catch {
      /* already gone */
    }
  }
  ws.on('close', cleanup)
  ws.on('error', cleanup)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`zut-host: ${signal}, shutting down`)
    for (const term of sessions) {
      try {
        term.kill()
      } catch {
        /* already gone */
      }
    }
    void debugSession?.stop()
    wss.close()
    wssDebug.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1500).unref()
  })
}

server.listen(PORT, HOST, () => {
  console.log(
    `zut-host v${VERSION} on http://${HOST}:${PORT} ` +
      `(mode ${MODE}, workspace ${WORKSPACE}, auth ${TOKEN ? 'token' : 'loopback-anon'}, ` +
      `terminal ${pty ? 'on' : 'off'}, git ${gitAvailable ? 'on' : 'off'}, jail ${JAIL ? 'on' : 'off'})`,
  )
  if (MODE === 'hosted' && !TOKEN) {
    console.warn('zut-host: hosted mode without ZUT_HOST_TOKEN is only safe on loopback.')
  }
})
