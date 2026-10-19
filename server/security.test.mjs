import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertSafeExposure,
  clientKey,
  corsHeadersFor,
  createRateLimiter,
  createSemaphore,
  isLoopbackHost,
  killProcessTree,
  parseOrigins,
  safeRelativePath,
  safeTokenEqual,
  sandboxEnv,
} from './security.mjs'

describe('exposure guard', () => {
  it('treats loopback hosts as safe', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]', ' LOCALHOST ']) {
      expect(isLoopbackHost(host)).toBe(true)
    }
    for (const host of ['0.0.0.0', '10.0.0.1', 'example.com', '']) {
      expect(isLoopbackHost(host)).toBe(false)
    }
  })

  it('allows loopback without auth but refuses exposed binds', () => {
    expect(() => assertSafeExposure({ service: 'x', host: '127.0.0.1' })).not.toThrow()
    expect(() => assertSafeExposure({ service: 'x', host: '0.0.0.0' })).toThrow(/refusing to bind/)
    expect(() => assertSafeExposure({ service: 'x', host: '0.0.0.0', token: 'secret' })).not.toThrow()
    expect(() =>
      assertSafeExposure({ service: 'x', host: '0.0.0.0', devAllowAnon: true }),
    ).toThrow(/anonymous dev auth/)
    expect(() =>
      assertSafeExposure({ service: 'x', host: '0.0.0.0', allowInsecure: true }),
    ).not.toThrow()
  })
})

describe('CORS', () => {
  const req = (origin) => ({ headers: origin ? { origin } : {} })

  it('only echoes configured origins', () => {
    const opts = parseOrigins('https://a.example, https://b.example')
    expect(corsHeadersFor(req('https://a.example'), opts)['Access-Control-Allow-Origin']).toBe(
      'https://a.example',
    )
    expect(corsHeadersFor(req('https://evil.example'), opts)['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeadersFor(req(undefined), opts)['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('honours an explicit wildcard without emitting a literal *', () => {
    const opts = parseOrigins('*')
    expect(opts.allowAny).toBe(true)
    expect(corsHeadersFor(req('https://any.example'), opts)['Access-Control-Allow-Origin']).toBe(
      'https://any.example',
    )
  })
})

describe('paths and tokens', () => {
  it('normalises safe project paths', () => {
    expect(safeRelativePath('a/./b')).toBe('a/b')
    expect(safeRelativePath('./main.py')).toBe('main.py')
    expect(safeRelativePath('a/../b')).toBe('b')
    expect(safeRelativePath('dir\\file.py')).toBe('dir/file.py')
  })

  it('rejects escaping or absolute paths', () => {
    for (const bad of ['', '.', '..', '../x', 'a/../../x', '/etc/passwd', '//server/share', 'C:/x', 'c:\\x', 'a\0b']) {
      expect(safeRelativePath(bad), bad).toBeNull()
    }
  })

  it('compares tokens without leaking length', () => {
    expect(safeTokenEqual('abc', 'abc')).toBe(true)
    expect(safeTokenEqual('abc', 'abd')).toBe(false)
    expect(safeTokenEqual('abc', 'abcd')).toBe(false)
    expect(safeTokenEqual(undefined, 'abc')).toBe(false)
  })
})

describe('limits', () => {
  it('rate limits per key within the window', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 60_000 })
    expect(allow('a')).toBe(true)
    expect(allow('a')).toBe(true)
    expect(allow('a')).toBe(false)
    expect(allow('b')).toBe(true)
  })

  it('disables rate limiting for non-positive limits', () => {
    const allow = createRateLimiter({ limit: 0 })
    for (let i = 0; i < 10; i += 1) expect(allow('a')).toBe(true)
  })

  it('hands a released slot directly to the next waiter', async () => {
    const gate = createSemaphore(1)
    await gate.acquire()
    let third = false
    const waiting = gate.acquire().then(() => {
      third = true
    })
    await Promise.resolve()
    expect(third).toBe(false)
    expect(gate.active).toBe(1)
    gate.release()
    await waiting
    expect(third).toBe(true)
    expect(gate.active).toBe(1)
    gate.release()
    expect(gate.active).toBe(0)
  })

  it('rejects when the queue is full', async () => {
    const gate = createSemaphore(1, 0)
    await gate.acquire()
    await expect(gate.acquire()).rejects.toThrow(/busy/)
  })

  it('uses the socket address unless proxy trust is enabled', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.2' } }
    expect(clientKey(req)).toBe('10.0.0.2')
    expect(clientKey(req, true)).toBe('203.0.113.9')
  })
})

describe('child process isolation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not leak service secrets into user programs', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'super-secret')
    vi.stubEnv('ZUT_MUDBASE_API_KEY', 'mudbase-secret')
    const env = sandboxEnv('/tmp/work')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
    expect(env.ZUT_MUDBASE_API_KEY).toBeUndefined()
    expect(env.HOME).toBe('/tmp/work')
    expect(env.PATH).toBeTruthy()
  })

  it('is a no-op for a missing child', () => {
    expect(() => killProcessTree(null)).not.toThrow()
  })
})
