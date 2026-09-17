import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Pins the remote/local contract: build errors must surface as BUILD_FAILED
 *  (handled by formatBuildErrors), network problems as REMOTE_UNREACHABLE
 *  (handled by falling back to the in-browser runner). */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function loadRuntime(url: string | undefined) {
  vi.resetModules()
  if (url === undefined) vi.stubEnv('VITE_RUNTIME_URL', '')
  else vi.stubEnv('VITE_RUNTIME_URL', url)
  return await import('./runtime')
}

const FILES = { 'index.html': '<script src="a.js"></script>', 'a.js': 'export const x = 1' }

describe('remote runtime client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns the bundle on success', async () => {
    const r = await loadRuntime('http://runtime.test')
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ js: 'js', css: 'css', referenced: ['a.js'] }))
    await expect(r.bundleProjectRemote(FILES)).resolves.toEqual({ js: 'js', css: 'css', referenced: ['a.js'] })
  })

  it('throws BUILD_FAILED for compile errors', async () => {
    const r = await loadRuntime('http://runtime.test')
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: [{ text: 'Unexpected "="', location: { file: 'x.ts', line: 1 } }] }))
    let err: Error | null = null
    try {
      await r.bundleProjectRemote(FILES)
    } catch (e) {
      err = e as Error
    }
    expect(err?.message.startsWith('BUILD_FAILED:')).toBe(true)
    expect(JSON.parse((err as Error).message.slice('BUILD_FAILED:'.length)).errors).toHaveLength(1)
  })

  it('throws REMOTE_UNREACHABLE on HTTP errors and network failure', async () => {
    const r = await loadRuntime('http://runtime.test')
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
    await expect(r.bundleProjectRemote(FILES)).rejects.toThrow(/^REMOTE_UNREACHABLE:/)

    fetchMock.mockRejectedValueOnce(new Error('connection refused'))
    await expect(r.bundleProjectRemote(FILES)).rejects.toThrow(/^REMOTE_UNREACHABLE:/)
  })

  it('keeps Vue projects on the local runner and disables without a URL', async () => {
    const r = await loadRuntime('http://runtime.test')
    expect(r.canUseRemote({ ...FILES, 'App.vue': '<template/>' })).toBe(false)
    expect(r.canUseRemote(FILES)).toBe(true)

    const off = await loadRuntime(undefined)
    expect(off.runtimeEnabled()).toBe(false)
    expect(off.canUseRemote(FILES)).toBe(false)
  })
})
