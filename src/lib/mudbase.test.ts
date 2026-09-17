import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The live API and the spec disagree on envelope shape (`{data}` vs top-level).
 *  These tests pin both, so a deploy panel regression fails loudly. */

const FN = { _id: 'abc123', name: 'smoke', isActive: true }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function loadMudbase() {
  vi.resetModules()
  vi.stubEnv('VITE_MUDBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_MUDBASE_PROJECT_ID', 'test-project')
  vi.stubEnv('VITE_MUDBASE_BASE_URL', 'https://api.example.test')
  vi.stubEnv('VITE_MUDBASE_PROXY_URL', '')
  return await import('./mudbase')
}

/** Proxy mode: the browser holds no key; every call goes to the runtime
 *  service, which returns one normalized shape. */
async function loadMudbaseProxy() {
  vi.resetModules()
  vi.stubEnv('VITE_MUDBASE_API_KEY', '')
  vi.stubEnv('VITE_MUDBASE_PROJECT_ID', '')
  vi.stubEnv('VITE_MUDBASE_PROXY_URL', 'https://runtime.example.test/mudbase')
  vi.stubEnv('VITE_RUNTIME_TOKEN', 'proxy-token')
  return await import('./mudbase')
}

describe('mudbase response shapes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('lists functions from data-wrapped and top-level payloads', async () => {
    const m = await loadMudbase()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { functions: [FN] } }))
    expect(await m.listMudbaseFunctions()).toEqual([FN])

    fetchMock.mockResolvedValueOnce(jsonResponse({ functions: [FN], pagination: {} }))
    expect(await m.listMudbaseFunctions()).toEqual([FN])
  })

  it('creates from either envelope and rejects a missing id', async () => {
    const m = await loadMudbase()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: FN }))
    expect(await m.createMudbaseFunction({ name: 'x', code: 'return 1', trigger: { type: 'webhook', event: 'received' } })).toEqual(FN)

    fetchMock.mockResolvedValueOnce(jsonResponse(FN))
    expect(await m.createMudbaseFunction({ name: 'x', code: 'return 1', trigger: { type: 'webhook', event: 'received' } })).toEqual(FN)

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await expect(
      m.createMudbaseFunction({ name: 'x', code: 'return 1', trigger: { type: 'webhook', event: 'received' } }),
    ).rejects.toThrow()
  })

  it('executes and polls status from either envelope', async () => {
    const m = await loadMudbase()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { executionId: 'e1', status: 'queued' } }))
    expect(await m.executeMudbaseFunction('abc123', { ping: 1 })).toEqual({ executionId: 'e1', status: 'queued' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ executionId: 'e2', status: 'running' }))
    expect(await m.executeMudbaseFunction('abc123', null)).toEqual({ executionId: 'e2', status: 'running' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { status: 'success', result: { ok: true } } }))
    expect(await m.getMudbaseExecutionStatus('abc123', 'e1')).toMatchObject({ status: 'success' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'failed', error: 'boom' }))
    expect(await m.getMudbaseExecutionStatus('abc123', 'e1')).toMatchObject({ status: 'failed' })
  })

  it('reads logs from either envelope', async () => {
    const m = await loadMudbase()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { executions: [{ status: 'success' }] } }))
    expect((await m.getMudbaseLogs('abc123')).executions).toHaveLength(1)

    fetchMock.mockResolvedValueOnce(jsonResponse({ executions: [] }))
    expect((await m.getMudbaseLogs('abc123')).executions).toEqual([])
  })

  it('surfaces API errors with status', async () => {
    const m = await loadMudbase()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 401))
    await expect(m.listMudbaseFunctions()).rejects.toThrow('nope')
  })
})

describe('mudbase proxy mode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('is enabled by the proxy URL alone, with no key in the bundle', async () => {
    const m = await loadMudbaseProxy()
    expect(m.mudbaseProxyEnabled()).toBe(true)
    expect(m.mudbaseEnabled()).toBe(true)
  })

  it('routes list/create/execute/status/logs/webhook through the proxy with auth', async () => {
    const m = await loadMudbaseProxy()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const calls: Array<[string, RequestInit | undefined]> = []
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      if (url.endsWith('/functions?limit=100')) return jsonResponse({ functions: [FN] })
      if (url.endsWith('/functions') && init?.method === 'POST') return jsonResponse(FN)
      if (url.endsWith('/execute')) return jsonResponse({ executionId: 'e1', status: 'queued' })
      if (url.includes('/executions/')) return jsonResponse({ status: 'success', result: { ok: 1 } })
      if (url.includes('/logs')) return jsonResponse({ executions: [] })
      if (url.endsWith('/webhook')) return jsonResponse({ triggered: 1, results: [] })
      return jsonResponse({}, 404)
    })

    expect(await m.listMudbaseFunctions()).toEqual([FN])
    expect(
      await m.createMudbaseFunction({ name: 'x', code: 'return 1', trigger: { type: 'webhook', event: 'received' } }),
    ).toEqual(FN)
    expect(await m.executeMudbaseFunction('abc123', null)).toEqual({ executionId: 'e1', status: 'queued' })
    expect(await m.getMudbaseExecutionStatus('abc123', 'e1')).toMatchObject({ status: 'success' })
    expect((await m.getMudbaseLogs('abc123')).executions).toEqual([])
    expect(await m.invokeMudbaseWebhook({})).toEqual({ triggered: 1, results: [] })

    expect(calls.length).toBeGreaterThan(0)
    for (const [url, init] of calls) {
      expect(url.startsWith('https://runtime.example.test/mudbase/')).toBe(true)
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer proxy-token')
    }
  })
})
