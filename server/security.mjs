// Shared hardening primitives for the self-hosted Node services.
//
// These are deliberately dependency-free and pure enough to unit test. Both
// `runtime/server.mjs` and `broker/server.mjs` use them so the two services
// cannot drift apart on path handling, exposure checks, or child-process env.

import crypto from 'node:crypto'
import path from 'node:path'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/** True for the interfaces that are not reachable from another machine. */
export function isLoopbackHost(host) {
  return LOOPBACK.has(String(host ?? '').trim().toLowerCase())
}

/**
 * Reject an exposed bind unless it is authenticated. This turns the old
 * warning into a startup error so a misconfigured deploy cannot expose an
 * unauthenticated code-execution endpoint by accident.
 */
export function assertSafeExposure({ service, host, token, devAllowAnon = false, allowInsecure = false }) {
  if (isLoopbackHost(host) || allowInsecure) return
  if (devAllowAnon) {
    throw new Error(
      `${service}: refusing to bind ${host} with anonymous dev auth enabled. ` +
        `Set a real auth backend, bind 127.0.0.1, or set ZUT_ALLOW_INSECURE_EXPOSURE=1 for a throwaway host.`,
    )
  }
  if (!token) {
    throw new Error(
      `${service}: refusing to bind ${host} without auth. ` +
        `Set ZUT_RUNTIME_TOKEN, bind 127.0.0.1, or set ZUT_ALLOW_INSECURE_EXPOSURE=1 for a throwaway host.`,
    )
  }
}

/** Parse a `CORS_ORIGIN` value into a matcher. `*` is explicit opt-in. */
export function parseOrigins(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { allowAny: false, allowed: [] }
  if (raw === '*') return { allowAny: true, allowed: [] }
  return {
    allowAny: false,
    allowed: raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }
}

/** Emit an allow-origin header only for an origin we actually trust. */
export function corsHeadersFor(req, { allowAny = false, allowed = [] } = {}) {
  const origin = req.headers.origin
  const allow = origin && (allowAny || allowed.includes(origin)) ? origin : null
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
  if (allow) headers['Access-Control-Allow-Origin'] = allow
  return headers
}

/** Constant-time bearer comparison (length mismatch still returns false). */
export function safeTokenEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Canonicalise a project-relative path, or return null when it could escape
 * the temp workspace. Handles backslashes, absolute paths, drive letters,
 * dot segments, and NUL bytes.
 */
export function safeRelativePath(value) {
  if (typeof value !== 'string') return null
  if (value === '' || value.includes('\0')) return null
  const slashed = value.replace(/\\/g, '/')
  if (slashed.startsWith('/') || slashed.startsWith('//') || /^[A-Za-z]:/.test(slashed)) return null
  const clean = path.posix.normalize(slashed)
  if (clean === '' || clean === '.' || clean === '..' || clean.startsWith('../')) return null
  if (clean.split('/').includes('..')) return null
  return clean
}

/** Per-key sliding-window limiter. A non-positive limit disables it. */
export function createRateLimiter({ limit, windowMs = 60_000, maxKeys = 10_000 }) {
  if (!Number.isFinite(limit) || limit <= 0) return () => true
  const hits = new Map()
  return function allow(key) {
    const id = String(key ?? 'unknown')
    const now = Date.now()
    const arr = (hits.get(id) ?? []).filter((t) => now - t < windowMs)
    if (arr.length >= limit) {
      hits.set(id, arr)
      return false
    }
    arr.push(now)
    hits.set(id, arr)
    if (hits.size > maxKeys) {
      for (const [k, times] of hits) {
        if (times.length === 0 || now - times[times.length - 1] >= windowMs) hits.delete(k)
      }
    }
    return true
  }
}

/** Client address for rate limiting. Only trust XFF when explicitly enabled. */
export function clientKey(req, trustProxy = false) {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for']
    const first = typeof xff === 'string' ? xff.split(',')[0].trim() : ''
    if (first) return first
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

/**
 * Bounded concurrency gate. `release()` hands the slot directly to the next
 * waiter so two callers can never occupy one slot.
 */
export function createSemaphore(max, queueLimit = 100) {
  const size = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1
  let active = 0
  const waiters = []
  return {
    get active() {
      return active
    },
    async acquire(timeoutMs = 30_000) {
      if (active < size) {
        active += 1
        return
      }
      if (waiters.length >= queueLimit) {
        throw Object.assign(new Error('Server busy — try again shortly.'), { status: 429 })
      }
      await new Promise((resolve, reject) => {
        const waiter = { resolve, timer: null }
        waiter.timer = setTimeout(() => {
          const i = waiters.indexOf(waiter)
          if (i >= 0) waiters.splice(i, 1)
          reject(Object.assign(new Error('Server busy — try again shortly.'), { status: 429 }))
        }, timeoutMs)
        waiters.push(waiter)
      })
    },
    release() {
      const next = waiters.shift()
      if (next) {
        clearTimeout(next.timer)
        next.resolve()
      } else {
        active = Math.max(0, active - 1)
      }
    },
  }
}

/**
 * Minimal environment for user code. In particular, never inherit the
 * service's own env: otherwise submitted programs can read broker/cloud
 * credentials (SUPABASE_SERVICE_ROLE_KEY, MUDBASE keys, tokens).
 */
export function sandboxEnv(home) {
  const env = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: home,
    TMPDIR: home,
    TMP: home,
    TEMP: home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    GOCACHE: path.join(home, '.cache', 'go-build'),
    GOPATH: path.join(home, 'go'),
    GO111MODULE: 'on',
  }
  if (process.platform === 'win32') {
    Object.assign(env, {
      SystemRoot: process.env.SystemRoot,
      ComSpec: process.env.ComSpec,
      PATHEXT: process.env.PATHEXT,
    })
  }
  return env
}

/** Kill a spawned child and anything it spawned on POSIX. */
export function killProcessTree(child) {
  if (!child) return
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, 'SIGKILL')
      return
    }
  } catch {
    /* fall through to the direct kill */
  }
  try {
    child.kill('SIGKILL')
  } catch {
    /* already gone */
  }
}
